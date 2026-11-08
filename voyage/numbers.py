"""船的编号：按上舰先后给每个见过的人一个号，只增不改（docs/DATA.md「编号」）。

登记簿是 data/numbers.json：{"issued_at": 第一次发号的时间, "through": 上次发号用的名单是第几天, "ships": [[id, 号码, 约], …]}，按号码排。
- 号码一发就不再变：离开的人保留号码，号码不给别人；同一个 id 回来，拿回原来的号。
- 第一批号码由内部工具按上舰日和直播时的上舰记录排好（.internal/tools/numbers/issue.py）；
  之后每天合成数据时，还没有号的人按上舰日、再按 id 接在最大号后面。
- 「约」= 上舰日是推断的：陪伴天数里含以前的任期（上舰日按 30 天往后挪过，或放在快照当天）、
  上次发号时就该在名单上、这次才看到（through 以前上舰的新人）、或者和别人 id 相同。陪伴天数未知的人等知道了再编。
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

NUMBERS = "numbers.json"


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
            or reg.get("through") is not None and type(reg["through"]) is not int):
        raise ValueError("data/numbers.json 的格式不对，没有改动")
    return reg


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


def apply(reg: dict, v: dict, issued_at: str | None = None) -> dict:
    """给 v["named"] 的每个人写上号码 no（没有就不写）和 approx（推断的才写 1），没有号的新人接在最大号后面。
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
    nxt = max((s[1] for s in reg["ships"]), default=0) + 1
    ships = [list(s) for s in reg["ships"]]
    for k in sorted(new, key=lambda k: (v["named"][k]["start"], v["named"][k]["id"], k)):
        s = v["named"][k]
        ap = guessed(s, last, len(groups[s["id"]]) > 1, reg.get("through"))
        ships.append([s["id"], nxt, ap])
        s["no"] = nxt
        if ap:
            s["approx"] = 1
        nxt += 1
    through = reg.get("through")
    return {"issued_at": reg.get("issued_at") or issued_at, "through": last if through is None else max(through, last),
            "ships": ships}
