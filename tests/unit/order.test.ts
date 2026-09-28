import { describe, expect, it } from "vitest";
import { guessOrder } from "../../src/order";

describe("guessOrder", () => {
  it("puts closer guesses first and newer ones first within a level", () => {
    expect(guessOrder([1, 2, 0, 2, 1])).toEqual([3, 1, 4, 0, 2]);
  });
  it("handles an empty list and a single guess", () => {
    expect(guessOrder([])).toEqual([]);
    expect(guessOrder([3])).toEqual([0]);
  });
});
