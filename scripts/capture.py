"""Captures the docs screenshots and slide images from a running Nightdesk (npm start).
Usage: python scripts/capture.py [shots|slides]"""
import json, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "docs" / "img"
SLIDES = ROOT / "docs" / "slides"
import os
BASE = os.environ.get("BASE", "http://localhost:8791")


def api(path, body=None):
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(), headers={"content-type": "application/json"}, method="GET" if body is None else "POST")
    return json.load(urllib.request.urlopen(req, timeout=30))


def wait_all_handled(limit=900):
    t0 = time.time()
    while time.time() - t0 < limit:
        ms = api("/api/state")["messages"]
        if ms and all(m["status"] not in ("new", "working") for m in ms):
            return ms
        time.sleep(3)
    return api("/api/state")["messages"]


def shots():
    IMG.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
        api("/api/reset", {})
        pg.goto(BASE); pg.wait_for_timeout(1500)
        pg.screenshot(path=IMG / "dashboard-empty.png")
        api("/api/seed", {})
        pg.wait_for_timeout(5000)
        pg.screenshot(path=IMG / "dashboard-working.png")
        ms = wait_all_handled()
        find = lambda s: next(m for m in ms if s in m["subject"])
        harbor, finch = find("scanners"), find("Charged twice")
        pg.goto(f"{BASE}/?m={harbor['id']}"); pg.wait_for_timeout(2500)
        pg.screenshot(path=IMG / "dashboard-escalated.png")
        pg.goto(f"{BASE}/?m={finch['id']}"); pg.wait_for_timeout(2500)
        pg.screenshot(path=IMG / "dashboard-draft.png")
        api(f"/api/messages/{finch['id']}/approve", {})
        api("/api/brief", {})
        pg.wait_for_timeout(2500)
        pg.screenshot(path=IMG / "dashboard-brief.png")
        b.close()
    print("shots done", [m.get("engine") for m in ms])


def slides():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1920, "height": 1080})
        pg.goto((SLIDES / "slides.html").as_uri()); pg.wait_for_timeout(2500)
        n = pg.locator("section.s").count()
        for i in range(n):
            pg.locator("section.s").nth(i).screenshot(path=SLIDES / f"s{i + 1}.png")
        pg.add_style_tag(content="body{background:none} .s{margin:0 !important; page-break-after:always}")
        pg.pdf(path=SLIDES / "Nightdesk-slides.pdf", width="1920px", height="1080px", print_background=True)
        b.close()
    print("slides done", n)


if __name__ == "__main__":
    {"shots": shots, "slides": slides}[sys.argv[1] if len(sys.argv) > 1 else "shots"]()
