import re
from dataclasses import dataclass

from wordfreq import zipf_frequency

from .channels import Channel

FIVE_LETTERS = re.compile(r"^[a-z]{5}$")
MAX_DURATION = 30


@dataclass(frozen=True)
class Match:
    word: str
    accent: str
    channel: str
    video: str
    zipf: float

    def key(self) -> str:
        return f"{self.word}-{self.accent.lower()}"


def parse_title(channel: Channel, title: str) -> tuple[str, str] | None:
    m = channel.title.match(title)
    if not m:
        return None
    word = m.group("word").strip().lower()
    accent = m.groupdict().get("accent") or channel.accent
    if not accent:
        return None
    return word, accent


def find_matches(
    channel: Channel,
    rows: list[tuple[str, int, str]],
    guess_list: set[str],
    min_zipf: float,
) -> list[Match]:
    out = []
    for vid, dur, title in rows:
        if dur and dur > MAX_DURATION:
            continue
        parsed = parse_title(channel, title)
        if not parsed:
            continue
        word, accent = parsed
        if not FIVE_LETTERS.match(word) or word not in guess_list:
            continue
        z = zipf_frequency(word, "en")
        if z < min_zipf:
            continue
        out.append(Match(word, accent, channel.name, vid, z))
    return out


def write_matches(path, matches: list[Match]) -> None:
    with open(path, "w") as f:
        for m in sorted(matches, key=lambda m: (-m.zipf, m.word, m.accent)):
            f.write(f"{m.word}\t{m.accent}\t{m.channel}\t{m.video}\t{m.zipf:.2f}\n")


def read_matches(path) -> list[Match]:
    out = []
    with open(path) as f:
        for line in f:
            word, accent, channel, video, zipf = line.rstrip("\n").split("\t")
            out.append(Match(word, accent, channel, video, float(zipf)))
    return out
