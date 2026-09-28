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
  video { width: 100%; display: block; }
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
for (const c of clips) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.key = c.key;
  const stats = `yaw ${c.yaw.toFixed(0)} ap ${c.aperture.toFixed(2)} sharp ${c.sharp.toFixed(0)}`;
  card.innerHTML = `<video src="/clips/${c.key}.mp4" muted loop autoplay playsinline></video>
    <div class="meta"><span class="word">${c.word} <small>${c.accent}</small></span>
    <span>${stats}</span></div>`;
  grid.append(card);
}
const cards = [...grid.children];
function paint() {
  cards.forEach((el, i) => {
    el.classList.toggle("current", i === cur);
    const d = decisions[el.dataset.key];
    el.classList.toggle("approved", d === "approve");
    el.classList.toggle("rejected", d === "reject");
  });
  const done = Object.keys(decisions).length;
  document.getElementById("count").textContent = `${done} / ${clips.length} decided`;
  cards[cur]?.scrollIntoView({ block: "center", behavior: "smooth" });
}
async function decide(verdict) {
  const key = cards[cur].dataset.key;
  decisions[key] = verdict;
  await fetch("/decision", { method: "POST", body: JSON.stringify({ key, verdict }) });
  cur = Math.min(cur + 1, cards.length - 1);
  paint();
}
document.addEventListener("keydown", (e) => {
  if (e.key === "j") cur = Math.min(cur + 1, cards.length - 1);
  else if (e.key === "k") cur = Math.max(cur - 1, 0);
  else if (e.key === "a") return decide("approve");
  else if (e.key === "r") return decide("reject");
  else if (e.key === "u") { cur = Math.max(cur - 1, 0); return decide("undo"); }
  else if (e.key === " ") {
    e.preventDefault();
    const v = cards[cur].querySelector("video");
    v.currentTime = 0;
    v.play();
    return;
  }
  else return;
  paint();
});
grid.addEventListener("click", (e) => {
  const i = cards.indexOf(e.target.closest(".card"));
  if (i >= 0) { cur = i; paint(); }
});
paint();
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
