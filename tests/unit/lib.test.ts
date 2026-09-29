import { describe, expect, it } from "vitest";
import {
  clampGuesses,
  dateWithinWindow,
  histogram,
  latestAllowedNumber,
  normalizeGuess,
  parseRange,
  puzzleNumber,
  wordSet,
  wrapNumber,
} from "../../worker/lib";

describe("puzzleNumber", () => {
  it("counts days from the epoch starting at one", () => {
    expect(puzzleNumber("2026-09-28", "2026-09-28")).toBe(1);
    expect(puzzleNumber("2026-10-01", "2026-09-28")).toBe(4);
    expect(puzzleNumber("2027-09-28", "2026-09-28")).toBe(366);
  });
  it("rejects malformed and impossible dates", () => {
    expect(puzzleNumber("2026-9-28", "2026-09-28")).toBeNull();
    expect(puzzleNumber("2026-02-30", "2026-09-28")).toBeNull();
    expect(puzzleNumber("garbage", "2026-09-28")).toBeNull();
  });
});

describe("dateWithinWindow", () => {
  const noon = Date.UTC(2026, 8, 28, 12);
  it("accepts yesterday, today and tomorrow in UTC terms", () => {
    expect(dateWithinWindow("2026-09-27", noon)).toBe(true);
    expect(dateWithinWindow("2026-09-28", noon)).toBe(true);
    expect(dateWithinWindow("2026-09-29", noon)).toBe(true);
  });
  it("rejects anything further out", () => {
    expect(dateWithinWindow("2026-09-30", noon)).toBe(false);
    expect(dateWithinWindow("2026-09-26", noon)).toBe(false);
  });
});

describe("latestAllowedNumber", () => {
  it("allows tomorrow's puzzle for timezones ahead of UTC", () => {
    expect(latestAllowedNumber(Date.UTC(2026, 8, 28, 23), "2026-09-28")).toBe(2);
  });
});

describe("normalizeGuess", () => {
  it("lowercases and trims", () => {
    expect(normalizeGuess("  BrAvE ")).toBe("brave");
  });
  it("rejects non-words", () => {
    expect(normalizeGuess("brav")).toBeNull();
    expect(normalizeGuess("bravé")).toBeNull();
    expect(normalizeGuess(5)).toBeNull();
  });
});

describe("clampGuesses", () => {
  it("caps at the tracked maximum", () => {
    expect(clampGuesses(3)).toBe(3);
    expect(clampGuesses(500)).toBe(50);
    expect(clampGuesses(0)).toBe(0);
    expect(clampGuesses(-1)).toBeNull();
    expect(clampGuesses(2.5)).toBeNull();
  });
});

describe("histogram", () => {
  it("places counts by guess number and totals them", () => {
    const h = histogram([
      { guesses: 0, n: 3 },
      { guesses: 1, n: 2 },
      { guesses: 4, n: 7 },
      { guesses: 99, n: 1 },
    ]);
    expect(h.counts[0]).toBe(3);
    expect(h.counts[1]).toBe(2);
    expect(h.counts[4]).toBe(7);
    expect(h.total).toBe(12);
  });
});

describe("parseRange", () => {
  it("handles open, closed and suffix ranges", () => {
    expect(parseRange("bytes=0-", 100)).toEqual({ offset: 0, length: 100 });
    expect(parseRange("bytes=10-19", 100)).toEqual({ offset: 10, length: 10 });
    expect(parseRange("bytes=-10", 100)).toEqual({ offset: 90, length: 10 });
    expect(parseRange("bytes=50-500", 100)).toEqual({ offset: 50, length: 50 });
  });
  it("rejects unsatisfiable ranges", () => {
    expect(parseRange("bytes=100-", 100)).toBeNull();
    expect(parseRange("bytes=-", 100)).toBeNull();
    expect(parseRange(null, 100)).toBeNull();
  });
});

describe("wordSet", () => {
  it("keeps only five-letter lines", () => {
    expect([...wordSet("brave\nbrav\ncrane\r\n")]).toEqual(["brave", "crane"]);
  });
});

describe("wrapNumber", () => {
  it("leaves scheduled numbers alone", () => {
    expect(wrapNumber(1, 65)).toBe(1);
    expect(wrapNumber(65, 65)).toBe(65);
  });
  it("repeats the schedule past the end", () => {
    expect(wrapNumber(66, 65)).toBe(1);
    expect(wrapNumber(130, 65)).toBe(65);
    expect(wrapNumber(131, 65)).toBe(1);
  });
  it("handles numbers before the epoch and an empty schedule", () => {
    expect(wrapNumber(0, 65)).toBe(65);
    expect(wrapNumber(-1, 65)).toBe(64);
    expect(wrapNumber(7, 0)).toBe(7);
  });
});
