"""A local page for approving cut clips by eye.

Serves data/clips as a grid of looping videos. Keys: j/k move, a approve,
r reject, u undo. Decisions append to data/review.jsonl.
"""

import json
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PAGE = """<!doctype html>
<meta charset="utf-8">
<title>Lipreadle review</title>
<style>
  body { margin: 0; padding: 16px; background: #111; color: #ddd; font: 15px system-ui; }
  header { display: flex; gap: 16px; align-items: baseline; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  .card { border: 3px solid transparent; padding: 4px; }
  .card.current { border-color: #fff; }
  .card.approved { border-color: #3a3; }
  .card.rejected { border-color: #a33; opacity: 0.5; }
  video { width: 100%; aspect-ratio: 4 / 3; display: block; background: #222; }
  .meta { display: flex; justify-content: space-between; font-size: 13px; color: #999; }
  .word { color: #fff; font-size: 17px; }
</style>
<header>
  <strong>Review</strong>
  <span id="count"></span>
  <span>j/k move, a approve, r reject, u undo, space replay</span>
</header>
<div class="grid" id="grid"></div>
<script>
const clips = __CLIPS__;
const decisions = __DECISIONS__;
let cur = 0;
const grid = document.getElementById("grid");
const frag = document.createDocumentFragment();
for (const c of clips) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.key = c.key;
  const stats = `yaw ${c.yaw.toFixed(0)} ap ${c.aperture.toFixed(2)} sharp ${c.sharp.toFixed(0)}`;
  const src = `/clips/${c.key}.mp4`;
  card.innerHTML = `<video muted loop playsinline preload="none" data-src="${src}"></video>
    <div class="meta"><span class="word">${c.word} <small>${c.accent}</small></span>
    <span>${stats}</span></div>`;
  frag.append(card);
}
grid.append(frag);
const cards = [...grid.children];

// Only cards near the viewport hold a decoding video; the rest release theirs.
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const v = e.target.querySelector("video");
    if (e.isIntersecting) {
      if (!v.src) v.src = v.dataset.src;
      v.play().catch(() => {});
    } else if (v.src) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
  }
}, { rootMargin: "400px 0px" });
cards.forEach((c) => io.observe(c));

function paintCard(i) {
  const el = cards[i];
  if (!el) return;
  const d = decisions[el.dataset.key];
  el.classList.toggle("current", i === cur);
  el.classList.toggle("approved", d === "approve");
  el.classList.toggle("rejected", d === "reject");
}
function paintCount() {
  const done = cards.filter((el) => decisions[el.dataset.key]).length;
  document.getElementById("count").textContent = `${done} / ${clips.length} decided`;
}
function moveTo(i) {
  const prev = cur;
  cur = Math.max(0, Math.min(i, cards.length - 1));
  paintCard(prev);
  paintCard(cur);
  cards[cur]?.scrollIntoView({ block: "center" });
}
async function decide(verdict) {
  const key = cards[cur].dataset.key;
  if (verdict === "undo") delete decisions[key]; else decisions[key] = verdict;
  paintCard(cur);
  paintCount();
  await fetch("/decision", { method: "POST", body: JSON.stringify({ key, verdict }) });
  if (verdict !== "undo") moveTo(cur + 1);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "j") moveTo(cur + 1);
  else if (e.key === "k") moveTo(cur - 1);
  else if (e.key === "a") decide("approve");
  else if (e.key === "r") decide("reject");
  else if (e.key === "u") { moveTo(cur - 1); decide("undo"); }
  else if (e.key === " ") {
    e.preventDefault();
    const v = cards[cur].querySelector("video");
    if (!v.src) v.src = v.dataset.src;
    v.currentTime = 0;
    v.play().catch(() => {});
  }
});
grid.addEventListener("click", (e) => {
  const i = cards.indexOf(e.target.closest(".card"));
  if (i >= 0) moveTo(i);
});
cards.forEach((_, i) => paintCard(i));
paintCount();
</script>
"""


def load_decisions(path: Path) -> dict[str, str]:
    decisions: dict[str, str] = {}
    if not path.exists():
        return decisions
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        d = json.loads(line)
        if d["verdict"] == "undo":
            decisions.pop(d["key"], None)
        else:
            decisions[d["key"]] = d["verdict"]
    return decisions


def clip_index(clips_dir: Path) -> list[dict]:
    out = []
    for meta in sorted(clips_dir.glob("*.json")):
        info = json.loads(meta.read_text())
        take = info["take"]
        word, _, accent = meta.stem.rpartition("-")
        out.append(
            {
                "key": meta.stem,
                "word": word,
                "accent": accent,
                "yaw": take["yaw"],
                "aperture": take["aperture_range"],
                "sharp": take["sharpness"],
            }
        )
    return out


def serve(clips_dir: Path, review_path: Path, port: int, pending_only: bool) -> None:
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(clips_dir.parent), **kwargs)

        def log_message(self, *_args):
            pass

        def do_GET(self):
            if self.path != "/":
                return super().do_GET()
            decisions = load_decisions(review_path)
            clips = clip_index(clips_dir)
            if pending_only:
                clips = [c for c in clips if c["key"] not in decisions]
            body = PAGE.replace("__CLIPS__", json.dumps(clips)).replace(
                "__DECISIONS__", json.dumps(decisions)
            )
            data = body.encode()
            self.send_response(200)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self):
            if self.path != "/decision":
                self.send_error(404)
                return
            length = int(self.headers.get("content-length", "0"))
            d = json.loads(self.rfile.read(length))
            with review_path.open("a") as f:
                f.write(json.dumps({"key": d["key"], "verdict": d["verdict"]}) + "\n")
            self.send_response(204)
            self.end_headers()

    print(f"review at http://localhost:{port}/")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
