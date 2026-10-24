"""联网采集：vtbs.moe 的大航海与粉丝记录、B 站在册名单。update、vtbs、guard 命令联网；forget 只改本机的删除名单和快照。"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
import time
import tomllib
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from . import CST, DAY0, ROOM, ROOT, UID, load_json, save_json, save_text

VTBS = "https://api.vtbs.moe"
GUARD_API = "https://api.live.bilibili.com/xlive/app-room/v2/guardTab/topListNew"
PAGE_SIZE = 30
PAUSE = (2.0, 4.0)    # 两次请求之间随机等待的秒数，不快于 HANE 的 1.5–3.5 秒
LOCAL_CONFIG = ROOT / "config.local.toml"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36")
THROTTLED = (-352, -412, -799, -509)


class BiliError(RuntimeError):
    def __init__(self, code, message=""):
        self.code = code
        hint = "；触发风控或限流，本次停止，稍后再试" if code in THROTTLED else ""
        super().__init__(f"B 站返回 {code} {message}".rstrip() + hint)


def pause() -> None:
    time.sleep(random.uniform(*PAUSE))


def get_json(url: str, headers: dict | None = None):
    """网络错误和 5xx 最多再试两次；其余 HTTP 错误（包括风控的 412）直接停止。"""
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json", **(headers or {})})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as e:
            if e.code == 412:
                raise BiliError(-412, "HTTP 412") from None
            if e.code < 500 or attempt == 2:
                raise
        except OSError:  # 断网、超时、连接被重置
            if attempt == 2:
                raise
        time.sleep(10 * (attempt + 1))


def cookie_header() -> str:
    """SESSDATA、buvid3 只从本机 config.local.toml 或环境变量读取，不打印、不写盘。"""
    try:
        with open(LOCAL_CONFIG, "rb") as f:
            local = tomllib.load(f).get("bilibili", {})
    except FileNotFoundError:
        local = {}
    pairs = (("SESSDATA", local.get("sessdata") or os.environ.get("BILI_SESSDATA", "")),
             ("buvid3", local.get("buvid3") or os.environ.get("BILI_BUVID3", "")))
    return "; ".join(f"{k}={v.strip()}" for k, v in pairs if v.strip())


# ── vtbs.moe ─────────────────────────────────────────────────
def readings(body, key: str) -> list[list[int]]:
    """vtbs.moe 的记录 → 按时间排序的 [毫秒时间, 数值]。缺失的序号返回 null，跳过。"""
    if not isinstance(body, list):
        raise ValueError("vtbs.moe 的响应不是列表")
    out = {}
    for row in body:
        if row is None:
            continue
        t, v = (row.get("time"), row.get(key)) if isinstance(row, dict) else (None, None)
        if not (isinstance(t, int) and 946684800000 <= t < 4102444800000 and isinstance(v, int) and v >= 0):
            raise ValueError(f"vtbs.moe 的 {key} 记录格式变了")
        out[t] = v
    return [[t, out[t]] for t in sorted(out)]


def update_vtbs(raw: Path) -> dict:
    """第一次全量下载；之后只把比本机最后一条更晚的记录补进来，已存的记录不改。"""
    added = {}
    # 大航海人数只有全量接口（人数每变一次记一条）；粉丝数有「最近 512 条」接口。
    sources = (("guard", "guardNum", "bulkGuard", "bulkGuard"), ("active", "follower", "bulkActive", "bulkActiveSome"))
    for i, (name, key, full, recent) in enumerate(sources):
        path = raw / f"vtbs_{name}.json"
        old = load_json(path, [])
        if i:
            pause()
        new = readings(get_json(f"{VTBS}/v2/{recent if old else full}/{UID}"), key)
        if old and new and new[0][0] > old[-1][0] and recent != full:
            pause()  # 最近 512 条接不上本机最后一条，中间有断档，改取全量
            new = readings(get_json(f"{VTBS}/v2/{full}/{UID}"), key)
        if not new:
            raise ValueError(f"vtbs.moe 的 {full} 没有记录，保留本机数据")
        tail = [r for r in new if not old or r[0] > old[-1][0]]
        save_json(path, old + tail)
        added[name] = (len(tail), new[-1][0])
    return added


# ── B 站在册名单 ──────────────────────────────────────────────
SALT = b"hane-voyage:v1"


def uid_digest(uid) -> bytes:
    """UID → PBKDF2-HMAC-SHA256（公开盐，10 万次）。存档只留前 3 字节（24 位）作 id：每个 id 对应
    一两百个旧式 UID，穷举还原不了。完整的 32 字节只在内存里去重，以及记在不公开的删除名单里。页面用 WebCrypto
    按同样的参数算观众输入的 UID（src/uid.ts），改这里必须同时改页面并重算快照。"""
    try:
        n = int(uid)
    except (TypeError, ValueError):
        n = 0  # 不带原值：报错信息里不出现 UID
    if isinstance(uid, bool) or n <= 0:
        raise ValueError("UID 必须是正整数")
    return hashlib.pbkdf2_hmac("sha256", str(n).encode(), SALT, 100_000)


NAME_MAX = 32  # 昵称最多这么多个码位；B 站的昵称短得多，一个表情序列要占好几个
# 格式字符里只留表情和一些文字要用的连接符（ZWNJ、ZWJ），以及旗帜表情的标签字符；方向控制符、零宽空格等都去掉
JOINERS = "‌‍"


def clean_name(raw) -> str:
    """接口给的昵称 → 可以放心显示的字符串：NFC 规范化，去掉控制字符、代理项、私用区和格式字符，
    换行和各种空白压成一个空格，最多 NAME_MAX 个码位，末尾不留半个表情序列。不是字符串或清理后为空时返回 ''。"""
    if not isinstance(raw, str):
        return ""
    kept = []
    for ch in unicodedata.normalize("NFC", raw):
        cat = unicodedata.category(ch)
        if ch.isspace() or cat in ("Zl", "Zp"):
            kept.append(" ")
        elif cat in ("Cc", "Cs", "Co") or (cat == "Cf" and ch not in JOINERS and not "\U000e0020" <= ch <= "\U000e007f"):
            continue
        else:
            kept.append(ch)
    return " ".join("".join(kept).split())[:NAME_MAX].rstrip(JOINERS + "︎️ ")


# 要求删掉名字的人（docs/DATA.md「删除名字」）：数据目录里的这个文件存他们 UID 的完整摘要，不存明文 UID
REMOVALS = "name-removals.json"


def removed(data: Path) -> set[str]:
    """删除名单里的完整摘要（十六进制）。没有这个文件就是空的。"""
    got = load_json(data / REMOVALS, [])
    if not isinstance(got, list) or not all(isinstance(h, str) and len(h) == 64 for h in got):
        raise ValueError(f"{REMOVALS} 的格式不对，应是完整摘要的列表")
    return set(got)


def member(row, forget: frozenset | set = frozenset()) -> tuple[bytes, tuple] | None:
    """一条名单记录 → (完整摘要, (id, 等级, 粉丝牌等级, 陪伴天数, 昵称))。只读这几项，UID 一读到就转成摘要，
    头像不读。在删除名单里的人（forget 是完整摘要的十六进制）昵称记成 ''。
    选了「神秘人」的人自己隐藏了身份，返回 None：不进名单，在页面上算无名的灯。"""
    try:
        uinfo = row["uinfo"]
        base = uinfo.get("base") or {}
        if base.get("is_mystery") is True:
            return None
        digest = uid_digest(uinfo["uid"])
        level, accompany = uinfo["guard"]["level"], row["accompany"]
        medal = (uinfo.get("medal") or {}).get("level") or 0
        name = "" if digest.hex() in forget else clean_name(base.get("name"))
    except (AttributeError, KeyError, TypeError, ValueError):
        # 不带原记录和原异常：里面可能有昵称或 UID。
        raise ValueError("名单记录缺少 uid、等级或陪伴天数，接口格式可能变了") from None
    if (level not in (1, 2, 3) or not isinstance(medal, int) or medal < 0
            or not isinstance(accompany, (int, float)) or not 0 <= accompany < 1e5):
        raise ValueError("名单记录的等级、粉丝牌等级或陪伴天数不合法")
    return digest, (digest[:3].hex(), level, medal, accompany, name)


def guard_page(page: int, cookie: str, forget: frozenset | set = frozenset()):
    """名单的一页 → (总人数, 接口报告的总页数, [(完整摘要, 记录)], 神秘人的排名)。
    每一页都会重复返回前三名（top3），由调用方去重。"""
    headers = {"Referer": f"https://live.bilibili.com/{ROOM}", "Origin": "https://live.bilibili.com"}
    if cookie:
        headers["Cookie"] = cookie
    body = get_json(f"{GUARD_API}?roomid={ROOM}&ruid={UID}&page={page}&page_size={PAGE_SIZE}", headers)
    if not isinstance(body, dict) or body.get("code") != 0:
        code = body.get("code") if isinstance(body, dict) else None
        raise BiliError(code, str(body.get("message") or "")[:80] if isinstance(body, dict) else "")
    data = body.get("data") or {}
    info = data.get("info") or {}
    if not isinstance(info.get("num"), int) or info["num"] < 0:
        raise ValueError("名单接口缺少总人数 info.num，接口格式可能变了")
    rows = (data.get("top3") or []) + (data.get("list") or [])
    members = [member(row, forget) for row in rows]
    hidden = {row.get("rank") for row, m in zip(rows, members) if m is None}
    return info["num"], info.get("page"), [m for m in members if m], hidden


COLUMNS = ["id", "level", "medal", "start", "name"]


def snapshot_text(time_iso: str, total: int, rows: list, columns: list = COLUMNS, hashed: bool = False) -> str:
    """快照文件：每人一行。昵称照原样写，不转义成 \\u，打开就看得出是谁，也方便删。公开仓库的每日更新存进
    Actions 缓存的快照（build.prune）昵称是哈希，标一个 "hashed":true。"""
    lines = ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows)
    mark = '"hashed":true,' if hashed else ""
    return f'{{"time":"{time_iso}","total":{total},{mark}"columns":{json.dumps(columns)},"members":[\n{lines}\n]}}\n'


def crawl_guard(guard_dir: Path, now: datetime | None = None) -> dict:
    """翻完在册名单并存一份快照；没翻完时不存，只返回概况。删除名单在数据目录，即 guard_dir 的上一级。"""
    when = now or datetime.now(CST)
    cookie = cookie_header()
    forget = removed(guard_dir.parent)
    found: dict[bytes, tuple] = {}
    hidden: set = set()
    page = 0
    while True:
        page += 1
        if page > 1:
            pause()
        num, reported, rows, mystery = guard_page(page, cookie, forget)
        last = reported if isinstance(reported, int) and reported > 0 else math.ceil(num / PAGE_SIZE)
        before = len(found) + len(hidden)
        for digest, record in rows:
            found.setdefault(digest, record)  # 前三名每页都有；抓取期间有人进出时，相邻两页也会重复
        hidden |= mystery
        # 停在中途的情况：接口不给更深的页，或分页没有前进。
        if page >= last or not (rows or mystery) or len(found) + len(hidden) == before:
            break
    # 翻到最后一页、人数也对得上才算完整：抓取期间有人进出，多收少收都只允许差 1%。总数是 0 时不存，那更像接口出了
    # 问题；2026-10-24 以前只查少收，「成功」但空的名单也会存下来，build 后最后一天变成 0 人、名单清空。
    complete = page >= last and num > 0 and abs(len(found) + len(hidden) - num) <= num * 0.01
    members = sorted(found.values())
    result = {"total": num, "pages": page, "last": last, "complete": complete, "members": members,
              "hidden": len(hidden), "file": None}
    if complete:
        day = (when.date() - DAY0).days
        path = guard_dir / f"{when:%Y%m%d-%H%M%S}.json"
        save_text(path, snapshot_text(when.isoformat(timespec="seconds"), num,
                                      [[i, lv, m, day - acc, name] for i, lv, m, acc, name in members]))
        result["file"] = path
    return result


def forget(data: Path, uids: list) -> tuple[int, int]:
    """有人要求删掉名字：把 UID 的完整摘要记进删除名单（不存明文 UID），再抹掉已有快照里的名字。
    快照只有 3 字节的 id，几千人里偶尔有两人 id 相同，这时两人的名字都会抹掉。返回 (新记下几人, 抹掉几行)。
    之后运行 build，页面上的名字才会消失；以后的抓取也不再存这些人的名字。"""
    have = removed(data)
    digests = {uid_digest(u).hex() for u in uids}
    save_json(data / REMOVALS, sorted(have | digests))
    ids, wiped = {h[:6] for h in digests}, 0
    for path in sorted((data / "guard").glob("*.json")):
        snap = load_json(path, None)
        if "name" not in snap["columns"]:
            continue
        k, hit = snap["columns"].index("name"), 0
        for row in snap["members"]:
            if row[0] in ids and row[k]:
                row[k], hit = "", hit + 1
        if hit:
            save_text(path, snapshot_text(snap["time"], snap["total"], snap["members"], snap["columns"]))
            wiped += hit
    return len(digests - have), wiped
