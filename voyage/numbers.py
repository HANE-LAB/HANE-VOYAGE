"""船的编号：按上舰先后给每个见过的人一个号，只增不改（docs/DATA.md「编号」）。

登记簿是 data/numbers.json：{"issued_at": 第一次发号的时间, "through": 上次发号用的名单是第几天,
"boarding_until": 上舰记录读到哪一场的开播时间, "ships": [[id, 号码, 约], …]}，按号码排。
- 号码一发就不再变：离开的人保留号码，号码不给别人；同一个 id 回来，拿回原来的号。
- 第一批号码由内部工具按上舰日和直播时的上舰记录排好；之后每天合成数据时，还没有号的人接在最大号后面：
  先按上舰日；同一天里，直播时上舰（data/raw/boarding.json 里有记录）的按时间排在前面，其余的按 id。
  名单上看不到、但有上舰记录的人（舰队过万后名单只给 9999 人）也按时间留一个号，以后出现在名单上时拿回这个号。
- 「约」= 上舰日是推断的：陪伴天数里含以前的任期（上舰日按 30 天往后挪过，或放在快照当天）、
  上次发号时就该在名单上、这次才看到（through 以前上舰的新人）、或者和别人 id 相同。陪伴天数未知的人等知道了再编。
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from . import day_of

NUMBERS = "numbers.json"
BOARDING = Path("raw") / "boarding.json"   # voyage/fetch.py 的 update_boarding 写的，git 忽略


def load(data: Path) -> dict:
    path = data / NUMBERS
    if not path.exists():
        return {"issued_at": None, "through": None, "ships": []}
    reg = json.loads(path.read_text(encoding="utf-8"))
    ships = reg.get("ships")
    if (not isinstance(ships, list)
            or not all(isinstance(s, list) and len(s) == 3 and isinstance(s[0], str) and type(s[1]) is int and s[1] > 0
                       and s[2] in (0, 1) for s in ships)
            or len({s[1] for s in ships}) != len(ships)
            or reg.get("through") is not None and type(reg["through"]) is not int
            or reg.get("boarding_until") is not None and not _when(reg["boarding_until"])):
        raise ValueError("data/numbers.json 的格式不对，没有改动")
    return reg


def _when(text) -> int | None:
    """登记簿里的时间（带时区的 ISO 文字）→ 毫秒；格式不对时返回 None。"""
    try:
        t = datetime.fromisoformat(text)
    except (TypeError, ValueError):
        return None
    return int(t.timestamp() * 1000) if t.tzinfo else None


def records(data: Path) -> dict | None:
    """data/raw/boarding.json：每日更新抓的、新播完的场次里直播时的上舰记录；没有这份文件时是 None。"""
    path = data / BOARDING
    if not path.exists():
        return None
    r = json.loads(path.read_text(encoding="utf-8"))
    rows = r.get("rows") if isinstance(r, dict) else None
    if (not _when(r.get("until") if isinstance(r, dict) else None) or not isinstance(rows, list)
            or not all(isinstance(x, list) and len(x) == 4 and isinstance(x[0], str) and type(x[1]) is int
                       and isinstance(x[2], str) and type(x[3]) is int for x in rows)):
        raise ValueError("data/raw/boarding.json 的格式不对")
    return r


def save(data: Path, reg: dict) -> None:
    reg["ships"].sort(key=lambda s: s[1])
    text = json.dumps(reg, ensure_ascii=False, separators=(",", ":"))
    # 一行一条，git 的差异只显示新加的号
    text = text.replace(',"ships":[[', ',"ships":[\n[').replace("],[", "],\n[")
    (data / NUMBERS).write_text(text + "\n", encoding="utf-8", newline="\n")


def guessed(s: dict, last: int, twins: bool, through: int | None) -> int:
    """这个人的上舰日是不是推断的（见文件开头）。last 是快照日，through 是上次发号用的名单的那一天。"""
    if twins or s["acc"] is None:
        return 1
    return int(s["start"] != last - s["acc"] + 1 or through is not None and s["start"] < through)


def apply(reg: dict, v: dict, issued_at: str | None = None, recs: dict | None = None) -> dict:
    """给 v["named"] 的每个人写上号码 no（没有就不写）和 approx（推断的才写 1），没有号的新人接在最大号后面；
    recs 是 records() 读到的上舰记录，用来排同一天里的先后、给名单上看不到的人留号。
    返回更新后的登记簿；不改动已经发出去的号。"""
    last = len(v["total"]) - 1
    have: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for i, no, ap in reg["ships"]:
        have[i].append((no, ap))
    for nos in have.values():
        nos.sort()
    groups: dict[str, list[int]] = defaultdict(list)
    for k, s in enumerate(v["named"]):
        s.pop("no", None)
        s.pop("approx", None)
        groups[s["id"]].append(k)
    new = []
    for i, ks in groups.items():
        ks.sort(key=lambda k: (v["named"][k]["start"], k))
        for j, k in enumerate(ks):
            if j < len(have[i]):
                no, ap = have[i][j]
                v["named"][k]["no"] = no
                if ap:
                    v["named"][k]["approx"] = 1
            elif v["named"][k]["acc"] is not None:
                new.append(k)
    first: dict[str, tuple[int, str, int]] = {}   # id → 最早一笔上舰记录（时间、场次、序号）
    for i, t, lid, seq in (recs or {}).get("rows", ()):
        if i not in first or (t, lid, seq) < first[i]:
            first[i] = (t, lid, seq)

    def order(k: int) -> tuple:
        s, r = v["named"][k], first.get(v["named"][k]["id"])
        if r and day_of(r[0]) == s["start"]:
            return (s["start"], 0, *r, s["id"], k)
        return (s["start"], 1, 0, "", 0, s["id"], k)

    # 名单上看不到、有记录、还没有号的人：按记录的时间留号
    held = [((day_of(r[0]), 0, *r, i, -1), i) for i, r in first.items() if i not in have and i not in groups]
    nxt = max((s[1] for s in reg["ships"]), default=0) + 1
    ships = [list(s) for s in reg["ships"]]
    for key, who in sorted([(order(k), k) for k in new] + held):
        if isinstance(who, str):
            ships.append([who, nxt, 0])
        else:
            s = v["named"][who]
            ap = guessed(s, last, len(groups[s["id"]]) > 1, reg.get("through"))
            ships.append([s["id"], nxt, ap])
            s["no"] = nxt
            if ap:
                s["approx"] = 1
        nxt += 1
    through = reg.get("through")
    out = {"issued_at": reg.get("issued_at") or issued_at, "through": last if through is None else max(through, last)}
    until = [x for x in (reg.get("boarding_until"), (recs or {}).get("until")) if x]
    if until:
        out["boarding_until"] = max(until, key=_when)
    out["ships"] = ships
    return out
