"""联网采集：vtbs.moe 的大航海与粉丝记录、Danmakus 的开播记录和上舰记录、B 站在册名单。update、vtbs、live、guard、boarding 命令联网；forget 只改本机的删除名单和快照。"""
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
LIST_CAP = 9999       # 名单每种排序都只给到第 9999 名，总数 info.num 不受影响（docs/DATA.md「名单的上限」）
BY_ACCOMPANY = 1      # typ=1：按陪伴天数从长到短排。不带 typ 时按等级和粉丝牌排，两种截掉的人不一样
PAUSE = (2.0, 4.0)    # 两次请求之间随机等待的秒数，不快于 HANE 的 1.5–3.5 秒
LOCAL_CONFIG = ROOT / "config.local.toml"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36")
THROTTLED = (-352, -412, -799, -509)
LIVES = f"https://api.ukamnads.icu/api/v2/channel?uid={UID}"   # nailv 的火羽页面用的 Danmakus 公开接口，不用登录
LIVE_DAYS = "live_days.json"


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


# ── 开播记录 ─────────────────────────────────────────────────
def update_live(data: Path) -> tuple[int, int]:
    """她开播过的日子（只有日期，北京时间）接着上次的存进 data/live_days.json，来源不再给的日子也留着。
    响应不对就抛出去，不动已有的文件。返回 (新增几天, 最新一场的毫秒时间)。"""
    body = get_json(LIVES)
    info = body.get("data") if isinstance(body, dict) and body.get("code") == 200 else None
    channel, lives = (info.get("channel"), info.get("lives")) if isinstance(info, dict) else (None, None)
    if not isinstance(channel, dict) or not isinstance(lives, list) or not lives:
        raise ValueError("Danmakus 的响应结构变了，保留本机数据")
    if str(channel.get("uId")) != str(UID):
        raise ValueError("Danmakus 返回的不是她的记录，保留本机数据")
    if channel.get("totalLiveCount") != len(lives):
        raise ValueError(f"Danmakus 的场次对不上：{len(lives)} 场，来源说有 {channel.get('totalLiveCount')} 场，保留本机数据")
    starts = [it.get("startDate") if isinstance(it, dict) else None for it in lives]
    if not all(isinstance(t, (int, float)) and 946684800000 <= t < 4102444800000 for t in starts):
        raise ValueError("Danmakus 的开播时间格式变了，保留本机数据")
    path = data / LIVE_DAYS
    old = load_json(path, [])
    days = sorted(set(old) | {datetime.fromtimestamp(t / 1000, CST).date().isoformat() for t in starts})
    save_json(path, days)
    return len(days) - len(old), max(starts)


# ── Danmakus 的上舰记录 ────────────────────────────────────────
LIVE_ROWS = "https://api.ukamnads.icu/api/v2/live?liveId={}&includeExtra=false&pageNum={}&pageSize={}"
ROWS_PER_PAGE = 2000
BOARDING = "boarding.json"   # 在 data/raw/ 里，git 忽略


def update_boarding(data: Path) -> dict:
    """登记簿（data/numbers.json）的 boarding_until 以后开播、已经播完的场次里，直播时的上舰记录（Danmakus 的 type 2）
    → data/raw/boarding.json：{"until": 读到哪一场的开播时间, "rows": [[id, 毫秒时间, 场次, 场次里的序号], …]}。
    build 用它给新人排同一天里的先后，给名单上看不到的人留号（voyage/numbers.py）。
    UID 一读到就在内存里换成 id，UID 和昵称都不存、不打印。还在播的场次这次不读，下次播完再读。
    登记簿里还没有 boarding_until 时什么都不取。响应不对就抛出去，不写文件。"""
    since = load_json(data / "numbers.json", {}).get("boarding_until")
    if not since:
        return {"lives": 0, "pages": 0, "rows": 0, "skipped": 0, "until": None}
    until = since_ms = int(datetime.fromisoformat(since).timestamp() * 1000)
    body = get_json(LIVES)
    info = body.get("data") if isinstance(body, dict) and body.get("code") == 200 else None
    channel, lives = (info.get("channel"), info.get("lives")) if isinstance(info, dict) else (None, None)
    if not isinstance(channel, dict) or not isinstance(lives, list):
        raise ValueError("Danmakus 的响应结构变了")
    if str(channel.get("uId")) != str(UID):
        raise ValueError("Danmakus 返回的不是她的记录")
    todo = sorted((s for s in lives if isinstance(s, dict) and isinstance(s.get("liveId"), str)
                   and isinstance(s.get("startDate"), (int, float)) and s["startDate"] > since_ms and s.get("isFinish") is True),
                  key=lambda s: s["startDate"])
    ids, rows, pages, skipped = {}, [], 0, 0
    for s in todo:
        n = page = 0
        while page <= n:
            pause()
            body = get_json(LIVE_ROWS.format(s["liveId"], page, ROWS_PER_PAGE))
            d = body.get("data") if isinstance(body, dict) and body.get("code") == 200 else None
            total = d.get("total") if isinstance(d, dict) else None
            got = d.get("data", {}).get("danmakus") if isinstance(d, dict) and isinstance(d.get("data"), dict) else None
            if type(total) is not int or total < 0 or not isinstance(got, list):
                raise ValueError("Danmakus 的逐条记录格式变了")
            n = max(0, -(-total // ROWS_PER_PAGE) - 1)   # 最后一页的页号
            for k, r in enumerate(got):
                if not isinstance(r, dict) or r.get("type") != 2:
                    continue
                t, uid = r.get("sendDate"), r.get("uId")
                if not isinstance(t, (int, float)) or not 946684800000 <= t < 4102444800000:
                    raise ValueError("Danmakus 的上舰时间格式变了")
                if uid not in ids:
                    try:
                        ids[uid] = uid_digest(uid)[:3].hex()
                    except ValueError:
                        ids[uid] = None   # 没有 UID 的记录认不出是谁，跳过
                if ids[uid] is None:
                    skipped += 1
                    continue
                rows.append([ids[uid], int(t), s["liveId"], page * ROWS_PER_PAGE + k])
            pages += 1
            page += 1
        until = max(until, int(s["startDate"]))
    ids.clear()
    out = {"until": datetime.fromtimestamp(until / 1000, CST).isoformat(timespec="seconds"), "rows": rows}
    save_json(data / "raw" / BOARDING, out)
    return {"lives": len(todo), "pages": pages, "rows": len(rows), "skipped": skipped, "until": out["until"]}


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


def guard_page(page: int, cookie: str, forget: frozenset | set = frozenset(), typ: int | None = None):
    """名单的一页 → (总人数, 接口报告的总页数, [(完整摘要, 记录)], 神秘人的排名)。
    每一页都会重复返回前三名（top3），由调用方去重。typ 是另一种排序，不给就是默认排序。"""
    headers = {"Referer": f"https://live.bilibili.com/{ROOM}", "Origin": "https://live.bilibili.com"}
    if cookie:
        headers["Cookie"] = cookie
    order = "" if typ is None else f"&typ={typ}"
    body = get_json(f"{GUARD_API}?roomid={ROOM}&ruid={UID}&page={page}&page_size={PAGE_SIZE}{order}", headers)
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


def walk_guard(found: dict, cookie: str, forget: frozenset | set, typ: int | None = None) -> tuple[int, int, int, set]:
    """把一种排序翻到接口给的最后一页，人记进 found。返回 (总人数, 翻到第几页, 最后一页, 神秘人的排名)。"""
    hidden: set = set()
    page = 0
    while True:
        page += 1
        if page > 1:
            pause()
        num, reported, rows, mystery = guard_page(page, cookie, forget, typ)
        last = reported if isinstance(reported, int) and reported > 0 else math.ceil(num / PAGE_SIZE)
        before = len(found) + len(hidden)
        for digest, record in rows:
            found.setdefault(digest, record)  # 前三名每页都有；抓取期间有人进出时，相邻两页也会重复
        hidden |= mystery
        # 停在中途的情况：接口不给更深的页，或分页没有前进。
        if page >= last or not (rows or mystery) or len(found) + len(hidden) == before:
            return num, page, last, hidden


def second_walk(found: dict, cookie: str, forget: frozenset | set) -> dict:
    """人数过了上限：按陪伴天数再翻一遍，并进 found。默认排序的末尾是粉丝牌最低的舰长，不分上舰早晚；这一种的末尾是
    刚上舰的人，所以合起来看不到的只有刚上舰、粉丝牌又排在最后的人。这一遍只是多看到一些人：出错就留下已经翻到的，
    名单照样存，不让每日更新停掉。它的神秘人不计：排名和默认排序的对不上，也认不出是不是同一个人。"""
    other: dict = {}
    info = {"pages": 0, "last": 0, "seen": 0, "added": 0, "zero_fixed": 0, "error": ""}
    pause()
    try:
        _, info["pages"], info["last"], _ = walk_guard(other, cookie, forget, BY_ACCOMPANY)
    except (OSError, ValueError, RuntimeError) as e:  # BiliError 是 RuntimeError；限流时不重试
        info["error"] = str(e)
    info["seen"] = len(other)
    for digest, record in other.items():
        have = found.get(digest)
        if have is None:
            found[digest] = record
            info["added"] += 1
        elif have[3] == 0 and record[3] > 0:  # B 站每次给一部分人返回 0 天，另一遍给了正值就用它
            found[digest] = record
            info["zero_fixed"] += 1
    return info


def crawl_guard(guard_dir: Path, now: datetime | None = None) -> dict:
    """翻完在册名单并存一份快照；没翻完时不存，只返回概况。删除名单在数据目录，即 guard_dir 的上一级。"""
    when = now or datetime.now(CST)
    cookie = cookie_header()
    forget = removed(guard_dir.parent)
    found: dict[bytes, tuple] = {}
    num, page, last, hidden = walk_guard(found, cookie, forget)
    first = len(found) + len(hidden)
    # 总人数过了上限时接口给不全，翻到上限就算到头了。2026-11-10 起默认排序只给到第 9919 名左右，后面几页是空的，
    # 接口却还报告 334 页，所以这里不要求翻到报告的最后一页，只看人数：默认排序取到上限的九成就再翻一遍按陪伴天数的。
    over = num > LIST_CAP and first >= LIST_CAP * 0.9
    second = second_walk(found, cookie, forget) if over else None
    seen = len(found) + len(hidden)
    # 两遍里至少一遍到了上限的 99% 才算到头；都差得多还是当作没翻完，那更像接口出了问题。
    capped = over and max(first, second["seen"]) >= LIST_CAP * 0.99
    # 翻到最后一页、人数也对得上才算完整：抓取期间有人进出，多收少收都只允许差 1%。总数是 0 时不存，那更像接口出了
    # 问题；2026-10-24 以前只查少收，「成功」但空的名单也会存下来，build 后最后一天变成 0 人、名单清空。
    complete = num > 0 and ((page >= last and abs(seen - num) <= num * 0.01) or (capped and seen <= num * 1.01))
    members = sorted(found.values())
    result = {"total": num, "pages": page, "last": last, "complete": complete, "members": members,
              "hidden": len(hidden), "second": second, "file": None}
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
