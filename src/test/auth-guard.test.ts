import { describe, it, expect, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import { clearVerifiedSession, isVerificationFresh, markSessionVerified } from "@/lib/auth-guard";

const user = { id: "u1" } as User;

describe("auth guard verification cache", () => {
  beforeEach(() => clearVerifiedSession());

  it("reuses a server check for the same token within 60 seconds", () => {
    const now = Date.now();
    markSessionVerified("tok-a", user);
    expect(isVerificationFresh("tok-a", now + 59_000)).toBe(true);
    expect(isVerificationFresh("tok-a", now + 61_000)).toBe(false);
  });

  it("never reuses a check for a different token or after sign-out", () => {
    markSessionVerified("tok-a", user);
    expect(isVerificationFresh("tok-b")).toBe(false);
    clearVerifiedSession();
    expect(isVerificationFresh("tok-a")).toBe(false);
  });
});
