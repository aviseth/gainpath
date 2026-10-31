import { describe, expect, it } from "vitest";
import { EQUIPMENT_TYPES, MOVEMENT_PATTERNS } from "@/data/schema";
import { EQUIPMENT_DRAWINGS, PATTERN_DRAWINGS, type Drawing } from "./drawings";

/** Absolute coordinates touched by a path's commands (enough to check the 48×48 frame). */
function points(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MmLlHhVvCc])([^MmLlHhVvCc]*)/g)) {
    const n = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const step = C === "H" || C === "V" ? 1 : C === "C" ? 6 : 2;
    for (let i = 0; i < n.length; i += step) {
      if (C === "H") x = rel ? x + n[i] : n[i];
      else if (C === "V") y = rel ? y + n[i] : n[i];
      else {
        const [px, py] = C === "C" ? [n[i + 4], n[i + 5]] : [n[i], n[i + 1]];
        x = rel ? x + px : px;
        y = rel ? y + py : py;
      }
      out.push([x, y]);
    }
  }
  return out;
}

function checkDrawing(drawing: Drawing) {
  expect(drawing.d.trim().length).toBeGreaterThan(0);
  for (const [x, y] of points(drawing.d)) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(48);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(48);
  }
}

describe("schematics", () => {
  it.each(MOVEMENT_PATTERNS)("has a drawing for the %s pattern", (pattern) => {
    expect(PATTERN_DRAWINGS[pattern]).toBeDefined();
    checkDrawing(PATTERN_DRAWINGS[pattern]);
    // Movement drawings are stick figures.
    expect(PATTERN_DRAWINGS[pattern].head).toBeDefined();
  });

  it.each(EQUIPMENT_TYPES)("has a drawing for the %s equipment type", (type) => {
    expect(EQUIPMENT_DRAWINGS[type]).toBeDefined();
    checkDrawing(EQUIPMENT_DRAWINGS[type]);
  });

  it("has no drawings for unknown keys", () => {
    expect(Object.keys(PATTERN_DRAWINGS).sort()).toEqual([...MOVEMENT_PATTERNS].sort());
    expect(Object.keys(EQUIPMENT_DRAWINGS).sort()).toEqual([...EQUIPMENT_TYPES].sort());
  });

  it("keeps patterns visually distinct", () => {
    const paths = MOVEMENT_PATTERNS.map((p) => PATTERN_DRAWINGS[p].d);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
