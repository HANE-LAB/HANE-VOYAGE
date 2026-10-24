"""把火羽 1、2、3 号形象和 kobuta 的头像转成烟花的星位，写进 src/fwShapes.ts。

    uv run --group shapes python -X utf8 dev/fw_shapes.py [素材目录] [--preview 目录]

素材目录默认是 .internal/assets（1.png、2.png、3.png、kobuta.png，没有进 Git）。只取每张图的头部框，取这些线：
- 头部框里剪影的轮廓，去掉挥着的手，也不画框的边。1–3 号的剪影取透明通道，kobuta 是浅灰底，按饱和度抠出。
- 脸的轮廓：从脸颊的一点按固定的颜色范围填充，画师的墨线会挡住填充。
- 五官：脸上一个椭圆里、脸里或眼睛的椭圆里的 Canny 边缘（双边滤波后），即睫毛、眼睛、瞳孔、高光和嘴，不含脸颊两侧的发丝。
  kobuta 的五官对比太弱，按图上读出的坐标画椭圆。
- 发饰和围巾：按色相和饱和度在各自的框里取。
所有线先按 1 像素重采样（轮廓再沿弧长做高斯平滑），然后按优先级（发饰、五官、脸、轮廓）沿线走，离已取的星不到 d 就跳过，
这样每条线上的星等距，两条线挨着时也不会叠成双线。d 用二分法定，使每个形状正好 N 颗星。坐标以头部外框的中心为原点，
高度归一到 2（y 向上），存成 int8：每颗星三个字节 x、y、颜色（0 主色，1 发饰或围巾，2 眼睛，3 嘴和鼻子）。
"""
import base64
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
N = 1040          # stars per shape; src/fx.ts gives each two points (head and trail), as many as a round shell's 520 × 4
SMOOTH = 3.0      # outline smoothing, source pixels
MIN_HOLE = 2500   # gaps in the silhouette smaller than this (source px²) are left out

# Per image, in source pixels: the head box [x0, y0, x1, y1]; the cheek to fill the face from; hands to leave out (a point
# on each); the ellipse [cx, cy, rx, ry] whose edges are the features, and the ellipses of the eyes in it (their stars take
# the eye colour, the rest of the features the mouth colour); accents as [box x0, y0, x1, y1, hue lo, hue hi, min
# saturation, min value] (OpenCV hue is 0–180); and features no edge finds, read off the image by hand, as ellipses.
SHAPES = {
    "1": dict(box=[190, 0, 880, 590], face=(470, 465), hands=[(277, 613)], feat=[510, 488, 175, 95],
              eyes=[[415, 432, 60, 32], [610, 462, 60, 32]],
              accents=[[240, 60, 440, 250, 0, 12, 140, 170], [660, 120, 860, 300, 0, 12, 140, 170]]),
    "2": dict(box=[200, 0, 880, 552], face=(500, 440), hands=[(248, 597)], feat=[530, 432, 170, 92],
              eyes=[[450, 395, 48, 50], [612, 410, 46, 50]],
              accents=[[250, 70, 380, 210, 10, 32, 110, 170], [690, 110, 830, 260, 10, 32, 110, 170]]),
    "3": dict(box=[200, 0, 880, 512], face=(440, 470), hands=[(252, 565)], feat=[525, 398, 165, 88],
              eyes=[[447, 352, 48, 44], [607, 380, 48, 44]],
              accents=[[650, 70, 810, 220, 0, 10, 180, 170]]),
    "kobuta": dict(box=[300, 190, 600, 590], face=None, hands=[], feat=None,
                   eyes=[[390, 349, 14, 14], [506, 349, 14, 14]],
                   accents=[[0, 0, 896, 1200, 35, 85, 45, 40]],
                   ellipses=[[390, 349, 9, 10], [506, 349, 9, 10], [447, 393, 39, 32], [432, 391, 5, 10], [464, 391, 5, 10]]),
}


def silhouette(img):
    if img.shape[2] == 4:
        m = (img[..., 3] > 128).astype(np.uint8)
    else:   # kobuta: a pale grey backdrop; the pig and its scarf are the saturated part
        m = (cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[..., 1] > 40).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    return (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)


def loops(mask, min_area):
    """Every boundary of the mask, outer edges and holes, enclosing at least min_area px², as closed curves."""
    cs, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    return [c[:, 0, :].astype(np.float64) for c in cs if cv2.contourArea(c) > min_area]


def fill(img, seed):
    """The skin around seed: colours within a fixed range of the seed's, which the drawn ink lines stop."""
    b = cv2.GaussianBlur(img[..., :3], (5, 5), 0)
    ff = np.zeros((img.shape[0] + 2, img.shape[1] + 2), np.uint8)
    cv2.floodFill(b.copy(), ff, seed, 0, (40,) * 3, (40,) * 3, cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (255 << 8) | 4)
    return cv2.morphologyEx((ff[1:-1, 1:-1] > 0).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))


def in_ellipse(p, e):
    cx, cy, rx, ry = e
    return ((p[:, 0] - cx)/rx)**2 + ((p[:, 1] - cy)/ry)**2 <= 1


def features(img, e, face, eyes):
    """The edges inside ellipse e and inside the face (with the eyes and mouth it surrounds, and a little in from its
    outline), or inside an eye's ellipse: lashes, eyes, pupils, highlights, mouth; each edge as a run of pixels."""
    b = cv2.bilateralFilter(cv2.bilateralFilter(img[..., :3], 9, 60, 9), 9, 60, 9)
    edge = cv2.Canny(cv2.cvtColor(b, cv2.COLOR_BGR2GRAY), 60, 150)
    m = np.zeros(edge.shape, np.uint8)
    cv2.ellipse(m, (e[0], e[1]), (e[2], e[3]), 0, 0, 360, 1, -1)
    f = cv2.morphologyEx(face, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
    cs, _ = cv2.findContours(f, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    f = cv2.drawContours(np.zeros_like(f), cs, -1, 1, -1)
    f = cv2.erode(f, np.ones((15, 15), np.uint8))
    for x, y, rx, ry in eyes: cv2.ellipse(f, (x, y), (rx, ry), 0, 0, 360, 1, -1)
    edge[(m == 0) | (f == 0)] = 0
    cs, _ = cv2.findContours(edge, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    return [c[:, 0, :].astype(np.float64) for c in cs if len(c) > 12]


def accent(img, box):
    x0, y0, x1, y1, h0, h1, s, v = box
    hsv = cv2.cvtColor(img[..., :3], cv2.COLOR_BGR2HSV)
    m = np.zeros(img.shape[:2], np.uint8)
    sub = hsv[y0:y1, x0:x1]
    m[y0:y1, x0:x1] = (sub[..., 0] >= h0) & (sub[..., 0] <= h1) & (sub[..., 1] >= s) & (sub[..., 2] >= v)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    return loops(m, 400)


def ellipse(cx, cy, rx, ry):
    t = np.linspace(0, 2*np.pi, max(16, int(2*np.pi*max(rx, ry))), endpoint=False)
    return np.stack([cx + rx*np.cos(t), cy + ry*np.sin(t)], 1)


def smooth(c):
    """A closed curve resampled to 1 px steps and blurred along its length."""
    p = np.vstack([c, c[:1]])
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))]
    q = np.stack([np.interp(np.arange(0, d[-1], 1.0), d, p[:, k]) for k in (0, 1)], 1)
    k = int(3*SMOOTH)
    if len(q) <= 2*k: return q
    w = np.exp(-0.5*(np.arange(-k, k + 1)/SMOOTH)**2); w /= w.sum()
    pad = np.vstack([q[-k:], q, q[:k]])
    return np.stack([np.convolve(pad[:, j], w, mode="valid") for j in (0, 1)], 1)


def stars(runs, d):
    """Walk the runs in order and keep each point at least d from every point kept so far."""
    grid, kept = {}, []
    for pts, cls in runs:
        for x, y in pts:
            gx, gy = int(x//d), int(y//d)
            if any((x - a)**2 + (y - b)**2 < d*d for i in (-1, 0, 1) for j in (-1, 0, 1) for a, b in grid.get((gx + i, gy + j), ())):
                continue
            grid.setdefault((gx, gy), []).append((x, y))
            kept.append((x, y, cls))
    return kept


def build(src, name, spec):
    img = cv2.imread(str(src/f"{name}.png"), cv2.IMREAD_UNCHANGED)
    if img is None: sys.exit(f"cannot read {src/f'{name}.png'}")
    x0, y0, x1, y1 = spec["box"]
    head = silhouette(img)
    keep = np.zeros_like(head); keep[y0:y1, x0:x1] = 1
    for h in spec["hands"]:
        keep[cv2.dilate(fill(img, h), np.ones((9, 9), np.uint8)) > 0] = 0
    head &= keep
    # the head's outline, less the box's edges, where the hair and shoulders are cut off, and the tips of the strands
    # just above the bottom edge
    edge = [c[(c[:, 0] > x0 + 3) & (c[:, 0] < x1 - 3) & (c[:, 1] < y1 - 20)] for c in map(smooth, loops(head, MIN_HOLE))]
    skin = fill(img, spec["face"]) & head if spec["face"] else None
    face = [smooth(c) for c in loops(skin, 1000)] if spec["face"] else []
    face = [c[c[:, 1] < y1 - 3] for c in face]
    feats = features(img, spec["feat"], skin, spec["eyes"]) if spec["feat"] else []
    feats += [ellipse(*e) for e in spec.get("ellipses", [])]
    eye = lambda c: 2 if any(in_ellipse(c, e).mean() > 0.5 for e in spec["eyes"]) else 3
    runs = [(c, 1) for b in spec["accents"] for c in accent(img, b) if (head[c[:, 1].astype(int), c[:, 0].astype(int)] > 0).mean() > 0.5]
    runs += [(c, eye(c)) for c in feats] + [(c, 0) for c in face + edge]
    lo, hi = 1.0, 40.0
    for _ in range(30):   # the spacing that gives N stars, or the fewest over N
        d = (lo + hi)/2
        lo, hi = (d, hi) if len(stars(runs, d)) > N else (lo, d)
    kept = stars(runs, lo)
    kept = [kept[i] for i in np.round(np.linspace(0, len(kept) - 1, N)).astype(int)]
    pts = np.array(kept)
    x, y, w, h = cv2.boundingRect(head)
    cx, cy, s = x + w/2, y + h/2, h/2
    q = np.stack([(pts[:, 0] - cx)/s, (cy - pts[:, 1])/s], 1)
    return q, pts[:, 2].astype(int), lo


COLOURS = [(0.55, 0.85, 1.0), (0.25, 0.3, 1.0), (0.2, 0.65, 1.0), (0.6, 0.45, 1.0)]   # preview only, BGR


def preview(q, cls, path, px=300):
    """The stars as the page draws them, roughly: glowing dots on black, the head px tall."""
    W = int(px*1.5)
    acc = np.zeros((W, W, 3), np.float32)
    for (x, y), k in zip(q, cls):
        cv2.circle(acc, (int(W/2 + x*px/2), int(W/2 - y*px/2)), 2, COLOURS[k], -1, cv2.LINE_AA)
    glow = cv2.GaussianBlur(acc, (0, 0), 4)
    cv2.imwrite(str(path), np.clip((acc*0.8 + glow*1.6)*255, 0, 255).astype(np.uint8))


def main(argv):
    src = Path(argv[0]) if argv and not argv[0].startswith("--") else ROOT/".internal"/"assets"
    pv = Path(argv[argv.index("--preview") + 1]) if "--preview" in argv else None
    out = []
    for name, spec in SHAPES.items():
        q, cls, step = build(src, name, spec)
        b = np.stack([np.round(q[:, 0]*127), np.round(q[:, 1]*127), cls], 1).astype(np.int8)
        out.append((name, base64.b64encode(b.tobytes()).decode()))
        print(f"{name}: {len(q)} stars, {step:.1f} source px apart, x {q[:, 0].min():.2f}..{q[:, 0].max():.2f}, "
              f"colours {np.bincount(cls, minlength=4).tolist()}")
        if pv:
            pv.mkdir(parents=True, exist_ok=True)
            preview(q, cls, pv/f"{name}.png")
    lines = ["// Generated by dev/fw_shapes.py from the heads of 火羽 1–3 and kobuta (1.png, 2.png, 3.png, kobuta.png); do not edit.",
             f"// Each shape is {N} stars of three int8: x, y (the head's height spans −127..127, y up) and colour",
             "// (0 main, 1 ornament or scarf, 2 eyes, 3 mouth and nose).",
             "export const FW_SHAPES: Record<string, string> = {"]
    lines += [f"  '{name}': '{s}'," for name, s in out]
    lines += ["};", ""]
    (ROOT/"src"/"fwShapes.ts").write_text("\n".join(lines), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main(sys.argv[1:])
