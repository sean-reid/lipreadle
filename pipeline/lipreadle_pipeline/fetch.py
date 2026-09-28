import subprocess
from pathlib import Path

from .match import Match

FORMAT = "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]"


def fetch(matches: list[Match], raw_dir: Path, limit: int | None = None) -> int:
    """Download source videos that are not already on disk, gently."""
    pending = [m for m in matches if not (raw_dir / f"{m.video}.mp4").exists()]
    if limit is not None:
        pending = pending[:limit]
    if not pending:
        return 0
    ids = raw_dir / ".pending.txt"
    ids.write_text("\n".join(m.video for m in pending) + "\n")
    subprocess.run(
        [
            "yt-dlp",
            "--quiet",
            "--no-warnings",
            "-f",
            FORMAT,
            "--merge-output-format",
            "mp4",
            "-o",
            str(raw_dir / "%(id)s.%(ext)s"),
            "--sleep-interval",
            "2",
            "--max-sleep-interval",
            "6",
            "--ignore-errors",
            "-a",
            str(ids),
        ],
        check=False,
    )
    ids.unlink(missing_ok=True)
    return sum(1 for m in pending if (raw_dir / f"{m.video}.mp4").exists())
