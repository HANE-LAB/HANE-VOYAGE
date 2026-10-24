"""HANE Voyage 的大航海数据采集：vtbs.moe 每日总数、B 站在册名单、HANE 开播档案，合成 data/voyage.json。"""
from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UID, ROOM = 2094031249, 22748536      # 火羽ひのめ 的 B 站 UID 与直播间
DAY0 = date(2021, 2, 3)               # 页面的第 0 天
CST = timezone(timedelta(hours=8))    # 按北京时间划分日期


def day_of(ms: float) -> int:
    """毫秒时间戳 → 第几天（北京时间）。"""
    return (datetime.fromtimestamp(ms / 1000, CST).date() - DAY0).days


def load_json(path: Path, default):
    # 文件损坏时让 JSONDecodeError 抛出：停下来，不用新数据覆盖旧存档。
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def save_text(path: Path, text: str) -> None:
    """先写临时文件再替换；中途出错时旧文件保持原样。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8", newline="\n")  # 仓库统一用 LF，Windows 上也不写 CRLF
    os.replace(tmp, path)


def save_json(path: Path, obj) -> None:
    save_text(path, json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
