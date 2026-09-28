"""Uploads approved clips to R2 and appends them to the D1 schedule.

Numbers continue from the highest already scheduled. Each batch is shuffled
with a fixed seed so the order is reproducible but not guessable from the
word list. One clip per word; when both accents are approved a coin toss
seeded by the word picks one.
"""

import hashlib
import json
import random
import subprocess
from pathlib import Path

SHUFFLE_SEED = "lipreadle"


def wrangler(*args: str, cwd: Path) -> str:
    return subprocess.run(
        ["npx", "wrangler", *args], check=True, capture_output=True, text=True, cwd=cwd
    ).stdout


def remote_max_number(root: Path, database: str) -> int:
    out = wrangler(
        "d1", "execute", database, "--remote", "--json",
        "--command", "SELECT COALESCE(MAX(number), 0) AS n FROM puzzles",
        cwd=root,
    )  # fmt: skip
    return int(json.loads(out)[0]["results"][0]["n"])


def remote_words(root: Path, database: str) -> set[str]:
    out = wrangler(
        "d1", "execute", database, "--remote", "--json",
        "--command", "SELECT word FROM puzzles",
        cwd=root,
    )  # fmt: skip
    return {r["word"] for r in json.loads(out)[0]["results"]}


def choose_per_word(approved: list[str]) -> dict[str, str]:
    """Map word to one approved clip key, deterministic per word."""
    by_word: dict[str, list[str]] = {}
    for key in approved:
        word = key.rpartition("-")[0]
        by_word.setdefault(word, []).append(key)
    chosen = {}
    for word, keys in by_word.items():
        rng = random.Random(f"{SHUFFLE_SEED}:{word}")
        chosen[word] = rng.choice(sorted(keys))
    return chosen


def schedule(words: list[str], start: int, batch: int) -> list[tuple[int, str]]:
    rng = random.Random(f"{SHUFFLE_SEED}:batch:{batch}")
    order = sorted(words)
    rng.shuffle(order)
    return [(start + i, w) for i, w in enumerate(order)]


def content_key(path: Path) -> str:
    digest = hashlib.sha1(path.read_bytes()).hexdigest()[:20]
    return f"clips/{digest}.mp4"


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def publish(
    root: Path,
    clips_dir: Path,
    approved: list[str],
    published_path: Path,
    bucket: str,
    database: str,
    dry_run: bool,
) -> int:
    already = set()
    if published_path.exists():
        already = {line.split("\t")[0] for line in published_path.read_text().splitlines()}
    already |= remote_words(root, database) if not dry_run else set()
    chosen = {w: k for w, k in choose_per_word(approved).items() if w not in already}
    if not chosen:
        return 0
    start = remote_max_number(root, database) + 1 if not dry_run else 1
    batch = start
    rows = []
    for number, word in schedule(list(chosen), start, batch):
        key = chosen[word]
        path = clips_dir / f"{key}.mp4"
        meta = json.loads(path.with_suffix(".json").read_text())
        r2_key = content_key(path)
        accent = key.rpartition("-")[2]
        rows.append((number, word, r2_key, accent, meta["source"], path))
    if dry_run:
        for number, word, r2_key, accent, _src, _path in rows:
            print(f"{number}\t{word}\t{accent}\t{r2_key}")
        return len(rows)
    for _number, _word, r2_key, _accent, _src, path in rows:
        wrangler(
            "r2", "object", "put", f"{bucket}/{r2_key}",
            "--file", str(path), "--content-type", "video/mp4", "--remote",
            cwd=root,
        )  # fmt: skip
    values = ", ".join(
        f"({n}, '{sql_escape(w)}', '{k}', '{sql_escape(a)}', '{sql_escape(s)}')"
        for n, w, k, a, s, _ in rows
    )
    sql = f"INSERT INTO puzzles (number, word, clip, accent, source) VALUES {values}"
    wrangler("d1", "execute", database, "--remote", "--command", sql, cwd=root)
    with published_path.open("a") as f:
        for n, w, k, a, _s, _p in rows:
            f.write(f"{w}\t{n}\t{a}\t{k}\n")
    return len(rows)
