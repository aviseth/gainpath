import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "./auth";

describe("friendlyAuthError", () => {
  it("explains invite-only when Supabase refuses to create an account", () => {
    expect(friendlyAuthError("Signups not allowed for otp")).toMatch(/invite-only/);
  });

  it("rewords a wrong password without saying which half was wrong", () => {
    expect(friendlyAuthError("Invalid login credentials")).toMatch(
      /email and password don't match/,
    );
  });

  it("passes other errors through", () => {
    expect(friendlyAuthError("Email rate limit exceeded")).toBe("Email rate limit exceeded");
  });
});
