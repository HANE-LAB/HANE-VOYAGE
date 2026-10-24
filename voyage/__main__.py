"""HANE Voyage 的大航海数据：uv run python -X utf8 -m voyage {update,vtbs,guard,build,forget}"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

from . import CST, DATA, ROOT
from . import build as B
from . import fetch as F


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    parser = argparse.ArgumentParser(prog="python -m voyage", description=__doc__)
    parser.add_argument("command", choices=("update", "vtbs", "guard", "build", "forget"),
                        help="update 依次运行 vtbs、guard、build；build 只用本机数据，不联网；"
                             "forget 把要求删掉名字的人记进删除名单")
    parser.add_argument("uids", nargs="*", help="forget 用：要删掉名字的人的 UID；不写就逐行输入")
    parser.add_argument("--hane", type=Path, default=ROOT.parent / "hane", help="HANE 的目录，只读其中的开播档案")
    parser.add_argument("--data", type=Path, default=DATA, help="数据目录，默认 data/")
    args = parser.parse_args(argv)
    steps = ("vtbs", "guard", "build") if args.command == "update" else (args.command,)
    try:
        if "forget" in steps:
            uids = args.uids or [line.strip() for line in sys.stdin if line.strip()]
            if not uids:
                raise ValueError("没有给 UID")
            added, wiped = F.forget(args.data, uids)
            # 不打印 UID：终端记录和日志里也不留
            print(f"删除名单新记下 {added} 人（共给了 {len(uids)} 个 UID），已有快照里抹掉 {wiped} 个名字。"
                  "运行 build 后页面上的名字才会消失")
        if "vtbs" in steps:
            for name, (added, t) in F.update_vtbs(args.data / "raw").items():
                print(f"vtbs.moe {name}：新增 {added} 条，最新一条在 {datetime.fromtimestamp(t / 1000, CST):%Y-%m-%d %H:%M}")
        if "guard" in steps:
            r = F.crawl_guard(args.data / "guard")
            members = r["members"]
            levels = Counter(m[1] for m in members)
            print(f"名单：总数 {r['total']}，取到 {len(members)} 人，有名字 {sum(bool(m[4]) for m in members)} 人"
                  f"（{r['pages']}/{r['last']} 页）"
                  f" · 总督 {levels[1]} · 提督 {levels[2]} · 舰长 {levels[3]}"
                  + (f" · 神秘人 {r['hidden']} 位不进名单" if r["hidden"] else ""))
            if members:
                print(f"  粉丝牌 {min(m[2] for m in members)}–{max(m[2] for m in members)} 级"
                      f" · 陪伴 {min(m[3] for m in members)}–{max(m[3] for m in members)} 天")
            if not r["complete"]:
                raise RuntimeError("名单没有翻完或人数对不上，这次不存快照")
            print(f"  快照 {r['file']}")
        if "build" in steps:
            out = B.build(args.data, args.hane)
            print(f"合成 {args.data / 'voyage.json'}：{len(out['total'])} 天，名单 {len(out['named'])} 人"
                  f"（{out['meta']['named_at'] or '还没有快照'}），开播 {sum(out['live'])} 天")
            if by := out["meta"]["named_by"]:
                print(f"  从上舰日起有名字 {by['accompany']} · 按 30 天往后挪 {by['shifted']} · 快照当天才有名字 {by['snapshot']}")
            acc = out["meta"]["accompany"]
            print(f"  陪伴天数：历史回填 {len(acc['backfilled'])} 人 · 未知 {len(acc['unknown'])} 人")
            for kind, day, verified, value in B.anchor_gaps(out):
                print(f"  核实数字对不上：{day} {kind} 核实 {verified}，数据 {value}")
    except (OSError, ValueError, RuntimeError) as e:
        print(f"停止：{e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
