// Seeds the local wrangler state so the site can be played offline:
// applies migrations, uploads the fixture clip, and schedules "brave"
// for yesterday, today and tomorrow (local dates).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { puzzleNumber } from "../worker/lib.ts";
import { localDate } from "../src/time.ts";

const epoch = /"EPOCH":\s*"(\d{4}-\d{2}-\d{2})"/.exec(readFileSync("wrangler.jsonc", "utf8"))?.[1];
if (!epoch) throw new Error("EPOCH missing from wrangler.jsonc");

const wrangler = (...args: string[]) =>
  execFileSync("npx", ["wrangler", ...args], { stdio: ["ignore", "pipe", "inherit"] }).toString();

wrangler("d1", "migrations", "apply", "lipreadle", "--local");
wrangler(
  "r2",
  "object",
  "put",
  "lipreadle-clips/fixture.mp4",
  "--file",
  "tests/fixtures/clip.mp4",
  "--content-type",
  "video/mp4",
  "--local",
);

const today = new Date();
const rows: string[] = [];
for (const offset of [-1, 0, 1]) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  const n = puzzleNumber(localDate(d), epoch);
  rows.push(`(${n}, 'brave', 'fixture.mp4', 'American', 'fixture')`);
}
wrangler(
  "d1",
  "execute",
  "lipreadle",
  "--local",
  "--command",
  `INSERT OR REPLACE INTO puzzles (number, word, clip, accent, source) VALUES ${rows.join(", ")}`,
);
console.log("seeded", rows.length, "puzzles");
