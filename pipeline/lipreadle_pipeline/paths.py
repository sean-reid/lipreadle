from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CATALOG = DATA / "catalog"
RAW = DATA / "raw"
CLIPS = DATA / "clips"
MODELS = DATA / "models"
WORDS = DATA / "words"
CHANNELS = DATA / "channels.toml"
MATCHES = DATA / "matches.tsv"
REVIEW = DATA / "review.jsonl"
PUBLISHED = DATA / "published.tsv"
GUESS_LIST = ROOT / "worker" / "words.txt"


def ensure_dirs() -> None:
    for p in (CATALOG, RAW, CLIPS, MODELS, WORDS):
        p.mkdir(parents=True, exist_ok=True)
