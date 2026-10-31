import type { EquipmentType, MovementPattern } from "@/data/schema";

/**
 * Line drawings for movement patterns and equipment types, on a 48×48 grid.
 * Style: stick figure (head circle r 3.2) plus the minimal machine or
 * implement, stroked with currentColor at ~2.6 with round caps and joins, so
 * they read at 32–52 px. Pure data, so a test can check every pattern and
 * type has one.
 */
export interface Drawing {
  /** Path data for the body and the machine. */
  d: string;
  /** Head centre (r 3.2). */
  head?: readonly [number, number];
  /** Pads, pulleys and weights: [cx, cy, r]. */
  dots?: ReadonlyArray<readonly [number, number, number]>;
}

export const HEAD_R = 3.2;

export const PATTERN_DRAWINGS: Record<MovementPattern, Drawing> = {
  // Seated chest press (reference drawing).
  horizontal_push: { d: "M12 42V16M8 42h22M18 15v15h10v10M18 20h12M31 15v10", head: [18, 11] },
  // Standing overhead press.
  vertical_push: {
    d: "M24 18v14M24 32l-4 12M24 32l4 12M24 19l-8-2V5M24 19l8-2V5M10 5h28",
    head: [24, 14],
  },
  // Seated cable row.
  horizontal_pull: {
    d: "M12 16v16h14l4 8M12 20l-4 5h31M42 8v36M6 35h12",
    head: [12, 12],
    dots: [[42, 25, 2.4]],
  },
  // Lat pulldown (reference drawing).
  vertical_pull: { d: "M8 7h32M24 3v4M14 7l10 14 10-14M24 21v13h10v8M18 34h14", head: [24, 17] },
  // Barbell back squat.
  squat: {
    d: "M12 14h24M12 10v8M36 10v8M24 13l-7 15 12 2-4 13M22 17l-5-3",
    head: [25, 9],
  },
  // Deadlift / hip hinge.
  hinge: {
    d: "M14 24l15-7M14 24l2 10-2 10M29 17v16M20 33h18M21 29v8M37 29v8",
    head: [33, 15],
  },
  // Dumbbell split squat / lunge.
  lunge: { d: "M24 13v15l8 4v12M24 28l-6 12-8 2M24 17l-5 10M17 27h4", head: [24, 9] },
  // Leg extension (reference drawing).
  knee_extension: { d: "M11 14v18h17M16 13v17h13l10-7", head: [16, 9], dots: [[40, 22, 2.4]] },
  // Seated leg curl (reference drawing).
  knee_flexion: { d: "M11 14v18h17M16 13v17h13v12", head: [16, 9], dots: [[32, 40, 2.4]] },
  // Hip abduction machine, front view: pads outside the knees.
  hip_abduction: {
    d: "M24 13v16M24 29l-10 5v10M24 29l10 5v10M8 31v8M40 31v8M16 29h16",
    head: [24, 9],
  },
  // Hip adduction machine, front view: pads inside the knees.
  hip_adduction: {
    d: "M24 13v16M24 29l-12 5v10M24 29l12 5v10M18 35v7M30 35v7M16 29h16",
    head: [24, 9],
  },
  // Hip thrust: shoulders on a bench, hips up.
  hip_extension: {
    d: "M11 23l16-1 10 2v16M6 27h10M11 27v13M33 40h10",
    head: [7, 21],
    dots: [[27, 16, 3.6]],
  },
  // Standing dumbbell curl.
  elbow_flexion: { d: "M22 13v17M22 30l-4 14M22 30l4 14M22 17l2 9 7-7M31 15v8", head: [22, 9] },
  // Cable triceps pushdown.
  elbow_extension: {
    d: "M22 13v17M22 30l-4 14M22 30l4 14M22 17l3 9 6 4M40 4v40M38 11l-7 19",
    head: [22, 9],
    dots: [[40, 10, 2.4]],
  },
  // Lateral raise, front view.
  shoulder_abduction: {
    d: "M24 13v17M24 30l-5 14M24 30l5 14M24 17H10M24 17h14M10 14v6M38 14v6",
    head: [24, 9],
  },
  // Front raise, side view.
  shoulder_flexion: { d: "M20 13v17M20 30l-4 14M20 30l4 14M20 17h16M36 14v6", head: [20, 9] },
  // Cable face pull / rear-delt fly (reference drawing).
  rear_delt_fly: {
    d: "M41 4v40M39 14H27M18 14v16l-4 14M18 30l4 14M18 18l9-4",
    head: [18, 10],
    dots: [[41, 14, 2.4]],
  },
  // Pec deck, front view.
  chest_fly: { d: "M24 14v16M24 18H13V9M24 18h11V9M24 30l-6 4v10M24 30l6 4v10", head: [24, 10] },
  // Standing calf raise on a step.
  calf_raise: { d: "M24 12v17M24 29l1 11 5 4M27 44h14M38 30v-8M35 25l3-3 3 3", head: [24, 8] },
  // Crunch.
  core_flexion: { d: "M4 42h40M24 40l8-10 8 10M24 40c-5 0-9-3-11-8", head: [11, 27] },
  // Forearm plank.
  core_anti_extension: { d: "M4 43h40M14 31l28 10M14 31v10h6", head: [9, 29] },
  // Cable woodchop / rotation.
  core_rotation: {
    d: "M22 13v17M22 30l-4 14M22 30l4 14M22 18l12-7M13 24c3 4 15 4 18 0M28 22l3 2-1 4",
    head: [22, 9],
  },
  // Farmer's carry.
  carry: {
    d: "M24 12v17M24 29l-5 15M24 29l5 15M24 16l-9 11M24 16l9 11",
    head: [24, 8],
    dots: [
      [14, 31, 3],
      [34, 31, 3],
    ],
  },
  // Seated wrist curl: forearm along the thigh, wrist flexing up.
  wrist: { d: "M10 14v16h14v12M10 18l6 9h12l4-4M30 20l5 5", head: [10, 10] },
};

export const EQUIPMENT_DRAWINGS: Record<EquipmentType, Drawing> = {
  // Weight stack with guide rods and a pin.
  selectorized: {
    d: "M8 44V6h32v38M18 10v18M30 10v18M24 6v22M15 30h18M15 34h18M15 38h18M15 42h18",
  },
  // A plate on a loading horn.
  plate_loaded: {
    d: "M35 26h9",
    dots: [
      [22, 26, 13],
      [22, 26, 3.5],
    ],
  },
  // Cable tower: pulley, cable and handle.
  cable_station: { d: "M14 4v40M8 44h12M16.5 11L31 29M28 29h7", dots: [[14, 10, 2.6]] },
  // Dumbbell.
  free_weights: { d: "M10 24h28M12 16v16M17 18v12M36 16v16M31 18v12" },
  // Power rack with a loaded bar on the hooks.
  bench_rack: { d: "M12 6v38M36 6v38M8 44h32M6 18h36M8 14v8M40 14v8M12 21h4M36 21h-4" },
  // Pull-up station with a hanging figure.
  bodyweight_station: {
    d: "M6 8h36M8 8v36M40 8v36M17 8l7 12 7-12M24 20v12M24 32l-3 10M24 32l3 10",
    head: [24, 15],
  },
};
