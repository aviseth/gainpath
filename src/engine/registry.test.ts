import { describe, expect, it } from "vitest";
import { BRANDS, KEYWORDS } from "@/seed/catalog";
import { cfg } from "@/test/engine-fixtures";
import { keywordScore, matchMachine, normaliseMachineName, proposeExercises } from "./registry";

const propose = (name: string) =>
  proposeExercises(matchMachine(name, KEYWORDS, BRANDS, cfg.matchThreshold));

describe("machine registration without the LLM (ALGORITHMS §13)", () => {
  it("strips brand words and punctuation", () => {
    expect(normaliseMachineName("Technogym Selection — Chest Press!", BRANDS)).toBe(
      "selection chest press",
    );
    expect(normaliseMachineName("Life Fitness Signature Leg Curl", BRANDS)).toBe(
      "signature leg curl",
    );
  });

  it("scores token sets, abbreviations and typos", () => {
    expect(keywordScore("selection chest press", "chest press")).toBe(1);
    expect(keywordScore("leg ext", "leg extension")).toBe(1);
    expect(keywordScore("leg extention", "leg extension")).toBe(1);
    expect(keywordScore("leg", "leg extension")).toBe(0.5);
  });

  it("proposes the right exercises for common machine names", () => {
    expect(propose("Technogym Selection Chest Press")).toContain("machine_chest_press");
    expect(propose("Cybex Leg Ext")).toContain("leg_extension");
    expect(propose("Matrix Lat Pulldown")).toContain("lat_pulldown_wide");
    expect(propose("Precor Pec Deck")).toEqual(
      expect.arrayContaining(["pec_deck_fly", "reverse_pec_deck"]),
    );
    expect(propose("Hammer Strength Hack Squat")).toContain("hack_squat");
  });

  it("returns nothing below the 0.75 threshold, so the user can ask the AI", () => {
    expect(propose("Flux capacitor 3000")).toEqual([]);
    expect(matchMachine("", KEYWORDS, BRANDS, 0.75)).toEqual([]);
  });

  it("lets the user's cached dictionary win", () => {
    const cached = [
      {
        keywords: ["the beast"],
        exercise_ids: ["hack_squat"],
        equipment_type: "plate_loaded" as const,
      },
    ];
    expect(
      proposeExercises(matchMachine("The Beast", [...cached, ...KEYWORDS], BRANDS, 0.75)),
    ).toEqual(["hack_squat"]);
  });
});
