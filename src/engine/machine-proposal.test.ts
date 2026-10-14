import { describe, expect, it } from "vitest";
import { buildCatalog } from "@/seed/catalog";
import { machineNameKey, validateMachineProposal } from "./machine-proposal";

const catalog = buildCatalog([]);
const legCurl = [...catalog.values()].find((e) => /seated leg curl/i.test(e.name))!;

describe("validateMachineProposal", () => {
  it("keeps catalogue IDs, drops unknown ones, and builds vectors for new exercises", () => {
    const v = validateMachineProposal(
      {
        recognised: true,
        equipment_name: " Seated leg curl ",
        equipment_type: "selectorized",
        brand: "Technogym",
        model: null,
        notes: null,
        exercises: [
          {
            catalog_id: legCurl.id,
            name: legCurl.name,
            pattern: "knee_flexion",
            primary_muscles: ["hamstrings"],
            secondary_muscles: [],
          },
          {
            catalog_id: "invented-id",
            name: "Thing",
            pattern: "knee_flexion",
            primary_muscles: ["hamstrings"],
            secondary_muscles: [],
          },
          {
            catalog_id: null,
            name: "Single-leg curl hold",
            pattern: "knee_flexion",
            primary_muscles: ["hamstrings"],
            secondary_muscles: ["calves"],
          },
          {
            catalog_id: null,
            name: "No muscles",
            pattern: "knee_flexion",
            primary_muscles: [],
            secondary_muscles: ["calves"],
          },
        ],
      },
      catalog,
    );
    expect(v.recognised).toBe(true);
    expect(v.name).toBe("Seated leg curl");
    expect(v.exerciseIds).toEqual([legCurl.id]);
    expect(v.newExercises).toEqual([
      {
        name: "Single-leg curl hold",
        pattern: "knee_flexion",
        vector: { hamstrings: 1, calves: 0.5 },
        kind: "isolation",
      },
    ]);
    expect(v.dropped).toBe(2);
  });

  it("treats a proposal with no usable exercises as unrecognised", () => {
    const v = validateMachineProposal(
      {
        recognised: true,
        equipment_name: "?",
        equipment_type: "selectorized",
        brand: null,
        model: null,
        notes: null,
        exercises: [],
      },
      catalog,
    );
    expect(v.recognised).toBe(false);
  });

  it("normalises cache keys", () => {
    expect(machineNameKey("  Hammer  Strength ISO ")).toBe("hammer strength iso");
  });
});
