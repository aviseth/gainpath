import { afterEach, describe, expect, it, vi } from "vitest";
import { aiIncluded } from "./ai";

describe("aiIncluded", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets every signed-in user use AI when plans are off (self-hosting)", () => {
    expect(aiIncluded({ app_metadata: {} })).toBe(true);
  });

  it("requires ai: true in app_metadata when AI_REQUIRES_PLAN is set", () => {
    vi.stubEnv("AI_REQUIRES_PLAN", "true");
    expect(aiIncluded({ app_metadata: { ai: true } })).toBe(true);
    expect(aiIncluded({ app_metadata: { ai: false } })).toBe(false);
    expect(aiIncluded({ app_metadata: {} })).toBe(false);
    expect(aiIncluded({})).toBe(false);
  });

  it("doesn't accept a truthy non-boolean", () => {
    vi.stubEnv("AI_REQUIRES_PLAN", "true");
    expect(aiIncluded({ app_metadata: { ai: "yes" } })).toBe(false);
  });
});
