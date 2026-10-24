"""把火羽三期和 Kobuta 的 App GLB 压成页面内嵌用的副本，写进 src/figures/。资产更新后重跑即可。

    uv run --group shapes python -X utf8 dev/figures.py [交付目录]

交付目录默认是 .internal/tools/voyage-assets/meshy/deliverables（每套 app/*.glb，只读）；在工作树里运行时，用工作树里
已提交的那份即可。每个模型：
- 只留底色贴图。法线贴图（强度 0.05–0.35）和 ORM（AO 全白、粗糙度近似常数）页面的着色器不用，连同切线一起去掉；
  每个图元只留自己底色用的那套 UV，改名 TEXCOORD_0。
- 底色贴图：按用到它的图元的 UV 画出覆盖的区域，向外扩 2 像素，其余像素用 push-pull 从岛的边缘向外填满。烘焙图集的
  底是黑的，不填的话 mipmap 会把黑底混进小岛，远看出现黑边和黑点；没用到的区域填平后也更好压缩。然后缩到 SIZE，
  存成 WebP（EXT_texture_webp）。
- 网格和动画交给 gltfpack（npm 的 WASM 版）：火羽减到四分之一的三角面，Kobuta 减到一半（人物在船头只有几十像素高，
  核显的瓶颈在顶点；极近处也看不出差别），量化（KHR_mesh_quantization）和 meshopt 压缩（EXT_meshopt_compression），
  动画按 30 Hz 重采样。页面用 three.js 自带的 MeshoptDecoder 解码。
"""
import json
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / ".internal/tools/voyage-assets/meshy/deliverables"
OUT = ROOT / "src/figures"
# source (in the delivery folder), output name, texture size in pixels, share of the triangles kept
MODELS = [
    ("2021/app/hinome-2021-app.glb", "hinome-2021", 1024, 0.25),
    ("2022/app/hinome-2022-app.glb", "hinome-2022", 1024, 0.25),
    ("2023/app/hinome-2023-app.glb", "hinome-2023", 1024, 0.25),
    ("kobuta/app/kobuta-app.glb", "kobuta", 512, 0.5),
]
QUALITY = 82   # WebP
GLTFPACK = ["node", str(ROOT / "node_modules/gltfpack/cli.js"), "-cc"]


def read_glb(path):
    b = path.read_bytes()
    jlen = struct.unpack_from("<I", b, 12)[0]
    blen = struct.unpack_from("<I", b, 20 + jlen)[0]
    return json.loads(b[20:20 + jlen]), bytearray(b[28 + jlen:28 + jlen + blen])


def write_glb(path, js, bin):
    j = json.dumps(js, separators=(",", ":")).encode()
    j += b" " * (-len(j) % 4)
    bin = bytes(bin) + b"\0" * (-len(bin) % 4)
    head = struct.pack("<III", 0x46546C67, 2, 28 + len(j) + len(bin))
    path.write_bytes(head + struct.pack("<II", len(j), 0x4E4F534A) + j + struct.pack("<II", len(bin), 0x004E4942) + bin)


def accessor(js, bin, i):
    a = js["accessors"][i]
    v = js["bufferViews"][a["bufferView"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    dt = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[a["componentType"]]
    assert v.get("byteStride", n*np.dtype(dt).itemsize) == n*np.dtype(dt).itemsize, "interleaved data"
    return np.frombuffer(bin, dt, a["count"]*n, v.get("byteOffset", 0) + a.get("byteOffset", 0)).reshape(-1, n)


def coverage(js, bin, prims, w, h):
    """The texels the primitives' triangles cover, grown by 2 px for bilinear and mipmap footprints."""
    m = np.zeros((h, w), np.uint8)
    for p in prims:
        uv = accessor(js, bin, p["attributes"]["TEXCOORD_0"])
        tris = accessor(js, bin, p["indices"]).reshape(-1, 3)
        pts = np.round((uv[tris]*[w, h] - 0.5)*16).astype(np.int32)   # 4 bits of subpixel precision, texel centres
        for t in pts:
            cv2.fillConvexPoly(m, t, 255, cv2.LINE_8, 4)
    return cv2.dilate(m, np.ones((5, 5), np.uint8)) > 0


def fill(img, mask):
    """Push-pull: each texel outside mask takes the average of the covered texels around it, coarser the farther they are."""
    c, w = img.astype(np.float32)*mask[..., None], mask.astype(np.float32)
    levels = []
    while min(w.shape) > 1:
        levels.append((c, w))
        size = (w.shape[1]//2, w.shape[0]//2)
        c, w = cv2.resize(c, size, interpolation=cv2.INTER_AREA), cv2.resize(w, size, interpolation=cv2.INTER_AREA)
    f = c/np.maximum(w, 1e-6)[..., None]
    for c, w in reversed(levels):   # c is premultiplied by its coverage w
        f = c + cv2.resize(f, (w.shape[1], w.shape[0]), interpolation=cv2.INTER_LINEAR)*(1 - w)[..., None]
    return np.clip(np.round(f), 0, 255).astype(np.uint8)


def pack(src, name, size, keep, tmp):
    js, bin = read_glb(src)
    # each primitive keeps the UV set its base colour reads, as TEXCOORD_0; normal maps, ORM and tangents go
    for mesh in js["meshes"]:
        for p in mesh["primitives"]:
            uvset = js["materials"][p["material"]]["pbrMetallicRoughness"]["baseColorTexture"].get("texCoord", 0)
            a = p["attributes"]
            p["attributes"] = {k: a[s] for k, s in [("POSITION", "POSITION"), ("NORMAL", "NORMAL"), ("TEXCOORD_0", f"TEXCOORD_{uvset}"),
                                                     ("JOINTS_0", "JOINTS_0"), ("WEIGHTS_0", "WEIGHTS_0")]}
    base = [m["pbrMetallicRoughness"]["baseColorTexture"]["index"] for m in js["materials"]]
    images, textures, done = [], [], {}
    for mi, mat in enumerate(js["materials"]):
        old = base[mi]
        if old not in done:
            iv = js["images"][js["textures"][old]["source"]]
            v = js["bufferViews"][iv["bufferView"]]
            img = cv2.imdecode(np.frombuffer(bin, np.uint8, v["byteLength"], v.get("byteOffset", 0)), cv2.IMREAD_COLOR)
            prims = [p for m in js["meshes"] for p in m["primitives"] if base[p["material"]] == old]
            mask = coverage(js, bin, prims, img.shape[1], img.shape[0])
            filled = fill(img, mask)
            assert (filled[mask] == img[mask]).all(), "the covered texels keep their colour"
            img = filled
            img = cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA)
            data = cv2.imencode(".webp", img, [cv2.IMWRITE_WEBP_QUALITY, QUALITY])[1].tobytes()
            bin += b"\0"*(-len(bin) % 4)
            js["bufferViews"].append({"buffer": 0, "byteOffset": len(bin), "byteLength": len(data)})
            bin += data
            images.append({"name": iv.get("name", ""), "mimeType": "image/webp", "bufferView": len(js["bufferViews"]) - 1})
            textures.append({"sampler": 0, "extensions": {"EXT_texture_webp": {"source": len(images) - 1}}})
            done[old] = len(textures) - 1
            print(f"  {iv.get('name')}: {size}², {len(data)/1024:.0f} KB")
        js["materials"][mi] = {"name": mat.get("name", ""), "doubleSided": mat.get("doubleSided", False),
                               "pbrMetallicRoughness": {"baseColorTexture": {"index": done[old]}, "metallicFactor": 0}}
    js["images"], js["textures"] = images, textures
    js["extensionsUsed"] = ["EXT_texture_webp"]
    js["extensionsRequired"] = ["EXT_texture_webp"]
    js["buffers"] = [{"byteLength": len(bin)}]
    mid = Path(tmp)/f"{name}.glb"
    write_glb(mid, js, bin)
    out = OUT/f"{name}.glb"
    subprocess.run(GLTFPACK + ["-si", str(keep), "-i", str(mid), "-o", str(out)], check=True)
    return out


def main(argv):
    src = Path(argv[1]) if len(argv) > 1 else SRC
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        total = 0
        for rel, name, size, keep in MODELS:
            print(name)
            out = pack(src/rel, name, size, keep, tmp)
            total += out.stat().st_size
            print(f"  {out.relative_to(ROOT)}: {out.stat().st_size/1024:.0f} KB")
        print(f"total {total/1024/1024:.2f} MB, {total*4/3/1024/1024:.2f} MB as base64 in the page")


if __name__ == "__main__":
    main(sys.argv)
