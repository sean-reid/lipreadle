import type { GuessResponse, PuzzleResponse, StatsResponse } from "../shared/api";
import {
  clampGuesses,
  dateWithinWindow,
  histogram,
  latestAllowedNumber,
  normalizeGuess,
  parseRange,
  puzzleNumber,
  wordSet,
} from "./lib";
import { similarity, visemeTable } from "./visemes";
import { matchLevel } from "../shared/feedback";
import visemesText from "./visemes.txt";
import wordsText from "./words.txt";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CLIPS: R2Bucket;
  GUESS_RATE: RateLimit;
  RESULT_RATE: RateLimit;
  EPOCH: string;
}

interface PuzzleRow {
  number: number;
  word: string;
  clip: string;
  accent: string;
}

const WORDS = wordSet(wordsText);
const VISEMES = visemeTable(visemesText);

const json = (body: unknown, status = 200, cache = "no-store"): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache },
  });

const error = (status: number, message: string): Response => json({ error: message }, status);

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function loadPuzzle(env: Env, number: number): Promise<PuzzleRow | null> {
  return env.DB.prepare("SELECT number, word, clip, accent FROM puzzles WHERE number = ?")
    .bind(number)
    .first<PuzzleRow>();
}

function clientKey(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

async function limited(limiter: RateLimit, request: Request): Promise<boolean> {
  const { success } = await limiter.limit({ key: clientKey(request) });
  return !success;
}

async function handlePuzzle(url: URL, env: Env): Promise<Response> {
  const date = url.searchParams.get("date") ?? "";
  if (!dateWithinWindow(date, Date.now())) return error(400, "bad date");
  const number = puzzleNumber(date, env.EPOCH);
  if (number === null) return error(400, "bad date");
  const row = await loadPuzzle(env, number);
  if (!row) return error(404, "no puzzle");
  const body: PuzzleResponse = { number, date, clip: `/clip/${number}`, accent: row.accent };
  return json(body, 200, "public, max-age=60");
}

async function handleGuess(request: Request, env: Env): Promise<Response> {
  if (await limited(env.GUESS_RATE, request)) return error(429, "slow down");
  const body = await readJson(request);
  if (!body) return error(400, "bad request");
  const number = body.number;
  if (typeof number !== "number" || !Number.isInteger(number)) return error(400, "bad number");
  if (number > latestAllowedNumber(Date.now(), env.EPOCH)) return error(404, "no puzzle");
  const guess = normalizeGuess(body.guess);
  if (!guess) return json({ valid: false, correct: false, match: 0 } satisfies GuessResponse);
  const row = await loadPuzzle(env, number);
  if (!row) return error(404, "no puzzle");
  const valid = WORDS.has(guess);
  const correct = valid && guess === row.word;
  const match = correct
    ? 3
    : matchLevel(similarity(VISEMES.get(guess) ?? "", VISEMES.get(row.word) ?? ""));
  const result: GuessResponse = { valid, correct, match };
  return json(result);
}

async function statsFor(env: Env, number: number): Promise<StatsResponse> {
  const { results } = await env.DB.prepare(
    "SELECT guesses, n FROM results WHERE number = ? ORDER BY guesses",
  )
    .bind(number)
    .all<{ guesses: number; n: number }>();
  return { number, ...histogram(results) };
}

async function handleResult(request: Request, env: Env): Promise<Response> {
  if (await limited(env.RESULT_RATE, request)) return error(429, "slow down");
  const body = await readJson(request);
  if (!body) return error(400, "bad request");
  const number = body.number;
  if (typeof number !== "number" || !Number.isInteger(number)) return error(400, "bad number");
  if (number > latestAllowedNumber(Date.now(), env.EPOCH)) return error(404, "no puzzle");
  const guesses = clampGuesses(body.guesses);
  if (guesses === null) return error(400, "bad guesses");
  if (!(await loadPuzzle(env, number))) return error(404, "no puzzle");
  await env.DB.prepare(
    "INSERT INTO results (number, guesses, n) VALUES (?, ?, 1) ON CONFLICT (number, guesses) DO UPDATE SET n = n + 1",
  )
    .bind(number, guesses)
    .run();
  return json(await statsFor(env, number));
}

async function handleStats(numberText: string, env: Env): Promise<Response> {
  const number = Number(numberText);
  if (!Number.isInteger(number)) return error(400, "bad number");
  if (number > latestAllowedNumber(Date.now(), env.EPOCH)) return error(404, "no puzzle");
  return json(await statsFor(env, number), 200, "public, max-age=30");
}

async function handleClip(request: Request, numberText: string, env: Env): Promise<Response> {
  const number = Number(numberText);
  if (!Number.isInteger(number)) return error(400, "bad number");
  if (number > latestAllowedNumber(Date.now(), env.EPOCH)) return error(404, "no puzzle");
  const row = await loadPuzzle(env, number);
  if (!row) return error(404, "no puzzle");
  const head = await env.CLIPS.head(row.clip);
  if (!head) return error(404, "missing clip");
  const headers = new Headers({
    "content-type": "video/mp4",
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=86400",
    etag: head.httpEtag,
  });
  const range = parseRange(request.headers.get("range"), head.size);
  if (request.method === "HEAD") {
    headers.set("content-length", String(head.size));
    return new Response(null, { status: 200, headers });
  }
  if (range) {
    const object = await env.CLIPS.get(row.clip, { range });
    if (!object) return error(404, "missing clip");
    headers.set("content-length", String(range.length));
    headers.set(
      "content-range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`,
    );
    return new Response(object.body, { status: 206, headers });
  }
  const object = await env.CLIPS.get(row.clip);
  if (!object) return error(404, "missing clip");
  headers.set("content-length", String(head.size));
  return new Response(object.body, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === "/api/puzzle" && method === "GET") return handlePuzzle(url, env);
    if (pathname === "/api/guess" && method === "POST") return handleGuess(request, env);
    if (pathname === "/api/result" && method === "POST") return handleResult(request, env);
    const stats = /^\/api\/stats\/(-?\d+)$/.exec(pathname);
    if (stats && method === "GET") return handleStats(stats[1]!, env);
    const clip = /^\/clip\/(-?\d+)$/.exec(pathname);
    if (clip && (method === "GET" || method === "HEAD")) return handleClip(request, clip[1]!, env);
    if (pathname.startsWith("/api/") || pathname.startsWith("/clip/"))
      return error(404, "not found");

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
