import type { Database } from "@/integrations/supabase/types";

export type ClaimStatus = Database["public"]["Enums"]["claim_status"];
export type Claim = Database["public"]["Tables"]["claims"]["Row"];
export type Evidence = Database["public"]["Tables"]["evidence"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type AdminDecision = Database["public"]["Tables"]["admin_decisions"]["Row"];

export const STATUS_META: Record<
  ClaimStatus,
  { label: string; variant: "muted" | "info" | "warning" | "success" | "destructive" | "secondary"; step: number }
> = {
  draft: { label: "Draft", variant: "muted", step: 0 },
  submitted: { label: "Submitted", variant: "info", step: 1 },
  under_ai_analysis: { label: "Under AI Analysis", variant: "secondary", step: 2 },
  under_human_review: { label: "Under Human Review", variant: "warning", step: 3 },
  evidence_required: { label: "Additional Evidence Required", variant: "warning", step: 3 },
  approved: { label: "Approved", variant: "success", step: 4 },
  rejected: { label: "Rejected", variant: "destructive", step: 4 },
};

export const REQUIRED_ANGLES = ["front", "rear", "left", "right", "closeup"] as const;
export type Angle = (typeof REQUIRED_ANGLES)[number] | "opposite_vehicle" | "other";

export const ANGLE_LABEL: Record<Angle, string> = {
  front: "Vehicle front",
  rear: "Vehicle rear",
  left: "Left side",
  right: "Right side",
  closeup: "Damage close-up",
  opposite_vehicle: "Other vehicle damage",
  other: "Extra photo",
};

export const ACCIDENT_TYPES = [
  "Collision with vehicle",
  "Collision with object",
  "Rear-end collision",
  "Side impact",
  "Parking damage",
  "Hit and run",
  "Vandalism",
  "Weather / natural event",
  "Theft attempt",
  "Other",
];

export const DOC_KINDS = {
  policy_document: "Insurance policy",
  rc_book: "Owner RC book",
  driving_license: "Driving licence",
  claim_form: "Claim form",
  pan_card: "PAN card",
  aadhaar_card: "Aadhaar card",
  fir_document: "CSR / FIR copy",
  repair_estimate: "Repair estimate / invoice",
  supporting_document: "Supporting document",
} as const;
export type DocKind = keyof typeof DOC_KINDS;

/** Documents that must be uploaded before a claim can be submitted. */
export const REQUIRED_DOC_KINDS = ["policy_document", "rc_book", "driving_license", "claim_form", "pan_card", "aadhaar_card"] as const satisfies readonly DocKind[];
export const OPTIONAL_DOC_KINDS = ["fir_document", "repair_estimate", "supporting_document"] as const satisfies readonly DocKind[];

export const DOC_HINTS: Partial<Record<DocKind, string>> = {
  rc_book: "Registration certificate showing the owner's name. Front and back if needed.",
  policy_document: "Policy schedule showing the insured person's name.",
  aadhaar_card: "Use a masked Aadhaar (only last 4 digits visible) where possible.",
  fir_document: "Optional · police CSR or FIR copy, if one was filed.",
};

export type OwnerCheckStatus = "pending" | "match" | "mismatch" | "unreadable";

/** Which required documents are still missing, and whether the documents step is complete. */
export function documentRequirements(evidence: Pick<Evidence, "kind">[], ownerCheckStatus: string) {
  const missing = REQUIRED_DOC_KINDS.filter((k) => !evidence.some((e) => e.kind === k));
  const ownerChecked = ownerCheckStatus !== "pending";
  return { missing, ownerChecked, complete: missing.length === 0 && ownerChecked };
}

export const ALLOWED_DOC_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const BUCKET = "claim-files";

export function formatMoney(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(
    Number(v),
  );
}

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return msg.replace(/^Unauthorized:.*$/i, "Your session has expired. Please sign in again.");
}
