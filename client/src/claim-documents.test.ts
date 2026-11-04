import { describe, expect, it } from "vitest";
import { documentRequirements, REQUIRED_DOC_KINDS } from "@/lib/claims";

const all = REQUIRED_DOC_KINDS.map((kind) => ({ kind }));

describe("claim document requirements", () => {
  it("requires RC book, insurance, licence, claim form, PAN and Aadhaar", () => {
    expect([...REQUIRED_DOC_KINDS].sort()).toEqual(
      ["aadhaar_card", "claim_form", "driving_license", "pan_card", "policy_document", "rc_book"].sort(),
    );
  });

  it("treats the CSR / FIR copy as optional", () => {
    expect(documentRequirements(all, "match").complete).toBe(true);
    expect(REQUIRED_DOC_KINDS).not.toContain("fir_document");
  });

  it("blocks when a required document such as PAN is missing", () => {
    const res = documentRequirements(all.filter((d) => d.kind !== "pan_card"), "match");
    expect(res.complete).toBe(false);
    expect(res.missing).toEqual(["pan_card"]);
  });

  it("blocks until the RC vs insurance owner name check has run", () => {
    expect(documentRequirements(all, "pending").complete).toBe(false);
  });

  it("lets a name mismatch through to the human investigator instead of blocking", () => {
    expect(documentRequirements(all, "mismatch").complete).toBe(true);
  });
});
