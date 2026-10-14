/**
 * Every tunable engine constant (ALGORITHMS.md). Entries graded H are
 * heuristics: the AI must call them "rules of thumb" (EVIDENCE §10.3), and the
 * user can edit them in Settings → Advanced within [min, max].
 */

export interface ConfigEntry {
  value: number;
  min: number;
  max: number;
  /** EVIDENCE.md rule this constant implements. */
  rule: string;
  /** Graded H in EVIDENCE.md: a rule of thumb, not a research finding. */
  heuristic: boolean;
  label: string;
}

const h = (value: number, min: number, max: number, rule: string, label: string): ConfigEntry => ({
  value,
  min,
  max,
  rule,
  heuristic: true,
  label,
});
const e = (value: number, min: number, max: number, rule: string, label: string): ConfigEntry => ({
  value,
  min,
  max,
  rule,
  heuristic: false,
  label,
});

export const CONFIG = {
  // §1 e1RM (PROG-3)
  e1rmMaxReps: e(10, 5, 15, "PROG-3", "Max reps per set used for e1RM"),
  e1rmMinRpe: e(6, 5, 8, "PROG-3", "Min RPE for a set to update e1RM"),
  e1rmAlpha: h(0.3, 0.05, 1, "PROG-3", "e1RM smoothing (EWMA α)"),
  e1rmSessionWindow: h(3, 1, 10, "PROG-3", "Recent sessions considered for e1RM"),
  e1rmOutlierJump: h(0.1, 0.02, 0.5, "PROG-3", "Jump treated as outlier (fraction)"),
  e1rmOutlierAccept: h(0.05, 0.01, 0.2, "PROG-3", "Max e1RM increase per update for outliers"),

  // §2 load rounding
  roundingShortfall: h(0.075, 0.02, 0.2, "PROG-2", "Shortfall that adds +1 target rep"),

  // §3 rest (REST-1)
  restStrengthMain: e(180, 90, 360, "REST-1", "Rest: strength main lift (s)"),
  restStrengthAccessory: e(120, 60, 300, "REST-1", "Rest: strength accessory (s)"),
  restHypertrophyCompound: e(135, 60, 300, "REST-1", "Rest: hypertrophy compound (s)"),
  restHypertrophyIsolation: e(90, 60, 240, "REST-1", "Rest: hypertrophy isolation (s)"),
  restTimeSaver: h(60, 30, 90, "REST-1", "Rest in time-saver mode (s)"),

  // §4 readiness (READY-1..3)
  readinessBase: h(70, 40, 90, "READY-3", "Readiness starting score"),
  readinessSleepQualityWeight: h(6, 0, 15, "READY-3", "Points per sleep-quality step"),
  readinessEnergyWeight: h(6, 0, 15, "READY-3", "Points per energy step"),
  shortSleepHours: e(6, 4, 8, "READY-1", "Short sleep threshold (h, inclusive)"),
  shortSleepPenalty: h(10, 0, 30, "READY-1", "Short sleep penalty (points)"),
  baselineMinDays: h(7, 3, 14, "READY-2", "Days of wearable data before using it"),
  baselineWindowDays: h(14, 7, 30, "READY-2", "Wearable baseline window (days)"),
  hrvWeight: h(4, 0, 10, "READY-2", "Points per HRV z-score"),
  restingHrWeight: h(3, 0, 10, "READY-2", "Points per resting-HR z-score"),
  zClamp: h(2, 1, 3, "READY-2", "Wearable z-score clamp"),
  readinessNormal: h(70, 50, 90, "READY-3", "Readiness for a normal session"),
  readinessLow: h(50, 30, 70, "READY-3", "Readiness below which loads don't increase"),
  reducedVolumeMod: h(0.85, 0.5, 1, "READY-1", "Volume multiplier at reduced readiness"),
  reducedRirAdd: h(0.5, 0, 2, "READY-3", "Extra RIR at reduced readiness"),
  lowVolumeMod: h(0.7, 0.4, 1, "READY-1", "Volume multiplier at low readiness"),
  lowRirAdd: h(1, 0, 3, "READY-3", "Extra RIR at low readiness"),

  // §5 fatigue (REC-1, EFF-2)
  effortRpe10: h(1.5, 1, 3, "EFF-2", "Fatigue weight of a set at RPE 10"),
  effortRpe9: h(1.2, 0.8, 2, "REC-1", "Fatigue weight of a set at RPE 9"),
  effortRpe8: h(1, 0.5, 1.5, "REC-1", "Fatigue weight of a set at RPE 8"),
  effortLow: h(0.7, 0.3, 1, "REC-1", "Fatigue weight of a set at RPE ≤7"),
  effortUnknown: h(1, 0.5, 1.5, "REC-1", "Fatigue weight of a set with no RPE"),
  halfLifeLarge: h(36, 12, 96, "REC-1", "Fatigue half-life, large muscles (h)"),
  halfLifeSmall: h(24, 12, 72, "REC-1", "Fatigue half-life, small muscles (h)"),
  sorenessWeight: h(1.5, 0, 4, "REC-1", "Fatigue per soreness point"),
  fatigueCap: h(8, 3, 20, "REC-1", "Fatigue at 0% recovery"),
  lowRecovery: h(40, 10, 70, "REC-1", "Recovery % that soft-limits a muscle"),
  lowRecoverySetFraction: h(0.5, 0.2, 1, "REC-1", "Session sets allowed at low recovery"),

  // §6 volume (VOL-1..5)
  baseNovice: h(9, 4, 20, "VOL-5", "Weekly sets per muscle: novice"),
  baseIntermediate: h(12, 6, 24, "VOL-5", "Weekly sets per muscle: intermediate"),
  baseAdvanced: h(15, 8, 30, "VOL-5", "Weekly sets per muscle: advanced"),
  goalFactorHypertrophy: h(1, 0.5, 1.5, "VOL-1", "Volume factor: hypertrophy"),
  goalFactorStrength: h(0.75, 0.4, 1.2, "VOL-1", "Volume factor: strength"),
  goalFactorGeneral: h(0.8, 0.4, 1.2, "VOL-1", "Volume factor: general"),
  sessionCapPerMuscle: e(10, 4, 16, "VOL-4", "Max fractional sets per muscle per session"),
  minExposureBoost: h(1.5, 1, 3, "PHIL-1", "Boost for a muscle not yet trained this week"),
  minNeed: h(0.5, 0.1, 2, "VOL-1", "Smallest remaining need worth training"),

  // §7 builder
  setWorkSeconds: h(40, 20, 90, "PHIL-1", "Seconds of work per set"),
  minSetsPerExercise: h(2, 1, 3, "VOL-1", "Min sets per exercise"),
  maxSetsPerExercise: h(4, 2, 6, "VOL-4", "Max sets per exercise"),
  wOvershoot: h(0.5, 0, 2, "VOL-4", "Builder: overshoot penalty"),
  wFatigue: h(0.3, 0, 2, "REC-1", "Builder: systemic fatigue penalty"),
  wFavourite: h(1, 0, 3, "PHIL-2", "Builder: favourite bonus"),
  wAnchor: h(0.8, 0, 3, "PROG-1", "Builder: anchor-lift bonus"),
  wSamePattern: h(1.5, 0, 3, "VOL-3", "Builder: repeated-pattern penalty"),
  wUsedLastSession: h(0.5, 0, 2, "PHIL-2", "Builder: variety penalty"),
  adjacentCosine: h(0.8, 0.5, 1, "REC-1", "Avoid back-to-back exercises this similar"),

  // §8 anchors
  mesocycleWeeks: h(5, 4, 6, "PROG-1", "Mesocycle length (weeks)"),
  anchorBrokenDays: h(7, 1, 30, "PROG-1", "Days broken before an anchor is replaced"),

  // §9 progression (PROG-1, PROG-2)
  maxLoadIncrease: h(0.05, 0.01, 0.15, "PROG-2", "Max load increase per exposure"),
  loadReduceFactor: h(0.92, 0.8, 0.98, "PROG-1", "Load after two short exposures"),
  rirTolerance: h(0.5, 0, 2, "PROG-1", "RIR slack for a load increase"),
  inSessionDelta: h(1.5, 0.5, 3, "PROG-1", "RPE miss that triggers an in-session change"),
  inSessionE1rmDrop: h(0.05, 0.02, 0.2, "PROG-1", "e1RM drop that lowers the load"),

  // §10 calibration (EFF-3)
  calibrationAlpha: h(0.3, 0.05, 1, "EFF-3", "RIR calibration smoothing (α)"),
  calibrationClamp: e(2, 1, 3, "EFF-3", "Max RIR calibration offset"),
  calibrationMaxReps: e(12, 8, 20, "EFF-3", "Apply calibration to sets up to N reps"),
  calibrationIntervalDays: h(21, 14, 42, "EFF-3", "Days between calibration sets"),

  // §11 deload & auto-tuning (DELOAD-1, DELOAD-2)
  plateauExposures: h(4, 3, 8, "DELOAD-1", "Exposures checked for a plateau"),
  plateauMinWeeks: h(3, 1, 8, "DELOAD-1", "Min weeks spanned by a plateau"),
  plateauAnchors: h(2, 1, 5, "DELOAD-1", "Plateaued anchors that suggest a deload"),
  lowReadinessDays: h(4, 2, 7, "DELOAD-1", "Low-readiness check-ins (of 7) that suggest a deload"),
  deloadReminderWeeks: h(8, 4, 12, "DELOAD-1", "Weeks before a deload reminder"),
  deloadVolume: h(0.6, 0.4, 0.8, "DELOAD-2", "Deload volume multiplier"),
  deloadMinRir: h(3, 2, 5, "DELOAD-2", "Min RIR during a deload"),
  tuneUp: h(1.1, 1, 1.3, "VOL-1", "Mesocycle volume increase"),
  tuneDown: h(0.9, 0.7, 1, "VOL-1", "Mesocycle volume decrease"),
  tuneMax: h(1.5, 1, 2, "VOL-1", "Max per-muscle volume adjustment"),
  tuneMin: h(0.7, 0.5, 1, "VOL-1", "Min per-muscle volume adjustment"),
  tuneReadinessUp: h(60, 40, 80, "VOL-1", "Avg readiness needed to add volume"),
  tuneReadinessDown: h(55, 30, 70, "VOL-1", "Avg readiness below which volume drops"),

  // §12 swaps
  swapSingleThreshold: h(0.85, 0.5, 1, "VOL-2", "Similarity for a single swap"),
  swapPatternBonus: h(0.1, 0, 0.5, "VOL-2", "Swap: same-pattern bonus"),
  swapFatiguePenalty: h(0.1, 0, 0.5, "REC-1", "Swap: fatigued-muscle penalty"),
  swapFavouriteBonus: h(0.05, 0, 0.3, "PHIL-2", "Swap: favourite bonus"),
  swapComboK: h(15, 5, 30, "VOL-2", "Swap: candidates for combos"),
  swapComboMargin: h(0.05, 0, 0.3, "VOL-2", "Swap: combo must beat single by"),
  busySwaps: h(3, 2, 10, "PHIL-1", "Busy swaps before suggesting deprioritising"),
  busyWindowDays: h(28, 7, 90, "PHIL-1", "Busy-swap window (days)"),
  busyPenalty: h(1, 0, 3, "PHIL-1", "Score penalty for a busy machine"),

  // §13 registry
  matchThreshold: h(0.75, 0.4, 1, "PHIL-1", "Fuzzy match needed to suggest a machine"),

  // §14 warm-ups
  warmupMinKg: h(40, 0, 100, "PHIL-1", "Warm up compounds from this load (kg)"),
  warmupMinPct: h(0.5, 0, 1, "PHIL-1", "…or from this fraction of e1RM"),

  // §15 new-machine estimates
  otherEquipmentFactor: h(0.85, 0.5, 1, "PROG-3", "Same exercise, other machine: e1RM factor"),
  similarExerciseFactor: h(0.8, 0.5, 1, "PROG-3", "Similar exercise: extra safety factor"),
  similarExerciseCosine: h(0.8, 0.5, 1, "PROG-3", "Similarity needed to borrow an e1RM"),
  fallbackSteps: h(2, 0, 6, "PROG-2", "Unknown load: equipment steps above minimum"),
  fallbackRir: h(4, 2, 6, "PROG-2", "Unknown load: target RIR for the first set"),

  // §17 parser
  rpeGrind: h(9.5, 8.5, 10, "EFF-3", "RPE for 'grind'"),
  rpeEasy: h(7, 6, 8, "EFF-3", "RPE for 'easy'"),

  // AI (PROMPT: hard daily limit)
  aiDailyLimit: h(20, 0, 200, "PHIL-1", "AI calls per day"),
} satisfies Record<string, ConfigEntry>;

export type ConfigKey = keyof typeof CONFIG;
export type Config = Record<ConfigKey, number>;

export const DEFAULT_CONFIG: Config = Object.fromEntries(
  Object.entries(CONFIG).map(([k, v]) => [k, v.value]),
) as Config;

/** Merge user overrides (profile.config_overrides), ignoring unknown keys and clamping to bounds. */
export function resolveConfig(overrides: Record<string, number> = {}): Config {
  const config = { ...DEFAULT_CONFIG };
  for (const [key, value] of Object.entries(overrides)) {
    const entry = CONFIG[key as ConfigKey];
    if (!entry || !Number.isFinite(value)) continue;
    config[key as ConfigKey] = Math.min(entry.max, Math.max(entry.min, value));
  }
  return config;
}
