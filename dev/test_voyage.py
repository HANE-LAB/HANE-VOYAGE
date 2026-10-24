"""大航海采集的离线回归：只用很小的假数据，不访问 B 站和 vtbs.moe，也不读 HANE 的真实档案。"""
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from voyage import CST, UID, build as B, fetch as F
from voyage.__main__ import main

# 假的观众：UID 和头像不能出现在任何保存下来的文件里；昵称只存在快照和页面数据里，不打印。
A, BB, C = 3546000000000001, 1234567890, 3546000000000777
ROOT = Path(__file__).resolve().parent.parent


def ms(y, m, d, h=12, minute=0):
    return int(datetime(y, m, d, h, minute, tzinfo=CST).timestamp() * 1000)


def person(uid, level, medal, accompany, name, rank=1, mystery=False):
    return {"ruid": UID, "rank": rank, "accompany": accompany, "score": 999,
            "uinfo": {"uid": uid, "base": {"name": name, "face": f"https://i0.hdslb.com/bfs/face/{name}.jpg",
                                           "is_mystery": mystery},
                      "medal": {"name": "羽毛团", "level": medal, "ruid": UID},
                      "guard": {"level": level, "expired_str": ""}}}


def page(num, pages, top3=(), rows=()):
    return {"code": 0, "message": "0", "data": {"info": {"num": num, "page": pages, "now": 1},
                                                "top3": list(top3), "list": list(rows)}}


def snapshot(day, rows, hour=12, names=True):
    """小快照，rows 是 (id, 陪伴天数, 昵称)，day 相对 DAY0。"""
    return {"time": f"{B.iso(day)}T{hour:02}:00:00+08:00", "total": len(rows),
            "columns": F.COLUMNS if names else F.COLUMNS[:-1],
            "members": [[i, 3, 7, day - acc, name][:5 if names else 4] for i, acc, name in rows]}


FLEET = (person(A, 1, 30, 600, "假名甲"), person(BB, 3, 5, 0, "假名乙", 2), person(C, 2, 21, 100, "假名丙", 3))
# 和真实接口一样，前三名每页都重复；第二页开头的人因为抓取期间有人进出又出现了一次。
GUARD_PAGES = {"page=1&": page(3, 2, top3=FLEET[:1], rows=FLEET[1:2]),
               "page=2&": page(3, 2, top3=FLEET[:1], rows=FLEET[1:])}
VTBS_FULL = {
    "/v2/bulkGuard/": [{"guardNum": 0, "time": ms(2021, 2, 3, 10)}, None,
                       {"guardNum": 2, "time": ms(2021, 2, 5, 9)}, {"guardNum": 1, "time": ms(2021, 2, 5, 22)}],
    "/v2/bulkActive/": [{"archiveView": 1, "follower": 1700, "time": ms(2021, 2, 4)},
                        {"archiveView": 1, "follower": 1750, "time": ms(2021, 2, 6, 1)}],
}


class Net:
    """按网址片段返回假响应，记下请求过的地址和请求头。"""

    def __init__(self, routes):
        self.routes, self.calls = routes, []

    def __call__(self, url, headers=None):
        self.calls.append((url, headers or {}))
        for part, body in self.routes.items():
            if part in url:
                return body
        raise AssertionError(f"没有准备 {url} 的假响应")


class VoyageTests(unittest.TestCase):
    def setUp(self):
        sandbox = Path(__file__).resolve().parent / ".sandbox"
        sandbox.mkdir(exist_ok=True)
        self.root = Path(tempfile.mkdtemp(dir=sandbox))
        self.addCleanup(shutil.rmtree, self.root)
        self.data = self.root / "data"
        self.hane = self.root / "hane"
        self.archive = self.hane / "data" / "live_sessions.json"
        self.archive.parent.mkdir(parents=True)
        self.archive.write_text(json.dumps({
            "a": {"uid": UID, "item": {"startDate": ms(2021, 2, 4, 23)}, "first_seen": 1, "last_seen": 2},
            # 北京时间 2 月 6 日 1 点，UTC 还是 5 日：按北京时间算第 3 天
            "b": {"uid": UID, "item": {"startDate": ms(2021, 2, 6, 1)}, "first_seen": 1, "last_seen": 2},
            "c": {"uid": 999, "item": {"startDate": ms(2021, 2, 5)}, "first_seen": 1, "last_seen": 2},
        }), encoding="utf-8")
        (self.hane / "data" / "posts.json").write_text(json.dumps([
            # 她的直播预告；档案在这里不缺，所以不影响开播日
            {"author_mid": str(UID), "ts": ms(2021, 2, 8, 23, 30) // 1000, "tags_rule": ["直播预告"]},
        ]), encoding="utf-8")
        for p in (patch.object(F, "pause", lambda: None),
                  patch.object(F, "LOCAL_CONFIG", self.root / "config.local.toml"),
                  patch.dict(os.environ, {"BILI_SESSDATA": "", "BILI_BUVID3": ""})):
            p.start()
            self.addCleanup(p.stop)

    def saved_text(self):
        return "".join(f.read_text(encoding="utf-8") for f in self.data.rglob("*") if f.is_file())

    def crawl(self, routes=GUARD_PAGES, now=datetime(2021, 2, 10, 20, 30, tzinfo=CST)):
        with patch.object(F, "get_json", Net(routes)):
            return F.crawl_guard(self.data / "guard", now=now)

    def test_uid_id_is_short_stable_and_fixed(self):
        a = F.uid_digest(A)
        self.assertEqual(a, F.uid_digest(str(A)))
        self.assertNotEqual(a[:3], F.uid_digest(A + 1)[:3])
        # 页面要用同一算法算观众输入的 UID（浏览器 WebCrypto 算出的也是 82e96c），改算法必须同时改页面并重算快照。
        self.assertEqual(F.uid_digest(1234567890)[:3].hex(), "82e96c")
        self.assertEqual(F.uid_digest("0012345"), F.uid_digest(12345))
        for bad in (0, -5, "abc", None):
            with self.assertRaises((ValueError, TypeError)):
                F.uid_digest(bad)

    def test_vtbs_first_download_is_full_then_only_newer_records_are_added(self):
        raw = self.data / "raw"
        net = Net(VTBS_FULL)
        with patch.object(F, "get_json", net):
            F.update_vtbs(raw)
        self.assertEqual([u for u, _ in net.calls], [f"{F.VTBS}/v2/bulkGuard/{UID}", f"{F.VTBS}/v2/bulkActive/{UID}"])
        guard = json.loads((raw / "vtbs_guard.json").read_text(encoding="utf-8"))
        self.assertEqual(guard, [[ms(2021, 2, 3, 10), 0], [ms(2021, 2, 5, 9), 2], [ms(2021, 2, 5, 22), 1]])
        # 再运行：vtbs.moe 改了旧记录也不动本机的，只追加更晚的；粉丝数只取最近 512 条。
        net = Net({"/v2/bulkGuard/": [{"guardNum": 9, "time": ms(2021, 2, 3, 10)}, {"guardNum": 4, "time": ms(2021, 2, 7)}],
                   "/v2/bulkActiveSome/": [{"follower": 1750, "time": ms(2021, 2, 6, 1)}, {"follower": 1800, "time": ms(2021, 2, 8)}]})
        with patch.object(F, "get_json", net):
            added = F.update_vtbs(raw)
        self.assertEqual([u.split("/")[-2] for u, _ in net.calls], ["bulkGuard", "bulkActiveSome"])
        self.assertEqual(added["guard"][0], 1)
        self.assertEqual(json.loads((raw / "vtbs_guard.json").read_text(encoding="utf-8")), guard + [[ms(2021, 2, 7), 4]])
        self.assertEqual(json.loads((raw / "vtbs_active.json").read_text(encoding="utf-8"))[-1], [ms(2021, 2, 8), 1800])

    def test_vtbs_gap_beyond_recent_records_downloads_full_again(self):
        raw = self.data / "raw"
        with patch.object(F, "get_json", Net(VTBS_FULL)):
            F.update_vtbs(raw)
        net = Net({"/v2/bulkGuard/": VTBS_FULL["/v2/bulkGuard/"],
                   "/v2/bulkActiveSome/": [{"follower": 2000, "time": ms(2021, 3, 1)}],
                   "/v2/bulkActive/": VTBS_FULL["/v2/bulkActive/"] + [{"follower": 1900, "time": ms(2021, 2, 20)},
                                                                       {"follower": 2000, "time": ms(2021, 3, 1)}]})
        with patch.object(F, "get_json", net):
            F.update_vtbs(raw)
        self.assertEqual([u.split("/")[-2] for u, _ in net.calls], ["bulkGuard", "bulkActiveSome", "bulkActive"])
        active = json.loads((raw / "vtbs_active.json").read_text(encoding="utf-8"))
        self.assertEqual([v for _, v in active], [1700, 1750, 1900, 2000])

    def test_bad_vtbs_response_keeps_local_records(self):
        raw = self.data / "raw"
        with patch.object(F, "get_json", Net(VTBS_FULL)):
            F.update_vtbs(raw)
        before = (raw / "vtbs_guard.json").read_bytes()
        for body in ({"code": 404}, [], [{"guardNum": -1, "time": ms(2021, 3, 1)}], [{"guardNum": 3, "time": "昨天"}]):
            with self.subTest(body=body), patch.object(F, "get_json", Net({"/v2/": body})):
                with self.assertRaises(ValueError):
                    F.update_vtbs(raw)
            self.assertEqual((raw / "vtbs_guard.json").read_bytes(), before)

    def test_guard_snapshot_keeps_ids_numbers_and_names(self):
        r = self.crawl()
        self.assertTrue(r["complete"])
        self.assertEqual(r["file"].name, "20210210-203000.json")
        text = r["file"].read_text(encoding="utf-8")
        snap = json.loads(text)
        self.assertEqual((snap["time"], snap["total"]), ("2021-02-10T20:30:00+08:00", 3))
        self.assertEqual(snap["columns"], ["id", "level", "medal", "start", "name"])
        # 第 7 天抓取；start = 7 − 陪伴天数。第二页重复的人只算一次，按 id 排序，不保留 B 站的排名顺序。
        expected = sorted([F.uid_digest(u)[:3].hex(), lv, m, 7 - acc, name] for u, lv, m, acc, name in
                          ((A, 1, 30, 600, "假名甲"), (BB, 3, 5, 0, "假名乙"), (C, 2, 21, 100, "假名丙")))
        self.assertEqual(snap["members"], expected)
        self.assertIn("假名甲", text)  # 昵称照原样写，不转义
        for secret in (str(A), str(BB), str(C), "hdslb", "face", "羽毛团", "rank", "999"):
            self.assertNotIn(secret, text)

    def test_names_are_cleaned_before_they_are_saved(self):
        cases = {"猫\u202e甲": "猫甲",            # 方向控制符会把后面的字倒过来显示
                 "a\nb\t c\u2028d": "a b c d",    # 换行、制表、行分隔符压成一个空格
                 "x\u200by\x00\x1bz": "xyz",       # 零宽空格、控制字符
                 "👨\u200d👩\u200d👧": "👨\u200d👩\u200d👧",  # 表情里的连接符留着
                 "e\u0301": "é", "  ": "", None: "", 42: "",
                 "😀" * 40: "😀" * F.NAME_MAX, "ab\u200d\ufe0f": "ab"}
        for raw, want in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(F.clean_name(raw), want)
        odd = person(A, 3, 5, 10, "\u202e假名\n\u200b丁")
        r = self.crawl({"page=1&": page(1, 1, rows=[odd])})
        self.assertEqual(json.loads(r["file"].read_text(encoding="utf-8"))["members"][0][4], "假名 丁")

    def test_forgotten_names_leave_every_file_and_no_uid_is_kept(self):
        self.crawl()
        out = io.StringIO()
        with redirect_stdout(out), redirect_stderr(out):
            self.assertEqual(main(["forget", str(A), "--data", str(self.data)]), 0, out.getvalue())
            self.assertEqual(main(["forget", str(A), "--data", str(self.data)]), 0)  # 再记一次不重复
        removals = json.loads((self.data / F.REMOVALS).read_text(encoding="utf-8"))
        self.assertEqual(removals, [F.uid_digest(A).hex()])
        self.assertNotIn(str(A), out.getvalue() + self.saved_text())
        # 已有的快照里抹掉了，别人的名字还在
        snap = json.loads(next((self.data / "guard").glob("*.json")).read_text(encoding="utf-8"))
        names = {row[0]: row[4] for row in snap["members"]}
        self.assertEqual(names[F.uid_digest(A)[:3].hex()], "")
        self.assertEqual(names[F.uid_digest(BB)[:3].hex()], "假名乙")
        self.assertNotIn("假名甲", self.saved_text())
        # 以后的抓取不再存这个人的名字
        r = self.crawl(now=datetime(2021, 2, 11, 9, tzinfo=CST))
        self.assertEqual({m[0]: m[4] for m in r["members"]}[F.uid_digest(A)[:3].hex()], "")
        self.assertNotIn("假名甲", r["file"].read_text(encoding="utf-8"))
        with self.assertRaisesRegex(ValueError, "正整数") as caught:
            F.forget(self.data, ["12a45"])
        self.assertNotIn("12a45", str(caught.exception))

    def test_build_drops_listed_names_even_from_an_old_snapshot(self):
        with patch.object(F, "get_json", Net(VTBS_FULL)):
            F.update_vtbs(self.data / "raw")
        self.crawl()
        v = B.build(self.data, self.hane)
        self.assertEqual(sorted(n["name"] for n in v["named"]), ["假名丙", "假名乙", "假名甲"])
        # 名单是后来加的：不重新抓，build 也按 id 去掉
        (self.data / F.REMOVALS).write_text(json.dumps([F.uid_digest(C).hex()]), encoding="utf-8")
        v = B.build(self.data, self.hane)
        self.assertEqual({n["id"]: n["name"] for n in v["named"]}[F.uid_digest(C)[:3].hex()], "")
        # 2026-10-24 以前的快照没有昵称这一列
        old = self.data / "guard" / "20210211-090000.json"
        old.write_text(F.snapshot_text("2021-02-11T09:00:00+08:00", 3,
                                       [["a1b2c3", 3, 5, 7], ["a1b2c4", 2, 9, 6], ["a1b2c5", 1, 1, 8]],
                                       ["id", "level", "medal", "start"]), encoding="utf-8")
        self.assertEqual([n["name"] for n in B.build(self.data, self.hane)["named"]], ["", "", ""])

    def test_page_hashes_a_uid_the_way_the_crawler_does(self):
        # 页面在浏览器里用 WebCrypto 算观众输入的 UID（src/uid.ts）；Node 有同样的 WebCrypto，能直接跑这个文件
        if not shutil.which("node"):
            self.skipTest("没有 node")
        uids = ["1234567890", "0012345", str(A)]
        script = ("const { uidId } = await import(process.argv[1]); "
                  "console.log(JSON.stringify(await Promise.all(process.argv.slice(2).map(uidId))))")
        got = subprocess.run(["node", "--input-type=module", "-e", script, (ROOT / "src" / "uid.ts").as_uri(), *uids],
                             capture_output=True, text=True, encoding="utf-8", timeout=60)
        self.assertEqual(got.returncode, 0, got.stderr)
        self.assertEqual(json.loads(got.stdout), [F.uid_digest(u)[:3].hex() for u in uids])

    def test_mystery_members_stay_out_of_the_list_but_count_as_present(self):
        hidden = person(A + 5, 3, 9, 4, "假名丁", 4, mystery=True)
        r = self.crawl({"page=1&": page(4, 2, top3=FLEET[:1], rows=FLEET[1:2]),
                        "page=2&": page(4, 2, top3=FLEET[:1], rows=[FLEET[2], hidden])})
        self.assertTrue(r["complete"])
        self.assertEqual((len(r["members"]), r["hidden"]), (3, 1))
        self.assertNotIn(F.uid_digest(A + 5)[:3].hex(), r["file"].read_text(encoding="utf-8"))

    def test_guard_failures_save_no_snapshot_and_leak_nothing(self):
        a, b = FLEET[:2]
        with self.assertRaisesRegex(F.BiliError, "风控"):
            self.crawl({"page=1&": page(2, 2, rows=[a]), "page=2&": {"code": -352, "message": "风控校验失败"}})
        with self.assertRaises(ValueError) as caught:
            self.crawl({"page=1&": page(1, 1, rows=[{"accompany": 3, "uinfo": {"uid": A, "base": {"name": "假名甲"}}}])})
        self.assertNotIn(str(A), str(caught.exception))
        self.assertNotIn("假名", str(caught.exception))
        for name, routes in {"不给更深的页": {"page=1&": page(2, 2, rows=[a]), "page=2&": page(2, 2)},
                             "分页没有前进": {"page=1&": page(2, 2, rows=[a]), "page=2&": page(2, 2, rows=[a])},
                             "人数对不上": {"page=1&": page(5, 1, rows=[a, b])},
                             "收到的比总数多": {"page=1&": page(1, 1, top3=FLEET[:1], rows=FLEET[1:])},
                             "成功但名单是空的": {"page=1&": page(0, 0)}}.items():
            with self.subTest(name):
                self.assertFalse(self.crawl(routes)["complete"])
        self.assertFalse((self.data / "guard").exists())

    def test_network_errors_retry_but_blocks_stop_at_once(self):
        with patch("urllib.request.urlopen", side_effect=[urllib.error.URLError("down"), io.BytesIO(b'{"code":0}')]) as get, \
                patch("time.sleep") as sleep:
            self.assertEqual(F.get_json("https://example.invalid/"), {"code": 0})
        self.assertEqual((get.call_count, sleep.call_count), (2, 1))
        blocked = urllib.error.HTTPError("https://example.invalid/", 412, "Precondition Failed", {}, None)
        with patch("urllib.request.urlopen", side_effect=[blocked]) as get, patch("time.sleep"):
            with self.assertRaises(F.BiliError):
                F.get_json("https://example.invalid/")
        self.assertEqual(get.call_count, 1)

    def test_build_composes_voyage_data_from_small_fake_sources(self):
        with patch.object(F, "get_json", Net(VTBS_FULL)):
            F.update_vtbs(self.data / "raw")
        self.crawl()
        before = self.archive.read_bytes()
        v = B.build(self.data, self.hane)
        self.assertEqual(self.archive.read_bytes(), before)  # HANE 的档案只读
        # 第 0–7 天。2 月 5 日两条取晚的那条；第 7 天用快照里 B 站的总数；粉丝第一条之前沿用第一条。
        self.assertEqual(v["total"], [0, 0, 1, 1, 1, 1, 1, 3])
        self.assertEqual(v["followers"], [1700, 1700, 1700, 1750, 1750, 1750, 1750, 1750])
        self.assertEqual(v["live"], [0, 1, 0, 1, 0, 0, 0, 0])  # 第 6 天的预告不算：档案没有缺这一段
        self.assertEqual(v["meta"]["live_by_posts"], [])
        # 上舰日 = 7 − 陪伴天数 + 1，两位老成员算出来在第 0 天以前，可第 0、1 天船队是 0 人，
        # 确认不了，往后挪 30 天也挪不进第 0–7 天，算快照当天（第 7 天）。0 天无历史依据时是未知。
        # acc 保留 B 站的正值，挪过上舰日的人也不变。
        self.assertEqual(sorted((n["level"], n["medal"], n["start"], n["acc"], n["name"]) for n in v["named"]),
                         [(1, 30, 7, 600, "假名甲"), (2, 21, 7, 100, "假名丙"), (3, 5, 7, None, "假名乙")])
        self.assertEqual(v["meta"]["named_by"], {"accompany": 1, "shifted": 0, "snapshot": 2})
        self.assertEqual(v["anchors"], {"total": [[0, 0]], "followers": [[0, 1683]]})
        self.assertEqual(B.anchor_gaps(v), [("followers", "2021-02-03", 1683, 1700)])
        self.assertEqual(v["meta"]["from"], {"total": "2021-02-03", "followers": "2021-02-04", "live": "2021-02-04"})
        self.assertEqual(json.loads((self.data / "voyage.json").read_text(encoding="utf-8")), v)

    def test_accompany_recovers_only_zeros_without_changing_snapshots(self):
        old = snapshot(5, [("aaaaaa", 11, "甲"), ("bbbbbb", 40, "乙"), ("cccccc", 8, "丙")], names=False)
        morning = snapshot(7, [("aaaaaa", 13, "甲"), ("bbbbbb", 0, "乙"), ("cccccc", 10, "丙")], hour=8)
        latest = snapshot(7, [("aaaaaa", 0, "甲"), ("bbbbbb", 0, "乙"), ("cccccc", 9, "丙"), ("dddddd", 0, "丁")])
        snaps = [old, morning, latest]
        before = json.dumps(snaps)
        values, audit = B.accompany(snaps)
        self.assertEqual(values, [13, 42, 9, None])  # 正值即使与历史不同，也不擅自取最大值
        self.assertEqual(audit, {"backfilled": [
            {"index": 0, "raw": 0, "value": 13, "from": morning["time"]},
            {"index": 1, "raw": 0, "value": 42, "from": old["time"]}],
            "unknown": [{"index": 3, "reason": "no_history"}]})
        self.assertEqual(json.dumps(snaps), before)
        # 合成也不动三份快照；保留最新名单与昵称，不复活已经离开的人。
        with patch.object(F, "get_json", Net(VTBS_FULL)):
            F.update_vtbs(self.data / "raw")
        for j, s in enumerate(snaps):
            F.save_text(self.data / "guard" / f"{j}.json", json.dumps(s))
        saved = {p: p.read_bytes() for p in (self.data / "guard").glob("*.json")}
        v = B.build(self.data, self.hane)
        self.assertEqual([n["acc"] for n in v["named"]], values)
        self.assertEqual(v["meta"]["accompany"], audit)
        self.assertEqual(v["total"][-1], 4)
        self.assertEqual(v["named"][-1]["start"], 7)
        self.assertEqual({p: p.read_bytes() for p in saved}, saved)

    def test_accompany_skips_collisions_names_conflicts_absences_and_old_evidence(self):
        old = snapshot(5, [("aaaaaa", 11, "甲")])
        latest = snapshot(7, [("aaaaaa", 0, "甲")])
        cases = [
            ([snapshot(5, [("aaaaaa", 11, "甲"), ("aaaaaa", 30, "乙")]), latest], "ambiguous_id"),
            ([old, snapshot(7, [("aaaaaa", 0, "甲"), ("aaaaaa", 0, "乙")])], "ambiguous_id"),
            ([old, snapshot(6, [("aaaaaa", 0, "甲"), ("aaaaaa", 0, "乙")]), latest], "ambiguous_id"),
            ([old, snapshot(7, [("aaaaaa", 0, "改名")])], "name_changed"),
            ([old, snapshot(6, [("aaaaaa", 12, "改名")]), latest], "name_changed"),
            ([old, snapshot(6, [("aaaaaa", 13, "甲")]), latest], "conflicting_days"),
            ([old, snapshot(6, []), latest], "no_history"),
            ([old, snapshot(13, [("aaaaaa", 0, "甲")])], "no_history"),
        ]
        for snaps, reason in cases:
            with self.subTest(reason=reason, snapshots=snaps):
                values, audit = B.accompany(snaps)
                self.assertTrue(all(v is None for v in values))
                self.assertFalse(audit["backfilled"])
                self.assertTrue(all(r["reason"] == reason for r in audit["unknown"]))
        # 缺席后重新出现的正值可作新依据；不跨过缺席继续使用更早任期。
        self.assertEqual(B.accompany([old, snapshot(6, []), snapshot(7, [("aaaaaa", 2, "甲")]),
                                      snapshot(8, [("aaaaaa", 0, "甲")])])[0], [3])
        # 哈希碰撞不改变最新的正值，也不合并两个人。
        self.assertEqual(B.accompany([old, snapshot(7, [("aaaaaa", 13, "甲"), ("aaaaaa", 0, "乙")])])[0], [13, None])

    def test_accompany_uses_beijing_calendar_days_and_rejects_bad_history(self):
        old = snapshot(5, [("aaaaaa", 11, "甲")])
        # UTC 2 月 10 日 16 点已经是北京时间 2 月 11 日，DAY0 后第 8 天。
        latest = snapshot(8, [("aaaaaa", 0, "甲")])
        latest["time"] = "2021-02-10T16:00:00+00:00"
        self.assertEqual(B.accompany([old, latest])[0], [14])
        for bad_start in (None, 5.5, 6, "5"):
            bad = snapshot(5, [("aaaaaa", 11, "甲")])
            bad["members"][0][3] = bad_start
            with self.subTest(start=bad_start), self.assertRaises(ValueError):
                B.accompany([bad, latest])

    def test_long_stretches_without_archived_lives_follow_the_notices(self):
        # 连续 7 天以上档案没有场次才算缺；第一场之前也算，最后一段到最后一天为止。
        self.assertEqual(B.gaps({3, 12}, 20), [[4, 11], [13, 20]])
        self.assertEqual(B.gaps({7, 9}, 14), [[0, 6]])
        self.assertEqual(B.gaps(set(), 3), [])
        posts = self.hane / "data" / "posts.json"
        posts.write_text(json.dumps([
            {"author_mid": str(UID), "ts": ms(2021, 2, 5, 23, 30) // 1000, "tags_rule": ["直播预告"]},  # 零点后开播，算第 3 天
            {"author_mid": str(UID), "ts": ms(2021, 2, 7, 21, 55) // 1000, "tags_rule": ["直播预告", "游戏"]},  # 第 4 天
            {"author_mid": str(UID), "ts": ms(2021, 2, 9, 20) // 1000, "tags_rule": ["日常/杂谈"]},
            {"author_mid": "999", "ts": ms(2021, 2, 10, 20) // 1000, "tags_rule": ["直播预告"]},
        ]), encoding="utf-8")
        self.assertEqual(B.notice_days(self.hane), {3, 4})
        posts.unlink()
        with self.assertRaisesRegex(FileNotFoundError, "--hane"):
            B.notice_days(self.hane)

    def test_named_ships_never_outnumber_the_fleet_and_old_ships_come_first(self):
        # 第 0–44 天：1、2 人，然后 3 人，第 10–34 天跌到 2 人，第 35 天起暴涨。
        total = [1, 2] + [3] * 8 + [2] * 25 + [6] + [9] * 9
        starts = {"a": 0, "b": 1, "c": 5, "d": 20, "e": 36, "f": 44}
        names = list(starts)[::-1]  # 输入顺序不影响结果
        days, by = B.boarding([starts[k] for k in names], total)
        got = dict(zip(names, days))
        # a、b 是老船，一直有名字；第 10 天只剩 2 人，c、d 不可能从上舰日起一直在。
        # c 往后挪一个月正好落在暴涨的第 35 天；d 挪一个月到第 50 天已超出，算快照当天（第 44 天）。
        self.assertEqual(got, {"a": 0, "b": 1, "c": 35, "d": 44, "e": 36, "f": 44})
        self.assertEqual(by, {"accompany": 4, "shifted": 1, "snapshot": 1})
        self.assertTrue(all(sum(x <= d for x in days) <= total[d] for d in range(len(total))))

    def test_build_refuses_missing_sources_and_bad_output(self):
        with self.assertRaisesRegex(FileNotFoundError, "vtbs"):
            B.build(self.data, self.hane)
        with patch.object(F, "get_json", Net(VTBS_FULL)):
            F.update_vtbs(self.data / "raw")
        with self.assertRaisesRegex(FileNotFoundError, "--hane"):
            B.build(self.data, self.root / "nowhere")
        v = B.build(self.data, self.hane)  # 还没有快照时名单为空，其余照常合成
        self.assertEqual((v["named"], v["meta"]["named_at"]), ([], None))
        good = {"start": 3, "level": 3, "medal": 2, "id": "a1b2c3", "acc": 4, "name": "假名"}  # 第 3 天船队有 1 人
        B.check({**v, "named": [good]})
        B.check({**v, "named": [{**good, "acc": None}]})
        for bad in ({**v, "uids": [1]}, {**v, "live": v["live"][:-1]}, {**v, "live": [2] * len(v["live"])},
                    {**v, "named": [{**good, "uid": A}]}, {**v, "named": [{**good, "id": str(A)}]},
                    {**v, "named": [{**good, "level": 4}]}, {**v, "named": [good, {**good, "id": "a1b2c4"}]},
                    {**v, "named": [{**good, "start": 0}]}, {**v, "named": [{**good, "acc": -1}]},
                    {**v, "named": [{**good, "acc": 0}]}, {**v, "named": [{**good, "acc": True}]},
                    {**v, "named": [{k: x for k, x in good.items() if k != "acc"}]},
                    {**v, "named": [{k: x for k, x in good.items() if k != "name"}]},
                    {**v, "named": [{**good, "name": None}]}, {**v, "named": [{**good, "name": "假\u202e名"}]},
                    {**v, "named": [{**good, "name": "长" * (F.NAME_MAX + 1)}]},
                    {**v, "named": [{**good, "name": " 前后有空格 "}]},
                    {**v, "meta": {**v["meta"], "live_by_posts": [[2, 99]]}}):
            with self.assertRaises(ValueError):
                B.check(bad)

    def test_update_runs_offline_and_never_prints_or_saves_the_cookie(self):
        net = Net({**VTBS_FULL, **GUARD_PAGES})
        out = io.StringIO()
        with patch.dict(os.environ, {"BILI_SESSDATA": "SECRET-SESSDATA"}), patch.object(F, "get_json", net), \
                redirect_stdout(out), redirect_stderr(out):
            code = main(["update", "--data", str(self.data), "--hane", str(self.hane)])
        self.assertEqual(code, 0, out.getvalue())
        B.check(json.loads((self.data / "voyage.json").read_text(encoding="utf-8")))
        bili = [h.get("Cookie", "") for u, h in net.calls if "bilibili" in u]
        self.assertTrue(bili and all("SESSDATA=SECRET-SESSDATA" in c for c in bili))
        self.assertFalse(any("Cookie" in h for u, h in net.calls if "vtbs" in u))
        for secret in ("SECRET", str(A), "假名"):
            self.assertNotIn(secret, out.getvalue())  # 昵称存进快照和页面数据，但不打印
        for secret in ("SECRET", str(A)):
            self.assertNotIn(secret, self.saved_text())


if __name__ == "__main__":
    unittest.main(verbosity=2)
