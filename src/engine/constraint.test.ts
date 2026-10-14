import { describe, expect, it } from "vitest";
import { eq } from "@/test/engine-fixtures";
import { matchConstraint } from "./constraint";

const cable1 = eq("cable_station", { name: "Functional trainer" });
const cable2 = eq("cable_station", { name: "Cable crossover" });
const legPress = eq("plate_loaded", { name: "Hammer Strength Leg Press" });
const chestPress = eq("selectorized", { name: "Technogym Chest Press" });
const dumbbells = eq("free_weights", { name: "Dumbbells 2–40 kg" });
const gym = [cable1, cable2, legPress, chestPress, dumbbells];

describe("free-text constraints (ALGORITHMS §18 keyword step)", () => {
  it("maps equipment types: 'all the cable stations are taken'", () => {
    expect(matchConstraint("all the cable stations are taken", gym).equipmentIds.sort()).toEqual(
      [cable1.id, cable2.id].sort(),
    );
  });

  it("maps a named machine without matching every 'press'", () => {
    const r = matchConstraint("the leg press is busy", gym);
    expect(r.equipmentIds).toEqual([legPress.id]);
  });

  it("understands dumbbells / free weights", () => {
    expect(matchConstraint("someone is hogging the dumbbells", gym).equipmentIds).toEqual([
      dumbbells.id,
    ]);
  });

  it("finds nothing when the text isn't about unavailable equipment (→ LLM, if opted in)", () => {
    expect(matchConstraint("I want more arm work", gym).equipmentIds).toEqual([]);
    expect(matchConstraint("the thingamajig is taken", gym).equipmentIds).toEqual([]);
  });
});
