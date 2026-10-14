import { describe, expect, it } from "vitest";
import { citation, explain, explainAll, TEMPLATES } from "./explain";

describe("explanations without the LLM (ALGORITHMS §16)", () => {
  it("fills templates with variables", () => {
    expect(explain({ rule: "REST-1", vars: { rest: 120 } })).toBe(
      "Rest 120s: longer than 60–90 s helps preserve your working sets.",
    );
    expect(explain({ rule: "VOL-1", vars: { muscle: "chest", done: 6, target: 12 } })).toBe(
      "chest is at 6/12 sets this week.",
    );
  });

  it('says "rule of thumb" for heuristic (H) rules', () => {
    expect(explain({ rule: "REC-1", vars: { muscle: "quads", recovery: 30 } })).toMatch(
      /\(rule of thumb\)$/,
    );
    expect(explain({ rule: "PROG-1", vars: { reps: 12, rpe: 8, load: 62.5 } })).not.toMatch(
      /rule of thumb/,
    );
  });

  it("cites rules from EVIDENCE.md only", () => {
    const known = /^(PHIL|LOAD|VOL|EFF|PROG|REST|REC|READY|DELOAD)-\d$|^EVIDENCE §10$/;
    for (const template of Object.values(TEMPLATES)) expect(template.cites).toMatch(known);
    expect(citation({ rule: "SWAP", vars: {} })).toBe("VOL-2");
  });

  it("deduplicates repeated explanations", () => {
    const e = { rule: "REST-1", vars: { rest: 90 } };
    expect(explainAll([e, e])).toHaveLength(1);
  });
});
