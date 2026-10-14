import { describe, expect, it } from "vitest";
import { MUSCLES, MOVEMENT_PATTERNS } from "@/data/schema";
import brands from "./data/brands.json";
import exercises from "./data/exercises.json";
import keywords from "./data/keywords.json";
import loadRatios from "./data/load-ratios.json";
import templates from "./data/equipment-templates.json";
import {
  brandsSchema,
  equipmentTemplatesSchema,
  keywordDictionarySchema,
  loadRatiosSchema,
  seedExercisesSchema,
} from "./schema";

const parsedExercises = seedExercisesSchema.parse(exercises);
const ids = new Set(parsedExercises.map((e) => e.id));

describe("seed data", () => {
  it("validates against the schemas", () => {
    expect(() => keywordDictionarySchema.parse(keywords)).not.toThrow();
    expect(() => loadRatiosSchema.parse(loadRatios)).not.toThrow();
    expect(() => equipmentTemplatesSchema.parse(templates)).not.toThrow();
    expect(() => brandsSchema.parse(brands)).not.toThrow();
  });

  it("has ~150 exercises with unique ids and names", () => {
    expect(parsedExercises.length).toBeGreaterThanOrEqual(140);
    expect(ids.size).toBe(parsedExercises.length);
    const names = new Set(parsedExercises.map((e) => e.name.toLowerCase()));
    expect(names.size).toBe(parsedExercises.length);
  });

  it("covers every muscle as a prime mover (VOL-2) and every movement pattern", () => {
    for (const muscle of MUSCLES) {
      const primes = parsedExercises.filter((e) => e.vector[muscle] === 1);
      expect(primes.length, `${muscle} prime movers`).toBeGreaterThanOrEqual(2);
    }
    for (const pattern of MOVEMENT_PATTERNS) {
      expect(
        parsedExercises.some((e) => e.pattern === pattern),
        `pattern ${pattern}`,
      ).toBe(true);
    }
  });

  it("keeps isolation exercises to one prime mover and compounds to at least two muscles", () => {
    for (const e of parsedExercises) {
      const primes = Object.values(e.vector).filter((w) => w === 1).length;
      const total = Object.keys(e.vector).length;
      if (e.kind === "isolation") expect(primes, e.id).toBeLessThanOrEqual(2);
      else expect(total, e.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps primary equipment type consistent with the implement", () => {
    const expected: Record<string, string[]> = {
      barbell: ["free_weights", "bench_rack"],
      ez_bar: ["free_weights"],
      trap_bar: ["free_weights"],
      dumbbell: ["free_weights"],
      kettlebell: ["free_weights"],
      cable: ["cable_station"],
      machine: ["selectorized", "plate_loaded"],
      smith: ["plate_loaded", "bench_rack"],
      bodyweight: ["bodyweight_station", "bench_rack"],
    };
    for (const e of parsedExercises) {
      if (e.equipment_types.length === 0) {
        expect(e.implement, `${e.id} needs no equipment`).toBe("bodyweight");
        continue;
      }
      expect(expected[e.implement], e.id).toContain(e.equipment_types[0]);
    }
  });

  it("never marks heavy barbell squat/bench/deadlift as calibration-safe (ALGORITHMS §10)", () => {
    for (const e of parsedExercises) {
      if (e.implement === "barbell" && ["squat", "hinge", "horizontal_push"].includes(e.pattern)) {
        expect(e.calibration_safe, e.id).toBe(false);
      }
    }
  });

  it("only references exercises that exist", () => {
    for (const entry of keywordDictionarySchema.parse(keywords)) {
      for (const id of entry.exercise_ids) expect(ids.has(id), `keyword → ${id}`).toBe(true);
    }
    for (const t of equipmentTemplatesSchema.parse(templates)) {
      for (const id of t.exercise_ids) expect(ids.has(id), `template ${t.id} → ${id}`).toBe(true);
    }
    for (const r of loadRatiosSchema.parse(loadRatios)) {
      expect(ids.has(r.from), `ratio from ${r.from}`).toBe(true);
      expect(ids.has(r.to), `ratio to ${r.to}`).toBe(true);
    }
  });

  it("links every template exercise to a matching primary equipment type", () => {
    const byId = new Map(parsedExercises.map((e) => [e.id, e]));
    for (const t of equipmentTemplatesSchema.parse(templates)) {
      expect(t.max_kg, t.id).toBeGreaterThanOrEqual(t.min_kg);
      for (const id of t.exercise_ids) {
        expect(byId.get(id)!.equipment_types[0], `${t.id} → ${id}`).toBe(t.type);
      }
    }
  });
});
