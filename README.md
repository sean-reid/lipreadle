# Lipreadle

A daily lipreading puzzle. A short muted clip shows a mouth saying a five-letter word. You guess until you get it, and fewer guesses is a better score. Each wrong guess tells you how alike the two words look on the lips, nothing about letters.

Live at [lipreadle.dwainosaur.com](https://lipreadle.dwainosaur.com).

## How it runs

One Cloudflare Worker serves the static page and four small endpoints: today's puzzle number, a guess check, the day's guess histogram, and the answer for anyone who gives up after five misses. Puzzles and histograms live in D1, clips in R2. The answer never reaches the browser. The puzzle rolls over at local midnight, so the client sends its local date and the Worker maps it to a puzzle number from `EPOCH` in `wrangler.jsonc`.

## Development

```sh
npm install
npm run build              # bundle the client into dist/
node scripts/seed-local.ts # local D1 schema, a fixture clip, and "brave" for today
npm run dev                # wrangler dev on http://localhost:8787
npm test                   # unit tests
npm run test:e2e           # Playwright, starts its own server
```

`npm run deploy` builds and deploys with wrangler. CI deploys `main` the same way after checks pass, then applies pending D1 migrations. `scripts/provision.sh` creates the bucket and database once; the D1 id it prints has to match `database_id` in `wrangler.jsonc`.

## Clip pipeline

The clip bank is built on a laptop from pronunciation videos with `pipeline/`, a Python project managed by uv. It needs `ffmpeg` and `yt-dlp` on the path and a channel list at `data/channels.toml`:

```toml
[collins]
url = "https://www.youtube.com/channel/<id>/videos"
title = '^How to pronounce (?P<word>.+?) in (?P<accent>American|British) English\s*$'
banner_top = 0.74
```

Then, from `pipeline/`:

```sh
uv sync
uv run lipreadle catalog       # list every video on each channel
uv run lipreadle match         # keep five-letter dictionary words
uv run lipreadle fetch         # download sources at 720p, slowly
uv run lipreadle cut           # find the takes, judge them, crop nose to chin
uv run lipreadle review        # approve or reject clips in the browser
uv run lipreadle publish       # upload approved clips to R2 and schedule them in D1
```

`publish` runs wrangler with `CLOUDFLARE_API_TOKEN` from the environment, or from `~/.config/lipreadle/cf-token` (override with `LIPREADLE_CF_TOKEN`), since the browser login usually lacks R2 and D1 access.

`cut` finds the takes by audio energy, re-splitting any stretch too long for one word, keeps each window clear of the neighbouring take and of the fade to black, judges head pose, mouth movement and sharpness, prefers the first clean take, and writes a 480x360 H.264 clip with a short still hold at either end. `cut --force` re-cuts anything not yet approved. In `review`, click a clip to reject it and press A to approve the rest; trimmed or clamped clips are marked amber and `f` shows only those. `publish` continues numbering from the last scheduled puzzle and shuffles each batch with a fixed seed. Everything under `data/` stays out of git.

`uv run lipreadle visemes` regenerates `worker/visemes.txt`, the mouth-shape strings behind the guess feedback, from the CMU pronouncing dictionary.
