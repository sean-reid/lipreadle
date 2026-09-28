import subprocess
from pathlib import Path

from .channels import Channel


def dump(channel: Channel, out_dir: Path) -> Path:
    """Write id|duration|title for every video on the channel."""
    out = out_dir / f"{channel.name}.tsv"
    result = subprocess.run(
        [
            "yt-dlp",
            channel.url,
            "--flat-playlist",
            "--print",
            "%(id)s\t%(duration)s\t%(title)s",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    out.write_text(result.stdout)
    return out


def read(path: Path) -> list[tuple[str, int, str]]:
    rows = []
    for line in path.read_text().splitlines():
        parts = line.split("\t", 2)
        if len(parts) != 3:
            continue
        vid, dur, title = parts
        rows.append((vid, int(float(dur)) if dur not in ("", "NA") else 0, title))
    return rows
