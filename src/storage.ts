import type { MatchLevel } from "../shared/feedback";

export interface GameState {
  number: number;
  guesses: string[];
  matches: MatchLevel[];
  solved: boolean;
}

export interface Stats {
  played: number;
  totalGuesses: number;
  streak: number;
  bestStreak: number;
  lastSolved: number | null;
}

export const EMPTY_STATS: Stats = {
  played: 0,
  totalGuesses: 0,
  streak: 0,
  bestStreak: 0,
  lastSolved: null,
};

const STATE_KEY = "lipreadle:state";
const STATS_KEY = "lipreadle:stats";
const THEME_KEY = "lipreadle:theme";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the game still plays, it just forgets.
  }
}

export function loadState(number: number): GameState {
  const s = read<GameState>(STATE_KEY);
  if (s && s.number === number && Array.isArray(s.guesses)) {
    return { ...s, matches: Array.isArray(s.matches) ? s.matches : [] };
  }
  return { number, guesses: [], matches: [], solved: false };
}

export function saveState(state: GameState): void {
  write(STATE_KEY, state);
}

export function loadStats(): Stats {
  return { ...EMPTY_STATS, ...(read<Partial<Stats>>(STATS_KEY) ?? {}) };
}

export function saveStats(stats: Stats): void {
  write(STATS_KEY, stats);
}

export function recordSolve(stats: Stats, number: number, guesses: number): Stats {
  if (stats.lastSolved === number) return stats;
  const consecutive = stats.lastSolved !== null && number === stats.lastSolved + 1;
  const streak = consecutive ? stats.streak + 1 : 1;
  return {
    played: stats.played + 1,
    totalGuesses: stats.totalGuesses + guesses,
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    lastSolved: number,
  };
}

export function averageGuesses(stats: Stats): string {
  if (stats.played === 0) return "0";
  const avg = stats.totalGuesses / stats.played;
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
}

export type Theme = "light" | "dark" | null;

export function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

export function saveTheme(theme: Theme): void {
  try {
    if (theme) localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // ignore
  }
}
