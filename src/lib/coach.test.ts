import { describe, expect, it } from "vitest";
import type { Readiness } from "@/engine/readiness";
import type { LiveExercise, LiveSession } from "@/engine/session";
import { catalogOf, ex } from "@/test/engine-fixtures";
import { coachNote, firstNameFromEmail, greeting, readinessTitle } from "./coach";

const ready = (over: Partial<Readiness> = {}): Readiness => ({
  score: 78,
  band: "normal",
  volumeMod: 1,
  rirAdd: 0,
  allowLoadIncrease: true,
  rationale: [],
  ...over,
});

const press = ex("chest_press", { chest: 1 }, { name: "Machine chest press" });
const catalog = catalogOf(press);

function liveWith(exercise: Partial<LiveExercise>, isDeload = false): LiveSession {
  return {
    version: 1,
    meta: {
      createdAt: 0,
      focus: "full" as never,
      readiness: null,
      isDeload,
      plannedVolume: {},
      needs: {} as never,
      caps: {} as never,
      anchors: [],
      rationale: isDeload ? [{ rule: "DELOAD-2", vars: { pct: 40 } }] : [],
    },
    exercises: [
      {
        exerciseId: "chest_press",
        equipmentId: "eq",
        sets: 3,
        repRange: [8, 12],
        targetReps: 8,
        targetRir: 2,
        rirRange: [1, 3],
        restSeconds: 120,
        weightKg: 25,
        timed: false,
        warmups: [],
        role: "primary" as never,
        isAnchor: true,
        calibration: false,
        estimate: null,
        rationale: [{ rule: "PROG-1-HOLD", vars: { load: 25, reps: 9 } }],
        status: "pending",
        currentWeightKg: 25,
        setsTarget: 3,
        bumped: false,
        sessionE1rm: null,
        ...exercise,
      },
    ],
    startedAt: null,
    finishedAt: null,
    carry: {},
  };
}

describe("greeting", () => {
  it("follows the time of day", () => {
    expect(greeting(7)).toBe("Morning");
    expect(greeting(13)).toBe("Afternoon");
    expect(greeting(21)).toBe("Evening");
  });
});

describe("firstNameFromEmail", () => {
  it("takes a name-like local part", () => {
    expect(firstNameFromEmail("avi@crispa.ai")).toBe("Avi");
    expect(firstNameFromEmail("jane.doe@x.com")).toBe("Jane");
  });
  it("gives up on anything that isn't a name", () => {
    expect(firstNameFromEmail(null)).toBeNull();
    expect(firstNameFromEmail("x@y.z")).toBeNull();
    expect(firstNameFromEmail("user123@x.com")).toBeNull();
  });
});

describe("readinessTitle", () => {
  it("names each band", () => {
    expect(readinessTitle("normal")).toMatch(/full session/);
    expect(readinessTitle("low")).toMatch(/easier/);
  });
});

describe("coachNote", () => {
  it("uses check-in sleep and the anchor's progression template", () => {
    const note = coachNote({
      readiness: ready(),
      hasCheckin: true,
      sleepHours: 7,
      live: liveWith({}),
      catalog,
    });
    expect(note).toBe(
      "You slept 7 hours, so today is a normal session. Machine chest press is your anchor. Same load (25 kg); aim for 9 reps.",
    );
  });

  it("phrases a first-time estimate as plain sentences (PROG-3)", () => {
    const note = coachNote({
      readiness: ready(),
      hasCheckin: true,
      sleepHours: 7,
      live: liveWith({ rationale: [{ rule: "ESTIMATE", vars: { pct: 50 } }] }),
      catalog,
    });
    expect(note).toBe(
      "You slept 7 hours, so today is a normal session. Machine chest press is your anchor. It's your first time on this machine, so it starts light (±50%) and your first set recalibrates it.",
    );
  });

  it("explains reduced readiness with the READY templates", () => {
    const note = coachNote({
      readiness: ready({
        score: 55,
        band: "reduced",
        rationale: [
          { rule: "READY-3", vars: { score: 55, pct: 20 } },
          { rule: "READY-1", vars: { hours: 5 } },
        ],
      }),
      hasCheckin: true,
      sleepHours: 5,
      live: null,
      catalog,
    });
    expect(note).toBe("Volume trimmed because you slept 5 hours (6 or less).");
  });

  it("leads with the deload during a lighter week", () => {
    const note = coachNote({
      readiness: ready(),
      hasCheckin: false,
      sleepHours: null,
      live: liveWith({ rationale: [] }, true),
      catalog,
    });
    expect(note).toMatch(/^Lighter week: same exercises, about 40% fewer sets/);
    expect(note).toMatch(/Machine chest press is your anchor\.$/);
  });

  it("is honest when there's no check-in", () => {
    const note = coachNote({
      readiness: ready(),
      hasCheckin: false,
      sleepHours: null,
      live: null,
      catalog,
    });
    expect(note).toBe("No check-in today, so the plan uses your usual targets.");
  });
});
