import { describe, expect, it } from "vitest";
import { formatWeights, parseWeights } from "./weights";

describe("parseWeights", () => {
  it("treats empty input as no list", () => {
    expect(parseWeights("")).toEqual({ ok: true, weights: null });
    expect(parseWeights("   ")).toEqual({ ok: true, weights: null });
  });

  it("parses comma, semicolon and space separated lists, sorted without repeats", () => {
    expect(parseWeights("2, 4, 6, 8")).toEqual({ ok: true, weights: [2, 4, 6, 8] });
    expect(parseWeights("8;2 6,4,4")).toEqual({ ok: true, weights: [2, 4, 6, 8] });
    expect(parseWeights("2.5, 5 kg, 7.5kg")).toEqual({ ok: true, weights: [2.5, 5, 7.5] });
  });

  it("rejects non-numbers, zero and negatives", () => {
    expect(parseWeights("2, four").ok).toBe(false);
    expect(parseWeights("0, 2").ok).toBe(false);
    expect(parseWeights("-2").ok).toBe(false);
  });

  it("rejects input with separators but no weights", () => {
    expect(parseWeights(", ;").ok).toBe(false);
    expect(parseWeights("kg").ok).toBe(true); // only a unit: same as empty
  });

  it("keeps weights exactly as typed (no rounding to zero or to cents)", () => {
    expect(parseWeights("0.004")).toEqual({ ok: true, weights: [0.004] });
    expect(parseWeights("1.125, 2")).toEqual({ ok: true, weights: [1.125, 2] });
  });

  it("round-trips through formatWeights", () => {
    expect(formatWeights([2, 4, 6.5])).toBe("2, 4, 6.5");
    expect(formatWeights(null)).toBe("");
  });
});
