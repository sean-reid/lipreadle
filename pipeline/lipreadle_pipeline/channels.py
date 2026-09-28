"""Channel definitions live in data/channels.toml, outside git.

Each channel gives a YouTube channel URL, a regex that pulls the word and
accent out of a video title, and the accent to record when the title has none.

    [collins]
    url = "https://www.youtube.com/channel/UC.../videos"
    title = '^How to pronounce (?P<word>.+?) in (?P<accent>American|British) English\\s*$'
    banner_top = 0.74
"""

import re
import tomllib
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Channel:
    name: str
    url: str
    title: re.Pattern[str]
    accent: str | None
    banner_top: float


def load_channels(path: Path) -> list[Channel]:
    with path.open("rb") as f:
        raw = tomllib.load(f)
    out = []
    for name, spec in raw.items():
        out.append(
            Channel(
                name=name,
                url=spec["url"],
                title=re.compile(spec["title"], re.IGNORECASE),
                accent=spec.get("accent"),
                banner_top=float(spec.get("banner_top", 1.0)),
            )
        )
    return out
