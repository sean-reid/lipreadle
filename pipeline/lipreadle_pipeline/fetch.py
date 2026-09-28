"""Downloads source videos slowly enough to stay welcome.

Videos go in small batches with randomised gaps between downloads and
between requests, a bandwidth cap, and a pause between batches. A 429 or a
bot check stops the batch and triggers a cooldown that doubles each time
it recurs, so a rate limit never turns into a ban.
"""

import random
import re
import subprocess
import sys
import time
from pathlib import Path

from .match import Match

FORMAT = "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]"
BATCH = 25
BATCH_PAUSE = (30.0, 90.0)
COOLDOWN_START = 600.0
COOLDOWN_MAX = 3600.0
THROTTLE_SIGNS = re.compile(
    r"HTTP Error 429|Sign in to confirm|not a bot|rate.?limit|Too Many Requests", re.I
)

YTDLP_ARGS = [
    "--quiet",
    "--no-warnings",
    "--no-playlist",
    "-f", FORMAT,
    "--merge-output-format", "mp4",
    "--sleep-requests", "1.5",
    "--sleep-interval", "4",
    "--max-sleep-interval", "12",
    "--limit-rate", "3M",
    "--retries", "2",
    "--retry-sleep", "http:exp=5:60",
    "--ignore-errors",
]  # fmt: skip


def log(msg: str) -> None:
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def download_batch(ids: list[str], raw_dir: Path) -> tuple[int, bool]:
    """Fetch one batch. Returns (downloaded, throttled)."""
    listing = raw_dir / ".pending.txt"
    listing.write_text("\n".join(ids) + "\n")
    before = {p.name for p in raw_dir.glob("*.mp4")}
    proc = subprocess.run(
        ["yt-dlp", *YTDLP_ARGS, "-o", str(raw_dir / "%(id)s.%(ext)s"), "-a", str(listing)],
        capture_output=True,
        text=True,
        check=False,
    )
    listing.unlink(missing_ok=True)
    got = len({p.name for p in raw_dir.glob("*.mp4")} - before)
    throttled = bool(THROTTLE_SIGNS.search(proc.stderr))
    if proc.stderr.strip():
        for line in proc.stderr.strip().splitlines()[-3:]:
            print("  yt-dlp:", line, file=sys.stderr, flush=True)
    return got, throttled


def fetch(matches: list[Match], raw_dir: Path, limit: int | None = None) -> int:
    pending = [m.video for m in matches if not (raw_dir / f"{m.video}.mp4").exists()]
    if limit is not None:
        pending = pending[:limit]
    log(f"{len(pending)} videos to fetch")
    total = 0
    cooldown = COOLDOWN_START
    i = 0
    while i < len(pending):
        batch = pending[i : i + BATCH]
        got, throttled = download_batch(batch, raw_dir)
        total += got
        log(f"batch {i // BATCH + 1}: {got}/{len(batch)} downloaded, {total} so far")
        if throttled:
            log(f"throttled; cooling down for {cooldown / 60:.0f} min")
            time.sleep(cooldown)
            cooldown = min(cooldown * 2, COOLDOWN_MAX)
            i += got
            continue
        cooldown = COOLDOWN_START
        i += len(batch)
        if i < len(pending):
            time.sleep(random.uniform(*BATCH_PAUSE))
    return total
