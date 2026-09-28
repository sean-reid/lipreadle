// How closely a wrong guess resembles the answer on the lips, coarsest first.
export type MatchLevel = 0 | 1 | 2 | 3;

export const MATCH_PHRASES: Record<MatchLevel, string> = {
  0: "nothing like it",
  1: "a few shapes match",
  2: "close",
  3: "looks the same on the lips",
};

export function matchLevel(similarity: number): MatchLevel {
  if (similarity >= 0.999) return 3;
  if (similarity >= 0.6) return 2;
  if (similarity >= 0.3) return 1;
  return 0;
}
