import { describe, expect, it } from "vitest";
import { bins, percentile } from "../../src/histogram";
import { shareText } from "../../src/share";
import { EMPTY_STATS, averageGuesses, recordSolve } from "../../src/storage";
import { formatCountdown, localDate, msUntilMidnight } from "../../src/time";

describe("recordSolve", () => {
  it("starts a streak and extends it on consecutive days", () => {
    const a = recordSolve(EMPTY_STATS, 10, 4);
    expect(a).toMatchObject({ played: 1, totalGuesses: 4, streak: 1, bestStreak: 1 });
    const b = recordSolve(a, 11, 2);
    expect(b).toMatchObject({ played: 2, totalGuesses: 6, streak: 2, bestStreak: 2 });
    const c = recordSolve(b, 13, 1);
    expect(c).toMatchObject({ streak: 1, bestStreak: 2 });
  });
  it("ignores a repeat of the same puzzle", () => {
    const a = recordSolve(EMPTY_STATS, 10, 4);
    expect(recordSolve(a, 10, 9)).toBe(a);
  });
});

describe("averageGuesses", () => {
  it("formats whole and fractional averages", () => {
    expect(averageGuesses({ ...EMPTY_STATS, played: 2, totalGuesses: 8 })).toBe("4");
    expect(averageGuesses({ ...EMPTY_STATS, played: 3, totalGuesses: 8 })).toBe("2.7");
    expect(averageGuesses(EMPTY_STATS)).toBe("0");
  });
});

describe("shareText", () => {
  it("uses singular for one guess", () => {
    expect(shareText(212, 1, "https://x")).toBe("Lipreadle No. 212, 1 guess\nhttps://x");
    expect(shareText(212, 4, "https://x")).toBe("Lipreadle No. 212, 4 guesses\nhttps://x");
  });
});

describe("time", () => {
  it("formats the local date without timezone shifts", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("counts to the next local midnight", () => {
    expect(msUntilMidnight(new Date(2026, 0, 5, 23, 0))).toBe(3_600_000);
  });
  it("formats countdowns", () => {
    expect(formatCountdown(3_600_000)).toBe("1 h");
    expect(formatCountdown(90 * 60_000)).toBe("1 h 30 min");
    expect(formatCountdown(5 * 60_000)).toBe("5 min");
  });
});

describe("bins", () => {
  it("shows at least eight rows and marks the player's row", () => {
    const counts = new Array<number>(51).fill(0);
    counts[3] = 4;
    const rows = bins(counts, 3);
    expect(rows).toHaveLength(8);
    expect(rows[2]).toEqual({ label: "3", count: 4, mine: true });
  });
  it("collapses long tails into a final bucket", () => {
    const counts = new Array<number>(51).fill(0);
    counts[20] = 2;
    counts[40] = 1;
    const rows = bins(counts, 22);
    expect(rows).toHaveLength(16);
    expect(rows[15]).toEqual({ label: "16+", count: 3, mine: true });
  });
});

describe("percentile", () => {
  it("needs a handful of players before reporting", () => {
    const counts = new Array<number>(51).fill(0);
    counts[2] = 2;
    expect(percentile(counts, 2)).toBeNull();
    counts[5] = 8;
    expect(percentile(counts, 2)).toBe(100);
    expect(percentile(counts, 5)).toBe(80);
  });
});
