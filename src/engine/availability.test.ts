import { describe, expect, it } from "vitest";
import { eq, ex } from "@/test/engine-fixtures";
import { availableCandidates, BODYWEIGHT_EQUIPMENT_ID, equipmentId } from "./availability";

const press = ex(
  "machine_chest_press",
  { chest: 1, triceps: 0.5 },
  { joints: ["shoulder", "elbow"] },
);
const dbBench = ex(
  "dumbbell_bench_press",
  { chest: 1, triceps: 0.5 },
  { equipment_types: ["free_weights", "bench_rack"], implement: "dumbbell" },
);
const pushUp = ex(
  "push_up",
  { chest: 1, triceps: 0.5 },
  { equipment_types: [], implement: "bodyweight" },
);
const legExt = ex("leg_extension", { quads: 1 }, { joints: ["knee"] });
const catalog = [press, dbBench, pushUp, legExt];

describe("availability (ALGORITHMS §7 candidate filter)", () => {
  const chestPress = eq("selectorized");
  const dumbbells = eq("free_weights");
  const bench = eq("bench_rack");
  const extension = eq("selectorized");
  const links = [
    { equipment_id: chestPress.id, exercise_id: press.id },
    { equipment_id: dumbbells.id, exercise_id: dbBench.id },
    { equipment_id: extension.id, exercise_id: legExt.id },
  ];
  const ids = (input: Parameters<typeof availableCandidates>[0]) =>
    availableCandidates(input).map((c) => c.exercise.id);

  it("only offers exercises linked to registered, active equipment", () => {
    expect(ids({ catalog, equipment: [chestPress, dumbbells, bench, extension], links })).toEqual([
      "dumbbell_bench_press",
      "leg_extension",
      "machine_chest_press",
      "push_up",
    ]);
    expect(ids({ catalog, equipment: [], links })).toEqual(["push_up"]);
  });

  it("requires accessory equipment types to be present (a bench for DB bench press)", () => {
    expect(ids({ catalog, equipment: [dumbbells], links })).not.toContain("dumbbell_bench_press");
  });

  it("drops broken, archived, excluded and today-excluded equipment", () => {
    const broken = { ...chestPress, status: "broken" as const };
    expect(ids({ catalog, equipment: [broken], links })).not.toContain("machine_chest_press");
    const archived = { ...chestPress, status: "archived" as const };
    expect(ids({ catalog, equipment: [archived], links })).not.toContain("machine_chest_press");
    expect(
      ids({ catalog, equipment: [chestPress], links, excludedEquipment: new Set([chestPress.id]) }),
    ).not.toContain("machine_chest_press");
    expect(
      ids({
        catalog,
        equipment: [chestPress],
        links,
        tempExcludedEquipment: new Set([chestPress.id]),
      }),
    ).not.toContain("machine_chest_press");
  });

  it("respects permanent and today-only exercise exclusions", () => {
    const all = [chestPress, dumbbells, bench, extension];
    expect(
      ids({ catalog, equipment: all, links, excludedExercises: new Set(["push_up"]) }),
    ).not.toContain("push_up");
    expect(
      ids({ catalog, equipment: all, links, tempExcludedExercises: new Set(["leg_extension"]) }),
    ).not.toContain("leg_extension");
  });

  it("removes anything loading a pain-flagged region (EVIDENCE §10 rule 6)", () => {
    const all = [chestPress, dumbbells, bench, extension];
    expect(ids({ catalog, equipment: all, links, painRegions: new Set(["knee"]) })).not.toContain(
      "leg_extension",
    );
  });

  it("picks the preferred machine when several support the exercise", () => {
    const second = eq("selectorized");
    const both = [...links, { equipment_id: second.id, exercise_id: press.id }];
    const [first] = availableCandidates({
      catalog: [press],
      equipment: [chestPress, second],
      links: both,
      preferredEquipment: () => second.id,
    });
    expect(first.equipment?.id).toBe(second.id);
    expect(first.options).toHaveLength(2);
  });

  it("uses a fixed id for no-equipment exercises", () => {
    const [c] = availableCandidates({ catalog: [pushUp], equipment: [], links: [] });
    expect(equipmentId(c)).toBe(BODYWEIGHT_EQUIPMENT_ID);
  });
});
