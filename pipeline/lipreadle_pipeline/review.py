"""A local page for approving cut clips by eye.

Serves data/clips as a grid of looping videos. Rejects are rare, so the
flow is: click anything bad to reject it, then approve all the rest with
one key. Cards the cutter had to trim or clamp are marked so the eye goes
there first. Decisions append to data/review.jsonl.
"""

import json
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PAGE = """<!doctype html>
<meta charset="utf-8">
<title>Lipreadle review</title>
<style>
  body { margin: 0; padding: 16px; background: #111; color: #ddd; font: 15px system-ui; }
  header { position: sticky; top: 0; z-index: 1; display: flex; gap: 16px;
    align-items: center; padding: 8px 0 12px; background: #111; }
  header button { font: inherit; padding: 6px 12px; background: #222; color: #ddd;
    border: 1px solid #444; border-radius: 4px; cursor: pointer; }
  header button[aria-pressed="true"] { background: #ddd; color: #111; }
  .keys { color: #888; margin-left: auto; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
  .card { border: 3px solid transparent; padding: 3px; cursor: pointer; }
  .card.current { outline: 2px solid #fff; outline-offset: 2px; }
  .card.flagged { border-color: #b8860b; }
  .card.approved { border-color: #3a3; }
  .card.rejected { border-color: #a33; opacity: 0.45; }
  .hidden { display: none; }
  video { width: 100%; aspect-ratio: 4 / 3; display: block; background: #222; }
  .meta { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; color: #999; }
  .word { color: #fff; font-size: 16px; }
  .flags { color: #d9a441; }
</style>
<header>
  <strong>Review</strong>
  <span id="count"></span>
  <button id="approve-all" type="button">Approve all undecided</button>
  <button id="flagged-only" type="button" aria-pressed="false">Flagged only</button>
  <span class="keys">click reject, j/k move, a/r/u, A approve all, space replay</span>
</header>
<div class="grid" id="grid"></div>
<script>
const clips = __CLIPS__;
const decisions = __DECISIONS__;
let cur = 0;
let flaggedOnly = false;
const grid = document.getElementById("grid");
const frag = document.createDocumentFragment();
for (const c of clips) {
  const card = document.createElement("div");
  card.className = "card" + (c.flags.length ? " flagged" : "");
  card.dataset.key = c.key;
  const src = `/clips/${c.key}.mp4`;
  const flags = c.flags.length
    ? `<span class="flags">${c.flags.join("; ")}</span>`
    : `<span>${c.length.toFixed(2)}s</span>`;
  card.innerHTML = `<video muted loop playsinline preload="none" data-src="${src}"></video>
    <div class="meta"><span class="word">${c.word} <small>${c.accent}</small></span>${flags}</div>`;
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

const visible = () => cards.filter((el) => !el.classList.contains("hidden"));
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
  const rejected = cards.filter((el) => decisions[el.dataset.key] === "reject").length;
  const count = document.getElementById("count");
  count.textContent = `${done} / ${clips.length} decided, ${rejected} rejected`;
}
function moveTo(i) {
  const prev = cur;
  const vis = visible();
  if (!vis.length) return;
  const at = vis.indexOf(cards[i]);
  const pos = Math.max(0, Math.min(at < 0 ? 0 : at, vis.length - 1));
  cur = cards.indexOf(vis[pos]);
  paintCard(prev);
  paintCard(cur);
  cards[cur].scrollIntoView({ block: "center" });
}
function step(delta) {
  const vis = visible();
  const pos = vis.indexOf(cards[cur]);
  moveTo(cards.indexOf(vis[Math.max(0, Math.min(pos + delta, vis.length - 1))]));
}
function post(list) {
  return fetch("/decisions", { method: "POST", body: JSON.stringify(list) });
}
function decide(i, verdict) {
  const key = cards[i].dataset.key;
  if (verdict === "undo") delete decisions[key]; else decisions[key] = verdict;
  paintCard(i);
  paintCount();
  post([{ key, verdict }]);
}
function approveAll() {
  const list = [];
  for (const el of cards) {
    if (decisions[el.dataset.key]) continue;
    decisions[el.dataset.key] = "approve";
    list.push({ key: el.dataset.key, verdict: "approve" });
  }
  cards.forEach((_, i) => paintCard(i));
  paintCount();
  if (list.length) post(list);
}
function toggleFlagged() {
  flaggedOnly = !flaggedOnly;
  document.getElementById("flagged-only").setAttribute("aria-pressed", String(flaggedOnly));
  for (const el of cards) {
    el.classList.toggle("hidden", flaggedOnly && !el.classList.contains("flagged"));
  }
  moveTo(cur);
}
document.getElementById("approve-all").addEventListener("click", approveAll);
document.getElementById("flagged-only").addEventListener("click", toggleFlagged);
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "BUTTON") return;
  if (e.key === "j") step(1);
  else if (e.key === "k") step(-1);
  else if (e.key === "a") { decide(cur, "approve"); step(1); }
  else if (e.key === "r") { decide(cur, "reject"); step(1); }
  else if (e.key === "u") { step(-1); decide(cur, "undo"); }
  else if (e.key === "A") approveAll();
  else if (e.key === "f") toggleFlagged();
  else if (e.key === " ") {
    e.preventDefault();
    const v = cards[cur].querySelector("video");
    if (!v.src) v.src = v.dataset.src;
    v.currentTime = 0;
    v.play().catch(() => {});
  }
});
// Clicking a card rejects it; clicking again takes the rejection back.
grid.addEventListener("click", (e) => {
  const i = cards.indexOf(e.target.closest(".card"));
  if (i < 0) return;
  moveTo(i);
  decide(i, decisions[cards[i].dataset.key] === "reject" ? "undo" : "reject");
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
                "length": take["end"] - take["start"],
                "flags": take.get("flags", []),
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
            if self.path != "/decisions":
                self.send_error(404)
                return
            length = int(self.headers.get("content-length", "0"))
            batch = json.loads(self.rfile.read(length))
            with review_path.open("a") as f:
                for d in batch:
                    f.write(json.dumps({"key": d["key"], "verdict": d["verdict"]}) + "\n")
            self.send_response(204)
            self.end_headers()

    print(f"review at http://localhost:{port}/")
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
