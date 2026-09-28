import { describe, expect, it } from "vitest";
import { matchLevel } from "../../shared/feedback";
import { similarity, visemeTable } from "../../worker/visemes";

describe("visemeTable", () => {
  it("parses word and shape string", () => {
    const t = visemeTable("brave mref\nmatch mec\n");
    expect(t.get("brave")).toBe("mref");
    expect(t.get("match")).toBe("mec");
  });
});

describe("similarity", () => {
  it("is one for identical shapes and zero for empty input", () => {
    expect(similarity("mref", "mref")).toBe(1);
    expect(similarity("", "mref")).toBe(0);
  });
  it("ranks a near miss above a stranger", () => {
    const near = similarity("mref", "kref");
    const far = similarity("mref", "wodr");
    expect(near).toBeGreaterThan(far);
    expect(near).toBeGreaterThanOrEqual(0.6);
    expect(far).toBeLessThan(0.3);
  });
  it("charges half for confusable shapes", () => {
    expect(similarity("mads", "mals")).toBe(0.875);
  });
});

describe("matchLevel", () => {
  it("buckets the four levels", () => {
    expect(matchLevel(1)).toBe(3);
    expect(matchLevel(0.7)).toBe(2);
    expect(matchLevel(0.4)).toBe(1);
    expect(matchLevel(0.1)).toBe(0);
  });
});
