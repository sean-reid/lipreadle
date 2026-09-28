import argparse
import sys
from pathlib import Path

from . import catalog, paths
from .channels import load_channels
from .match import find_matches, read_matches, write_matches


def cmd_catalog(_args) -> None:
    paths.ensure_dirs()
    for ch in load_channels(paths.CHANNELS):
        out = catalog.dump(ch, paths.CATALOG)
        print(f"{ch.name}: {len(catalog.read(out))} videos")


def cmd_match(args) -> None:
    guess_list = set(paths.GUESS_LIST.read_text().split())
    matches = []
    for ch in load_channels(paths.CHANNELS):
        rows = catalog.read(paths.CATALOG / f"{ch.name}.tsv")
        found = find_matches(ch, rows, guess_list, args.min_zipf)
        print(f"{ch.name}: {len(found)} videos, {len({m.word for m in found})} words")
        matches.extend(found)
    write_matches(paths.MATCHES, matches)
    print(f"{len({m.word for m in matches})} words total -> {paths.MATCHES}")


def cmd_fetch(args) -> None:
    from .fetch import fetch

    paths.ensure_dirs()
    matches = read_matches(paths.MATCHES)
    got = fetch(matches, paths.RAW, args.limit)
    print(f"downloaded {got}")


def cmd_cut(args) -> None:
    from .cut import Landmarker, cut

    paths.ensure_dirs()
    channels = {c.name: c for c in load_channels(paths.CHANNELS)}
    landmarker = Landmarker()
    done = skipped = failed = 0
    for m in read_matches(paths.MATCHES):
        src = paths.RAW / f"{m.video}.mp4"
        out = paths.CLIPS / f"{m.key()}.mp4"
        if not src.exists():
            continue
        if out.exists() and not args.force:
            skipped += 1
            continue
        result = cut(src, out, landmarker, channels[m.channel].banner_top)
        if result is None:
            failed += 1
            print(f"reject {m.key()}", file=sys.stderr)
        else:
            done += 1
            print(f"cut {m.key()} {result.take.end - result.take.start:.2f}s")
        if args.limit and done + failed >= args.limit:
            break
    print(f"cut {done}, skipped {skipped}, rejected {failed}")


def cmd_review(args) -> None:
    from .review import serve

    serve(paths.CLIPS, paths.REVIEW, args.port, not args.all)


def cmd_publish(args) -> None:
    from .publish import publish
    from .review import load_decisions

    decisions = load_decisions(paths.REVIEW)
    approved = [k for k, v in decisions.items() if v == "approve"]
    n = publish(
        paths.ROOT,
        paths.CLIPS,
        approved,
        paths.PUBLISHED,
        args.bucket,
        args.database,
        args.dry_run,
    )
    print(f"{'would publish' if args.dry_run else 'published'} {n} puzzles")


def cmd_visemes(_args) -> None:
    from .visemes import build_table, write_table

    words = paths.GUESS_LIST.read_text().split()
    out = Path(paths.GUESS_LIST).with_name("visemes.txt")
    write_table(out, build_table(words))
    print(f"{len(words)} words -> {out}")


def main() -> None:
    p = argparse.ArgumentParser(prog="lipreadle")
    sub = p.add_subparsers(required=True)

    sub.add_parser("catalog", help="dump channel video lists").set_defaults(fn=cmd_catalog)

    m = sub.add_parser("match", help="match titles to five-letter words")
    m.add_argument("--min-zipf", type=float, default=2.5)
    m.set_defaults(fn=cmd_match)

    f = sub.add_parser("fetch", help="download matched source videos")
    f.add_argument("--limit", type=int)
    f.set_defaults(fn=cmd_fetch)

    c = sub.add_parser("cut", help="cut mouth clips from downloaded sources")
    c.add_argument("--limit", type=int)
    c.add_argument("--force", action="store_true")
    c.set_defaults(fn=cmd_cut)

    r = sub.add_parser("review", help="approve clips in the browser")
    r.add_argument("--port", type=int, default=8765)
    r.add_argument("--all", action="store_true", help="show decided clips too")
    r.set_defaults(fn=cmd_review)

    pub = sub.add_parser("publish", help="upload approved clips and schedule them")
    pub.add_argument("--bucket", default="lipreadle-clips")
    pub.add_argument("--database", default="lipreadle")
    pub.add_argument("--dry-run", action="store_true")
    pub.set_defaults(fn=cmd_publish)

    sub.add_parser("visemes", help="regenerate worker/visemes.txt").set_defaults(fn=cmd_visemes)

    args = p.parse_args()
    args.fn(args)
