# Liftwise — Evidence Base for the Training Engine

This file is the scientific source of truth for every rule in the engine and every claim the AI makes.
Each rule is tagged with an evidence grade:

- **A** — supported by meta-analysis / network meta-analysis / position stand
- **B** — supported by RCTs or a smaller number of controlled studies
- **C** — expert consensus (e.g. Delphi) or extrapolated from adjacent evidence
- **H** — engineering heuristic with no direct evidence; must be labelled as such in code and never presented to the user as "science says"

The engine must reference rule IDs (e.g. `VOL-1`) in code comments and in the `rationale` field the AI shows the user.

---

## 1. Overall philosophy

**PHIL-1 (A).** Any structured resistance training beats none; adherence matters more than fine-tuning variables. The 2026 ACSM position stand (an overview of 137 systematic reviews, >30,000 participants) makes regular participation the primary goal and recommends training all major muscle groups at least twice per week.
→ Engine implication: never generate sessions the user is unlikely to complete (respect session length, preferences, equipment). Missed-session handling should prioritise "get back in" over "make up volume".

**PHIL-2 (A).** Many prescriptions work. Currier et al. 2023 (BJSM, Bayesian network meta-analysis; 178 studies for strength, 119 for hypertrophy) found every resistance training prescription superior to no exercise, and concluded healthy adults can pick a prescription by preference.
→ Engine implication: user preferences (rep ranges, exercises they enjoy) are legitimate inputs, not noise.

---

## 2. Load (intensity)

**LOAD-1 (A).** For maximal strength, heavier loads (>80% 1RM) are best. For hypertrophy, loads across a wide range produce comparable growth when sets are taken close to failure (Currier et al. 2023).
→ Goal = strength: main lifts mostly in the 1–6 rep range (≈80–90% e1RM). Goal = hypertrophy: any range ~5–30 reps is valid; default 6–15 for practicality and RIR accuracy (see EFF-3).

---

## 3. Volume and frequency

**VOL-1 (A).** Volume (weekly hard sets per muscle) has a positive dose-response with both hypertrophy and strength, with diminishing returns that are sharper for strength than for hypertrophy. Source: Pelland et al. 2026, *Sports Medicine* — multilevel meta-regressions of 67 studies, 2,058 participants.

**VOL-2 (A).** Count sets *fractionally*: a set where the muscle is a prime mover counts 1.0; a set where it is a synergist counts 0.5. Pelland et al. found the fractional method had the strongest evidence for predicting outcomes.
→ Each exercise in the DB needs `primary_muscles` (weight 1.0) and `secondary_muscles` (weight 0.5).

**VOL-3 (A, with caveat).** Frequency clearly improves strength (with diminishing returns), even after accounting for volume. For hypertrophy, once volume is equated, frequency effects are small/uncertain (Pelland et al. 2026).
→ Strength goal: spread main-lift practice over ≥2–3 exposures/week. Hypertrophy goal: frequency is mainly a tool to distribute volume (avoid piling too many sets in one session — see VOL-4). Minimum 2×/week per muscle group per PHIL-1.

**VOL-4 (B — preprint, not yet peer reviewed).** Per-session volume appears to plateau: a Remmert et al. preprint on SportRxiv estimates diminishing returns around ~11 fractional sets per muscle per session for hypertrophy and far fewer direct sets for strength.
→ Cap per-muscle volume per session (default ~10 fractional sets; configurable). Re-check when peer-reviewed version appears.

**VOL-5 (H).** Starting weekly volume targets per muscle: novice ~8–10 fractional sets, intermediate ~10–14, advanced ~12–20. These are heuristics consistent with VOL-1's diminishing returns, not values taken directly from a paper. Adjust per user via performance trends.

---

## 4. Effort (proximity to failure) and RPE/RIR

**EFF-1 (A).** Hypertrophy increases as sets get closer to failure (non-linear); strength gains are minimally affected by proximity to failure. Source: Robinson et al. 2024, *Sports Medicine* 54(9):2209–2231 (meta-regressions, proximity quantified as RIR).
→ Hypertrophy work: target 0–3 RIR (RPE 7–10), with isolation exercises allowed closer to failure. Strength work: 2–4 RIR is sufficient; prioritise load over effort.

**EFF-2 (B).** Training to failure slows recovery. Morán-Navarro et al. 2017 (*Eur J Appl Physiol*): to-failure protocols caused larger acute neuromuscular drops and slower recovery at 24–48 h than volume-matched non-failure protocols.
→ Sets logged at RPE 10 add a fatigue multiplier in the recovery model (see REC-1). Avoid failure on heavy compounds, especially the session before a heavy session for the same muscles.

**EFF-3 (A).** RIR-based RPE scale: RPE 10 = 0 RIR, RPE 9 = 1 RIR, etc. (Zourdos et al. 2016, *JSCR* 30(1):267–275 — validated against bar velocity). People slightly *underpredict* reps to failure by ~1 rep on average, with large heterogeneity; accuracy is better closer to failure and in sets under ~12 reps (Halperin et al. 2022, *Sports Medicine* 52(2):377–390; Zourdos et al. 2021, *JSCR*).
→ Engine implications:
  - Treat logged RPE as ±1 rep uncertain.
  - Be more conservative interpreting RPE from sets >12 reps.
  - Periodically (every ~3–4 weeks, isolation or machine exercise, safe context) prescribe an AMRAP "calibration set" and compare predicted vs actual RIR; store a per-user calibration offset.

---

## 5. Autoregulation and progression

**PROG-1 (A).** Autoregulated load prescription (RPE/RIR- or velocity-based) is at least as good as fixed percentage-based training, and a 2025 network meta-analysis (J Exerc Sci Fit) ranked APRE, velocity-based and RPE-based methods above percentage-based training for 1RM gains. Systematic review/meta-analysis: Hickmott et al. 2022, *Sports Medicine – Open* (15 studies).
→ Default progression: RPE-autoregulated double progression.
  - If all prescribed sets hit the top of the rep range at or below target RPE → increase load next exposure.
  - If reps fall below the range at target RPE on two consecutive exposures → reduce load ~5–10%.
  - Within a session, if a set's RPE exceeds target by ≥1.5 → reduce load for remaining sets (size of reduction derived from e1RM, see PROG-3).

**PROG-2 (H).** Load increment caps (+2.5 kg barbell, +1–2 kg dumbbell, max +5% per exposure) are safety heuristics, not evidence-derived. Label them `// HEURISTIC` in code.

**PROG-3 (B).** e1RM estimation: classical equations (Epley, Brzycki, Lombardi, etc.) correlate highly with measured 1RM, but absolute accuracy degrades above ~10 reps and varies by exercise (LeSuer et al. 1997; Reynolds et al. 2006, JSCR 20(3):584–592 — 5RM data most accurate; deadlift often underestimated).
→ Only update e1RM from sets ≤10 reps, adjusted for RIR (reps + RIR = reps-to-failure). Use a rolling, outlier-robust estimate (e.g. best of recent sessions, smoothed). Store per-exercise, never transfer across exercises.

---

## 6. Rest intervals

**REST-1 (A).** Singer et al. 2024 (*Frontiers in Sports and Active Living*, Bayesian meta-analysis): small hypertrophy benefit for rest >60 s, with no appreciable additional difference beyond ~90 s; training to failure vs not didn't change this.
→ Default rest: ≥90 s for hypertrophy work; 2–3+ min for heavy compounds (to preserve volume load — rationale, grade B/C). Never default below 60 s except in explicit conditioning/time-saver modes, and tell the user the trade-off.

---

## 7. Recovery and fatigue model

**REC-1 (B/H).** The per-muscle fatigue model is a *heuristic* informed by evidence:
- Evidence (B): neuromuscular recovery after hard RT takes roughly 24–72 h and is slower after training to failure (Morán-Navarro et al. 2017).
- Heuristic (H): exponential decay with half-life ~24 h for small muscles and ~36 h for large muscles; set fatigue weight = fractional set × effort factor (RPE 10 → ×1.5, RPE ≤7 → ×0.7).
→ Must be labelled HEURISTIC. Use recovery % only to *rank and order* exercises and to soft-limit volume, never to hard-forbid training a muscle (PHIL-1). Calibrate decay per user from performance drops over time if data allow.

---

## 8. Readiness inputs (check-in, sleep, HRV)

**READY-1 (A).** Acute sleep loss (≤6 h) impairs exercise performance across categories, with the strongest effects from total deprivation or waking earlier than usual; performance falls ~0.4% per hour awake before exercise in those protocols (Craven et al. 2022, *Sports Medicine* 52(11):2669–2690). Effects on strength are real but modest.
→ Poor sleep: reduce session volume (~10–20%, H) or intensity targets slightly; do not cancel training. Prefer moving heavy/skill work to a better day if the user's schedule allows.

**READY-2 (A for endurance only; C for strength).** HRV-guided training has small benefits in *endurance* athletes (Granero-Gallegos et al. 2020 IJERPH; Düking et al. 2021 JSAMS; Manresa-Rocamora et al. 2021 IJERPH), mainly fewer non-responders and better submaximal adaptations. There is **no meta-analytic evidence for HRV-guided resistance training**.
→ HRV/resting HR are *soft modifiers only*: a deviation from the user's own rolling baseline (e.g. HRV below baseline − 1 SD for ≥2 days, H) lowers readiness modestly. Never let HRV alone override in-session performance data (RPE, reps achieved), which is the more direct signal (PROG-1). The AI must not claim HRV "proves" the user is under-recovered.

**READY-3 (B/C).** Subjective check-in (sleep quality, energy, soreness) is a legitimate readiness input and is what RPE-based autoregulation already captures in-session. Use the check-in to set the *starting* targets; let set-by-set RPE do the real adjustment.

---

## 9. Deloads

**DELOAD-1 (C).** International Delphi consensus (Bell et al. 2023, *Sports Medicine – Open* 9:87) defines a deload as a period of reduced training stress to reduce fatigue, promote recovery and prepare for subsequent training. Evidence on optimal design is thin.

**DELOAD-2 (B).** Coleman et al. 2024 (*PeerJ*): a full week of *no training* mid-block did not improve hypertrophy vs continuous training and appeared detrimental to strength.
→ Deloads = reduced volume (~30–50%, H) and/or effort (RPE ≤7), keeping movement practice — not complete cessation. Trigger reactively (sustained low readiness, stalled/declining e1RM across multiple lifts, user request) rather than on a rigid calendar; optionally suggest every ~4–8 weeks (C/H).

---

## 10. Rules for the AI layer

1. The AI may only recommend parameters inside the bounds defined by these rules; the engine validates.
2. Every generated session includes a short `rationale` citing rule IDs, e.g. "Rest 2 min (REST-1); kept your quads at 3 sets today because of last night's short sleep (READY-1)."
3. When a rule is graded **H**, the AI must say "rule of thumb" rather than "research shows".
4. When evidence is weak or mixed (READY-2, DELOAD-1, VOL-4), the AI must say so if the user asks why.
5. The AI must not cite studies not in this file. New sources are added here (with grade) by a human first.
6. Pain or injury reports override everything: remove loading of the affected area and recommend seeing a professional for persistent pain. No diagnosis.

---

## References

1. Currier BS, D'Souza AC, Fiatarone Singh MA, et al. (2026). American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. *Medicine & Science in Sports & Exercise*.
2. Currier BS, Mcleod JC, Banfield L, et al. (2023). Resistance training prescription for muscle strength and hypertrophy in healthy adults: a systematic review and Bayesian network meta-analysis. *Br J Sports Med* 57(18):1211–1220. doi:10.1136/bjsports-2023-106807
3. Pelland JC, et al. (2026). The resistance training dose response: meta-regressions exploring the effects of weekly volume and frequency on muscle hypertrophy and strength gains. *Sports Medicine*. (Preprint: SportRxiv 460)
4. Remmert JF, Pelland JC, Robinson ZP, Hinson SR, Zourdos MC. Is there too much of a good thing? Meta-regressions of the effect of per-session volume on hypertrophy and strength. SportRxiv preprint 537 — **not peer reviewed**.
5. Robinson ZP, Pelland JC, Remmert JF, Refalo MC, Jukic I, Steele J, Zourdos MC. (2024). Exploring the dose–response relationship between estimated resistance training proximity to failure, strength gain, and muscle hypertrophy: a series of meta-regressions. *Sports Medicine* 54(9):2209–2231.
6. Morán-Navarro R, Pérez CE, Mora-Rodríguez R, et al. (2017). Time course of recovery following resistance training leading or not to failure. *Eur J Appl Physiol* 117(12):2387–2399. doi:10.1007/s00421-017-3725-7
7. Zourdos MC, Klemp A, Dolan C, et al. (2016). Novel resistance training–specific rating of perceived exertion scale measuring repetitions in reserve. *J Strength Cond Res* 30(1):267–275. doi:10.1519/JSC.0000000000001049
8. Zourdos MC, Goldsmith JA, Helms ER, et al. (2021). Proximity to failure and total repetitions performed in a set influences accuracy of intraset repetitions in reserve-based rating of perceived exertion. *J Strength Cond Res* 35(2S):S158–S165.
9. Halperin I, Malleron T, Har-Nir I, et al. (2022). Accuracy in predicting repetitions to task failure in resistance exercise: a scoping review and exploratory meta-analysis. *Sports Medicine* 52(2):377–390.
10. Hickmott LM, Chilibeck PD, Shaw KA, Butcher SJ. (2022). The effect of load and volume autoregulation on muscular strength and hypertrophy: a systematic review and meta-analysis. *Sports Medicine – Open* 8:9. doi:10.1186/s40798-021-00404-9
11. Autoregulated resistance training for maximal strength enhancement: a systematic review and network meta-analysis (2025). *Journal of Exercise Science & Fitness*.
12. LeSuer DA, McCormick JH, Mayhew JL, Wasserstein RL, Arnold MD. (1997). The accuracy of prediction equations for estimating 1-RM performance in the bench press, squat, and deadlift. *J Strength Cond Res* 11(4):211–213.
13. Reynolds JM, Gordon TJ, Robergs RA. (2006). Prediction of one repetition maximum strength from multiple repetition maximum testing and anthropometry. *J Strength Cond Res* 20(3):584–592.
14. Singer A, Wolf M, Generoso L, et al. (2024). Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy. *Front Sports Act Living*. doi:10.3389/fspor.2024.1429789
15. Craven J, McCartney D, Desbrow B, et al. (2022). Effects of acute sleep loss on physical performance: a systematic and meta-analytical review. *Sports Medicine* 52(11):2669–2690.
16. Granero-Gallegos A, González-Quílez A, Plews D, Carrasco-Poyatos M. (2020). HRV-based training for improving VO2max in endurance athletes: a systematic review with meta-analysis. *Int J Environ Res Public Health* 17(21):7999.
17. Düking P, Zinner C, Trabelsi K, et al. (2021). Monitoring and adapting endurance training on the basis of heart rate variability monitored by wearable technologies: a systematic review with meta-analysis. *J Sci Med Sport* 24(11):1180–1192.
18. Manresa-Rocamora A, Sarabia JM, Javaloyes A, Flatt AA, Moya-Ramón M. (2021). Heart rate variability-guided training for enhancing cardiac-vagal modulation, aerobic fitness, and endurance performance: a methodological systematic review with meta-analysis. *Int J Environ Res Public Health* 18(19):10299.
19. Bell L, Strafford BW, Coleman M, Androulakis Korakakis P, Nolan D. (2023). Integrating deloading into strength and physique sports training programmes: an international Delphi consensus approach. *Sports Medicine – Open* 9:87.
20. Coleman M, Burke R, Augustin F, et al. (2024). The effects of a one-week deload period during supervised resistance training on muscular adaptations. *PeerJ* 12:e16777. doi:10.7717/peerj.16777
