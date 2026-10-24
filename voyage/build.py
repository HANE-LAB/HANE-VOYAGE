"""离线合成：vtbs.moe 记录、名单快照（含零值回填依据）和 HANE 开播档案 → data/voyage.json。"""
from __future__ import annotations

import hashlib
import re
from bisect import bisect_left
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from . import DAY0, UID, day_of, load_json, save_json, save_text
from .fetch import NAME_MAX, clean_name, removed, snapshot_text

# 已核实的数字（docs/DATA.md「已核实的数字」），页面画成白点。
ANCHORS = {
    "total": (("2021-02-03", 0), ("2022-10-15", 1031), ("2022-10-23", 1004), ("2026-10-21", 7027)),
    "followers": (("2021-02-03", 1683), ("2021-11-04", 18021), ("2022-10-13", 113609),
                  ("2024-01-17", 80607), ("2026-10-21", 254840)),
}


def index(iso: str) -> int:
    return (date.fromisoformat(iso) - DAY0).days


def iso(day: int) -> str:
    return (DAY0 + timedelta(days=day)).isoformat()


def live_days(hane: Path) -> set[int]:
    """HANE 开播档案（只读）里她开播的日子，按每场的开始时间算。"""
    path = hane / "data" / "live_sessions.json"
    sessions = load_json(path, None)
    if not isinstance(sessions, dict):
        raise FileNotFoundError(f"找不到 HANE 的开播档案 {path}，用 --hane 指定 HANE 的目录")
    days = set()
    for entry in sessions.values():
        start = (entry.get("item") or {}).get("startDate")
        if entry.get("uid") == UID and isinstance(start, (int, float)):
            days.add(day_of(start))
    return days


# 直播档案连续这么多天没有场次，就算档案缺了这一段，改看动态。真的停播时（2021-11、2022-10、2026-02）
# 她几乎不发预告；档案缺的那几段（最短 7 天）她天天发（2026-10-23 核对，见 docs/DATA.md「开播日」）。
GAP = 7
# 预告发出后约一小时内开播：23 点多发的「この後から配信」，直播常在第二天零点后才开始。
NOTICE_LEAD = 3600


def notice_days(hane: Path, data: Path) -> set[int]:
    """HANE 动态档案（只读）里她发了直播预告的日子：HANE 按规则标的「直播预告」，按发出时间加一小时算。
    HANE 的 posts.json 不在它的公开仓库里，所以有它时把这些日子另存进 data/live_notices.json（只有日期，随数据公开），
    没有它时（公开仓库的每日更新）读这份。"""
    path, saved = hane / "data" / "posts.json", data / "live_notices.json"
    posts = load_json(path, None)
    if isinstance(posts, list):
        days = {day_of((p["ts"] + NOTICE_LEAD) * 1000) for p in posts
                if str(p.get("author_mid")) == str(UID) and "直播预告" in (p.get("tags_rule") or [])
                and isinstance(p.get("ts"), (int, float))}
        save_json(saved, sorted(iso(d) for d in days))
        return days
    cached = load_json(saved, None)
    if not isinstance(cached, list):
        raise FileNotFoundError(f"找不到 HANE 的动态档案 {path}，也没有 {saved}；用 --hane 指定 HANE 的目录")
    return {index(d) for d in cached}


def gaps(live: set[int], last: int) -> list[list[int]]:
    """直播档案连续 GAP 天以上没有场次的区间 [首日, 末日]，第一场之前也算。"""
    out, start = [], 0
    for d in range(last + 2):
        if d in live or d > last:
            if d - start >= GAP:
                out.append([start, d - 1])
            start = d + 1
    return out


def daily(readings: list, last: int) -> tuple[list[int], int]:
    """每天取当天最后一条记录；没有记录的日子沿用前一天，第一条之前的日子用第一条。
    返回 (第 0 到 last 天的值, 第一条记录所在的天)。"""
    by_day = {}
    for t, v in readings:  # 已按时间排序，同一天里后面的覆盖前面的
        by_day[max(0, day_of(t))] = v
    first = min(by_day)
    out, value = [], by_day[first]
    for d in range(last + 1):
        value = by_day.get(d, value)
        out.append(value)
    return out, first


MONTH = 30  # B 站大航海的一个月是 30 天


def suffix_min(xs: list[int]) -> list[int]:
    """第 d 项是从第 d 天到最后一天的最小值。"""
    out = xs[:]
    for d in range(len(out) - 2, -1, -1):
        out[d] = min(out[d], out[d + 1])
    return out


def boarding(starts: list[int], total: list[int]) -> tuple[list[int], dict]:
    """每位现有成员成为「有名字的船」的那天，保证任何一天有名字的船都不超过当天总数。
    starts 是按陪伴天数算出的上舰日；total 到快照日为止，最后一项就是快照日，且不少于名单人数。
    1. 老船优先：按上舰日从早到晚，从上舰日到快照日船队人数一直多于已确认的人数，就从上舰日起有名字。
    2. 确认不了的人，陪伴天数里含以前的任期，每段是整月 30 天：上舰日按 30 天一段往后挪，
       挪到第一个容得下的日子（2026-10-22 核对：122 人里 103 人落在当天有人上舰的日子）。
    3. 挪不进去的算快照当天。"""
    last = len(total) - 1
    days = [last] * len(starts)
    low, sure, rest = suffix_min(total), [], []
    for i in sorted(range(len(starts)), key=lambda i: starts[i]):
        (sure if len(sure) < low[max(0, starts[i])] else rest).append(i)
    boards = Counter(max(0, starts[i]) for i in sure)
    slack, named = total[:], 0  # 每天还能容下几条有名字的船
    for d in range(last + 1):
        named += boards[d]
        slack[d] -= named
    for i in sure:
        days[i] = starts[i]
    shifted = 0
    for i in rest:
        room, day = suffix_min(slack), starts[i] + MONTH
        while day <= last and room[max(0, day)] < 1:
            day += MONTH
        if day <= last:
            days[i], shifted = day, shifted + 1
        for d in range(max(0, days[i]), last + 1):
            slack[d] -= 1
    return days, {"accompany": len(sure), "shifted": shifted, "snapshot": len(rest) - shifted}


ACCOMPANY_LOOKBACK = 7  # 只补最近一周；快照之间仍可能短暂离舰，回填值保留为推定。


def name_key(name: str, hashed: bool) -> str:
    """比较两份快照的昵称时用的键。公开仓库的每日更新只在 Actions 缓存里留最近几天的快照，留之前把昵称换成哈希
    （prune），所以比较时把明文昵称也算成同样的哈希。"""
    if not name or hashed:
        return name
    return "#" + hashlib.sha256(name.encode("utf-8")).hexdigest()[:16]


def prune(data: Path, keep: int = ACCOMPANY_LOOKBACK) -> tuple[int, int]:
    """只给公开仓库的每日更新用：删掉比最新一份早 keep 天以上的快照，其余的昵称换成哈希，再存进 Actions 缓存。
    昵称不进缓存，回填只要哈希就能核对同一个人。返回 (删掉的份数, 留下的份数)。"""
    paths = sorted((data / "guard").glob("*.json"))
    snaps = [load_json(path, None) for path in paths]
    if not snaps:
        return 0, 0
    last = day_of(datetime.fromisoformat(snaps[-1]["time"]).timestamp() * 1000)
    removed_n = 0
    for path, snap in zip(paths, snaps):
        if last - day_of(datetime.fromisoformat(snap["time"]).timestamp() * 1000) > keep:
            path.unlink()
            removed_n += 1
        elif not snap.get("hashed") and "name" in snap["columns"]:
            k = snap["columns"].index("name")
            rows = [[*r[:k], name_key(r[k], False), *r[k + 1:]] for r in snap["members"]]
            save_text(path, snapshot_text(snap["time"], snap["total"], rows, snap["columns"], hashed=True))
    return removed_n, len(paths) - removed_n


def accompany(snapshots: list[dict]) -> tuple[list[int | None], dict]:
    """只回填最新名单的零值；按 id 分组保留碰撞，原快照不改。audit 的 index 是最新名单的行号（从 0 起）。"""
    latest = snapshots[-1]
    last = day_of(datetime.fromisoformat(latest["time"]).timestamp() * 1000)
    history, ambiguous = [], set()
    for snap in snapshots:
        day = day_of(datetime.fromisoformat(snap["time"]).timestamp() * 1000)
        if not 0 <= last - day <= ACCOMPANY_LOOKBACK:
            continue
        groups = defaultdict(list)
        for row in snap["members"]:
            r = dict(zip(snap["columns"], row))
            if (not isinstance(r.get("id"), str) or not re.fullmatch(r"[0-9a-f]{6}", r["id"])
                    or type(r.get("start")) is not int or not 0 <= day - r["start"] < 100_000
                    or not isinstance(r.get("name", ""), str)):
                raise ValueError("名单快照的 id、陪伴天数或昵称格式不合法")
            groups[r["id"]].append(r)
        ambiguous.update(i for i, rows in groups.items() if len(rows) > 1)
        history.append((snap["time"], day, groups, bool(snap.get("hashed"))))
    values, audit = [], {"backfilled": [], "unknown": []}
    for k, row in enumerate(latest["members"]):
        current = dict(zip(latest["columns"], row))
        raw = last - current["start"]
        if raw > 0:
            values.append(raw)
            continue
        value, source, reason = None, None, "no_history"
        if current["id"] in ambiguous:
            reason = "ambiguous_id"
        else:
            name = name_key(current.get("name", ""), bool(latest.get("hashed")))
            for time, day, groups, hashed in reversed(history[:-1]):
                rows = groups.get(current["id"], [])
                if not rows:
                    break  # 更早的任期不跨过缺席；已有更近的正值仍可用。
                previous = rows[0]
                old_name = name_key(previous.get("name", ""), hashed)
                if name and old_name and name != old_name:
                    value, reason = None, "name_changed"
                    break
                name = name or old_name
                if day - previous["start"] > 0:
                    projected = last - previous["start"]
                    if value is not None and value != projected:
                        value, reason = None, "conflicting_days"
                        break
                    if value is None:
                        value, source = projected, time
        values.append(value)
        if value is None:
            audit["unknown"].append({"index": k, "reason": reason})
        else:
            audit["backfilled"].append({"index": k, "raw": raw, "value": value, "from": source})
    return values, audit


def build(data: Path, hane: Path) -> dict:
    guard = load_json(data / "raw" / "vtbs_guard.json", [])
    active = load_json(data / "raw" / "vtbs_active.json", [])
    if not guard or not active:
        raise FileNotFoundError("本机还没有 vtbs.moe 的记录，先运行 update 或 vtbs")
    snaps = sorted((data / "guard").glob("*.json"))
    snapshots = [load_json(path, None) for path in snaps]
    snap = snapshots[-1] if snapshots else None
    if snap and snap.get("hashed"):
        raise ValueError("最新一份快照的昵称已经换成哈希，不能拿来合成页面的名字；先运行 guard 取一份新的")
    totals, last = guard, max(day_of(guard[-1][0]), day_of(active[-1][0]))
    if snap:
        # 合成到这份快照为止，最后一天的总数用快照：它是当时从 B 站读到的，不少于实际取到的人数。
        # 快照之后的 vtbs.moe 记录等下一份快照再用。
        snap_ms = int(datetime.fromisoformat(snap["time"]).timestamp() * 1000)
        # 2026-10-24 以前的快照没有昵称这一列；删除名单里的人按 id 去掉昵称，加进名单后重新 build 就生效
        gone = {h[:6] for h in removed(data)}
        cols = snap["columns"]
        members = [(r[0], r[1], r[2], r[3], r[cols.index("name")] if "name" in cols and r[0] not in gone else "")
                   for r in snap["members"]]
        totals = [r for r in guard if r[0] <= snap_ms] + [[snap_ms, max(snap["total"], len(members))]]
        last = day_of(snap_ms)
    live = live_days(hane)
    # 档案缺的区间改看动态：那几天发了直播预告就算开播；meta.live_by_posts 记下这些区间，页面标成推断
    by_posts = gaps(live, last)
    notices = notice_days(hane, data)
    lit = live | {d for a, b in by_posts for d in range(a, b + 1) if d in notices}
    total, total_from = daily(totals, last)
    followers, followers_from = daily(active, last)
    named, named_by, acc_audit = [], None, {"backfilled": [], "unknown": []}
    if snap:
        acc, acc_audit = accompany(snapshots)
        # 上舰当天算第 1 天；未知只把展示位置放在快照日，不断言当天刚上舰。
        days, named_by = boarding([last - a + 1 if a is not None else last for a in acc], total)
        # acc 是 B 站正值或历史回填的推定值；null 是未知，不参与老船长分档。
        # name 是昵称，'' 是没有名字（旧快照，或要求删掉名字的人）
        named = [{"start": d, "level": lv, "medal": m, "id": i, "acc": a, "name": name}
                 for d, a, (i, lv, m, s, name) in zip(days, acc, members)]
    out = {
        "total": total,
        "followers": followers,
        "live": [int(d in lit) for d in range(last + 1)],
        "named": named,
        "anchors": {k: [[index(d), v] for d, v in pts if index(d) <= last] for k, pts in ANCHORS.items()},
        "meta": {"day0": DAY0.isoformat(), "named_at": snap["time"] if snap else None, "named_by": named_by,
                 "accompany": acc_audit,
                 "live_by_posts": by_posts,
                 "from": {"total": iso(total_from), "followers": iso(followers_from),
                          "live": iso(min(live)) if live else None}},
    }
    check(out)
    save_json(data / "voyage.json", out)
    return out


def check(v: dict) -> None:
    """页面要的 VoyageData 结构；不合格就不写文件。字段固定，别的东西混不进去。"""
    n = len(v["total"])
    ok = (set(v) == {"total", "followers", "live", "named", "anchors", "meta"} and n > 0
          and len(v["followers"]) == n == len(v["live"])
          and all(type(x) is int and x >= 0 for x in v["total"] + v["followers"])
          and all(x in (0, 1) for x in v["live"])
          and all(set(s) == {"start", "level", "medal", "id", "acc", "name"} and type(s["start"]) in (int, float)
                  and s["level"] in (1, 2, 3) and type(s["medal"]) is int and s["medal"] >= 0
                  and (s["acc"] is None or type(s["acc"]) is int and s["acc"] > 0)
                  and re.fullmatch(r"[0-9a-f]{6}", s["id"])
                  and type(s["name"]) is str and len(s["name"]) <= NAME_MAX and clean_name(s["name"]) == s["name"]
                  for s in v["named"])
          and set(v["anchors"]) == {"total", "followers"}
          and all(0 <= d < n and type(x) is int for pts in v["anchors"].values() for d, x in pts)
          and all(type(a) is type(b) is int and 0 <= a <= b < n for a, b in v["meta"]["live_by_posts"]))
    if not ok:
        raise ValueError("合成结果不符合 VoyageData，没有写入")
    starts = sorted(s["start"] for s in v["named"])  # 页面算第 d 天的船：start < d + 1
    if any(bisect_left(starts, d + 1) > v["total"][d] for d in range(n)):
        raise ValueError("有名字的船比当天的总数还多，没有写入")


def anchor_gaps(v: dict) -> list[tuple]:
    """核实数字和数据对不上的地方：[(序列, 日期, 核实值, 数据值)]。"""
    return [(k, iso(d), x, v[k][d]) for k, pts in v["anchors"].items() for d, x in pts if v[k][d] != x]
