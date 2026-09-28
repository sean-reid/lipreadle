import { MAX_GUESSES_TRACKED } from "../shared/api.ts";

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(s: string): number | null {
  const m = ISO_DATE.exec(s);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const roundTrips =
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3]);
  return roundTrips ? t : null;
}

export function puzzleNumber(date: string, epoch: string): number | null {
  const t = parseIsoDate(date);
  const e = parseIsoDate(epoch);
  if (t === null || e === null) return null;
  return Math.round((t - e) / DAY_MS) + 1;
}

// A client's local date can sit one calendar day either side of UTC.
export function dateWithinWindow(date: string, nowMs: number): boolean {
  const t = parseIsoDate(date);
  if (t === null) return false;
  const todayUtc = Math.floor(nowMs / DAY_MS) * DAY_MS;
  return Math.abs(t - todayUtc) <= DAY_MS;
}

export function latestAllowedNumber(nowMs: number, epoch: string): number {
  const e = parseIsoDate(epoch) ?? 0;
  const todayUtc = Math.floor(nowMs / DAY_MS) * DAY_MS;
  return Math.round((todayUtc - e) / DAY_MS) + 2;
}

export function normalizeGuess(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const g = raw.trim().toLowerCase();
  return /^[a-z]{5}$/.test(g) ? g : null;
}

export function clampGuesses(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) return null;
  return Math.min(raw, MAX_GUESSES_TRACKED);
}

export function histogram(rows: { guesses: number; n: number }[]): {
  counts: number[];
  total: number;
} {
  const counts = new Array<number>(MAX_GUESSES_TRACKED + 1).fill(0);
  let total = 0;
  for (const r of rows) {
    if (r.guesses >= 1 && r.guesses <= MAX_GUESSES_TRACKED) {
      counts[r.guesses] = r.n;
      total += r.n;
    }
  }
  return { counts, total };
}

export function parseRange(
  header: string | null,
  size: number,
): { offset: number; length: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, startRaw = "", endRaw = ""] = m;
  if (startRaw === "" && endRaw === "") return null;
  let start: number;
  let end: number;
  if (startRaw === "") {
    start = Math.max(0, size - Number(endRaw));
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === "" ? size - 1 : Math.min(Number(endRaw), size - 1);
  }
  if (start > end || start >= size) return null;
  return { offset: start, length: end - start + 1 };
}

export function wordSet(text: string): Set<string> {
  return new Set(text.split(/\r?\n/).filter((w) => w.length === 5));
}

// Past the last scheduled puzzle the schedule repeats from the start.
export function wrapNumber(number: number, highest: number): number {
  if (highest < 1) return number;
  if (number >= 1 && number <= highest) return number;
  return ((((number - 1) % highest) + highest) % highest) + 1;
}
