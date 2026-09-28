import type { MatchLevel } from "../shared/feedback";

// Closest guesses first; among equals, the most recent first.
export function guessOrder(matches: MatchLevel[]): number[] {
  return matches.map((_, i) => i).sort((a, b) => (matches[b] ?? 0) - (matches[a] ?? 0) || b - a);
}
