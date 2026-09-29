import { describe, expect, it } from "vitest";
import { bins, percentile } from "../../src/histogram";
import { shareText } from "../../src/share";
import { EMPTY_STATS, averageGuesses, recordGiveUp, recordSolve } from "../../src/storage";
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

describe("recordGiveUp", () => {
  it("counts a play but not a solve and ends the streak", () => {
    const a = recordSolve(recordSolve(EMPTY_STATS, 10, 4), 11, 2);
    const b = recordGiveUp(a);
    expect(b).toMatchObject({ played: 3, solved: 2, gaveUp: 1, streak: 0, bestStreak: 2 });
    expect(b.totalGuesses).toBe(6);
  });
});

describe("averageGuesses", () => {
  it("averages over solves only", () => {
    expect(averageGuesses({ ...EMPTY_STATS, solved: 2, totalGuesses: 8 })).toBe("4");
    expect(averageGuesses({ ...EMPTY_STATS, solved: 3, totalGuesses: 8 })).toBe("2.7");
    expect(averageGuesses({ ...EMPTY_STATS, played: 3, gaveUp: 3 })).toBe("0");
  });
});

describe("shareText", () => {
  it("uses singular for one guess", () => {
    expect(shareText(212, 1, "https://x")).toBe("Lipreadle No. 212, 1 guess\nhttps://x");
    expect(shareText(212, 4, "https://x")).toBe("Lipreadle No. 212, 4 guesses\nhttps://x");
  });
  it("says so after a give-up", () => {
    expect(shareText(212, 7, "https://x", true)).toBe(
      "Lipreadle No. 212, gave up after 7\nhttps://x",
    );
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
  it("ranks give-ups below every solve and gives them no percentile", () => {
    const counts = new Array<number>(51).fill(0);
    counts[0] = 5;
    counts[3] = 5;
    expect(percentile(counts, 3)).toBe(100);
    expect(percentile(counts, 0)).toBeNull();
  });
});

describe("bins with give-ups", () => {
  it("adds a gave-up row when anyone gave up or I did", () => {
    const counts = new Array<number>(51).fill(0);
    counts[0] = 3;
    const rows = bins(counts, 0);
    expect(rows[rows.length - 1]).toEqual({ label: "gave up", count: 3, mine: true });
    expect(bins(new Array<number>(51).fill(0), 2).some((r) => r.label === "gave up")).toBe(false);
  });
});
