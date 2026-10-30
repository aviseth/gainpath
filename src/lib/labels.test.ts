import { describe, expect, it } from "vitest";
import { changeDisplay, recoveryTone } from "./labels";

describe("changeDisplay", () => {
  it("shows changes under 0.5% as no change", () => {
    expect(changeDisplay(0)).toEqual({ text: "±0%", tone: "flat" });
    expect(changeDisplay(0.004)).toEqual({ text: "±0%", tone: "flat" });
    expect(changeDisplay(-0.0049)).toEqual({ text: "±0%", tone: "flat" });
  });

  it("signs real gains and losses", () => {
    expect(changeDisplay(0.052)).toEqual({ text: "+5.2%", tone: "up" });
    expect(changeDisplay(-0.031)).toEqual({ text: "-3.1%", tone: "down" });
  });
});

describe("recoveryTone (REC-1, engine scale 0–100)", () => {
  it("uses the 85/60 thresholds on a 0–100 scale", () => {
    expect(recoveryTone(100)).toBe("ok");
    expect(recoveryTone(85)).toBe("ok");
    expect(recoveryTone(84)).toBe("partial");
    expect(recoveryTone(60)).toBe("partial");
    expect(recoveryTone(59)).toBe("low");
    expect(recoveryTone(0)).toBe("low");
  });
});
