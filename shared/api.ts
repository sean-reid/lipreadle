import type { MatchLevel } from "./feedback";

export interface PuzzleResponse {
  number: number;
  date: string;
  clip: string;
  accent: string;
  yesterday: string | null;
}

export interface RevealResponse {
  word: string;
}

export interface GuessRequest {
  number: number;
  guess: string;
}

export interface GuessResponse {
  valid: boolean;
  correct: boolean;
  match: MatchLevel;
}

export interface ResultRequest {
  number: number;
  guesses: number;
}

export interface StatsResponse {
  number: number;
  counts: number[];
  total: number;
}

export const MAX_GUESSES_TRACKED = 50;

// A result of zero guesses records a give-up.
export const GAVE_UP = 0;

// Wrong guesses before the give-up option appears.
export const GIVE_UP_AFTER = 5;
