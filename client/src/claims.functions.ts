import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "claim-files";

const metricsSchema = z.object({
  width: z.number().int().min(1).max(20000),
  height: z.number().int().min(1).max(20000),
  brightness: z.number().min(0).max(255),
  contrast: z.number().min(0).max(255),
  sharpness: z.number().min(0).max(1e8),
  clippedDark: z.number().min(0).max(1),
  clippedBright: z.number().min(0).max(1),
});

type AdminClient = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** Per-user sliding-window limit on AI calls, recorded in the audit log. */
async function enforceRateLimit(
  admin: AdminClient,
  userId: string,
  action: string,
  max: number,
  windowMinutes: number,
  claimId: string | null,
) {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { count, error } = await admin
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", userId)
    .eq("action", action)
    .gte("created_at", since);
  if (error) throw new Error("Could not verify usage limits");
  if ((count ?? 0) >= max) {
    throw new Error(`Too many AI requests. Please wait a few minutes and try again.`);
  }
  await admin.from("audit_logs").insert({ actor_id: userId, claim_id: claimId, action, details: {} });
}

// ---------------- Step 1: image quality verification ----------------
export const checkPhotoQuality = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ evidenceId: z.string().uuid(), metrics: metricsSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ev } = await supabase
      .from("evidence")
      .select("*")
      .eq("id", data.evidenceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ev || ev.kind !== "photo") throw new Error("Photo not found");
    const { data: editable } = await supabase.rpc("owns_editable_claim", { _claim_id: ev.claim_id });
    if (!editable) throw new Error("This claim can no longer be edited");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ai = await import("./ai.server");
    const rules = await import("./quality-rules");

    await enforceRateLimit(supabaseAdmin, userId, "ai_photo_quality", 60, 60, ev.claim_id);

    const { data: file, error: dlErr } = await supabase.storage.from(BUCKET).download(ev.storage_path);
    if (dlErr || !file) throw new Error("Could not read the uploaded photo");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha = await ai.sha256Hex(bytes);

    const byteIssue = rules.checkImageBytes(bytes, ev.mime_type);
    const pixelIssues = rules.evaluatePixelQuality(data.metrics);

    let aiResult: import("./ai.server").QualityAI | null = null;
    if (!byteIssue) {
      aiResult = await ai.runStructured<import("./ai.server").QualityAI>({
        name: "image_quality",
        effort: "low",
        instructions:
          "You are an insurance evidence intake assistant. Inspect ONE vehicle photograph for evidence quality only. " +
          "Judge: is the image sharp enough to read detail (image_clear), is lighting adequate (lighting_ok), is a motor vehicle clearly visible (vehicle_visible), " +
          "and is a damaged area identifiable when damage is expected (damage_identifiable). List visible vehicle parts. " +
          "Issues must be short, actionable instructions for the photographer. Never comment on fraud, liability or claim validity.",
        content: [
          {
            type: "text",
            text:
              `Requested shot: ${ev.angle === "opposite_vehicle" ? "damage on the OTHER (third-party) vehicle involved in the accident" : (ev.angle ?? "unspecified")}.\n` +
              `Claimant says the damaged part is: ${ev.damaged_part || "not specified"}.\n` +
              `Pixel metrics (0-255 scale): brightness ${data.metrics.brightness}, contrast ${data.metrics.contrast}, focus score ${data.metrics.sharpness}.`,
          },
          { type: "image", image: ai.toBase64(bytes), mediaType: ev.mime_type },
        ],
        schema: ai.qualitySchema,
      });
    }

    const damageExpected = ev.angle === "closeup" || ev.angle === "opposite_vehicle" || !!ev.damaged_part?.trim();
    const hardPixel = pixelIssues.filter((i) => i.code !== "blurry" && i.code !== "low_visibility");
    const softPixel = pixelIssues.filter((i) => i.code === "blurry" || i.code === "low_visibility");

    const checks = [
      { key: "integrity", label: "File integrity", passed: !byteIssue, detail: byteIssue?.message ?? "Valid, complete image file" },
      {
        key: "clarity",
        label: "Image clarity",
        passed: !!aiResult?.image_clear && !(softPixel.some((i) => i.code === "blurry") && !aiResult?.image_clear),
        detail: aiResult ? (aiResult.image_clear ? "Sharp enough to inspect" : "Too blurry to inspect detail") : "Not checked",
      },
      {
        key: "lighting",
        label: "Brightness & visibility",
        passed: !!aiResult?.lighting_ok && hardPixel.length === 0,
        detail: hardPixel[0]?.message ?? (aiResult?.lighting_ok ? "Lighting is adequate" : aiResult ? "Lighting is poor" : "Not checked"),
      },
      {
        key: "vehicle",
        label: "Vehicle visible",
        passed: !!aiResult?.vehicle_visible,
        detail: aiResult ? (aiResult.vehicle_visible ? "Vehicle clearly in frame" : "No vehicle detected in frame") : "Not checked",
      },
      {
        key: "damage",
        label: "Damaged area identifiable",
        passed: !damageExpected || !!aiResult?.damage_identifiable,
        detail: !damageExpected
          ? "No damage expected for this shot"
          : aiResult?.damage_identifiable
            ? "Damaged area can be identified"
            : "Damaged area is not identifiable",
      },
    ];

    let status: "verified" | "failed" | "retake_required";
    if (byteIssue || (aiResult && !aiResult.vehicle_visible)) status = "failed";
    else if (checks.some((c) => !c.passed)) status = "retake_required";
    else status = "verified";

    const issues = [
      ...(byteIssue ? [byteIssue.message] : []),
      ...pixelIssues.map((i) => i.message),
      ...(aiResult?.issues ?? []),
    ];

    const report = {
      checks,
      issues: Array.from(new Set(issues)).slice(0, 8),
      summary: aiResult?.summary ?? byteIssue?.message ?? "",
      visible_parts: aiResult?.visible_parts ?? [],
      metrics: data.metrics,
      checked_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabaseAdmin
      .from("evidence")
      .update({ quality_status: status, quality_report: report, sha256: sha, consistency_status: "pending", consistency_report: null })
      .eq("id", ev.id);
    if (upErr) throw new Error("Could not save the verification result");

    return { status, report };
  });

// ---------------- Step 2: description consistency ----------------
export const checkDescriptionConsistency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ evidenceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ev } = await supabase
      .from("evidence")
      .select("*")
      .eq("id", data.evidenceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ev || ev.kind !== "photo") throw new Error("Photo not found");
    if (ev.quality_status !== "verified") throw new Error("Complete the image quality check first");
    if (!ev.damage_description || ev.damage_description.trim().length < 3)
      throw new Error("Add a damage description for this photo first");
    const { data: editable } = await supabase.rpc("owns_editable_claim", { _claim_id: ev.claim_id });
    if (!editable) throw new Error("This claim can no longer be edited");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ai = await import("./ai.server");
    await enforceRateLimit(supabaseAdmin, userId, "ai_photo_consistency", 60, 60, ev.claim_id);

    const { data: file, error: dlErr } = await supabase.storage.from(BUCKET).download(ev.storage_path);
    if (dlErr || !file) throw new Error("Could not read the uploaded photo");
    const bytes = new Uint8Array(await file.arrayBuffer());

    const result = await ai.runStructured<import("./ai.server").ConsistencyAI>({
      name: "description_consistency",
      effort: "low",
      instructions:
        "You compare a claimant's written damage description with ONE vehicle photograph. " +
        "Report what is visibly observable, which statements the image supports (matches), which it contradicts (mismatches), " +
        "and which cannot be confirmed from this image (uncertain). verdict = consistent when the described damage is visible as described, " +
        "mismatch only when the image clearly contradicts the description (e.g. wrong part, no damage where damage is claimed), otherwise uncertain. " +
        "This is NOT a fraud assessment: never use words like fraud, fake, lie or dishonest. Suggestion: one friendly sentence on how the claimant could correct the description or retake the photo.",
      content: [
        {
          type: "text",
          text:
            `Shot: ${ev.angle === "opposite_vehicle" ? "the other (third-party) vehicle involved" : ev.angle}\nDamaged part (claimant): ${ev.damaged_part || "not specified"}\n` +
            `Damage description (claimant): ${ev.damage_description}\n` +
            `Additional explanation (claimant): ${ev.additional_explanation || "none"}`,
        },
        { type: "image", image: ai.toBase64(bytes), mediaType: ev.mime_type },
      ],
      schema: ai.consistencySchema,
    });

    const { error: upErr } = await supabaseAdmin
      .from("evidence")
      .update({ consistency_status: result.verdict, consistency_report: { ...result, checked_at: new Date().toISOString() } })
      .eq("id", ev.id);
    if (upErr) throw new Error("Could not save the verification result");
    return result;
  });

// ---------------- RC book vs insurance owner-name check ----------------
const OWNER_CHECK_MAX_BYTES = 20 * 1024 * 1024;

export const checkOwnerNames = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ claimId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: claim } = await supabase
      .from("claims")
      .select("id, user_id, claimant_name, vehicle_registration")
      .eq("id", data.claimId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!claim) throw new Error("Claim not found");
    const { data: editable } = await supabase.rpc("owns_editable_claim", { _claim_id: claim.id });
    if (!editable) throw new Error("This claim can no longer be edited");

    const { data: docs } = await supabase
      .from("evidence")
      .select("id, kind, storage_path, mime_type, file_name")
      .eq("claim_id", claim.id)
      .in("kind", ["rc_book", "policy_document"])
      .order("created_at");
    const rc = (docs ?? []).filter((d) => d.kind === "rc_book").slice(0, 3);
    const ins = (docs ?? []).filter((d) => d.kind === "policy_document").slice(0, 3);
    if (!rc.length) throw new Error("Upload your RC book first");
    if (!ins.length) throw new Error("Upload your insurance policy first");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ai = await import("./ai.server");
    const { isPdf } = await import("./quality-rules");
    await enforceRateLimit(supabaseAdmin, userId, "ai_owner_check", 20, 60, claim.id);

    const parts: Extract<import("ai").ModelMessage, { role: "user" }>["content"] = [
      {
        type: "text",
        text: `Claimant name entered in the app: ${claim.claimant_name}\nVehicle registration entered: ${claim.vehicle_registration}\nDOCUMENTS FOLLOW:`,
      },
    ];
    let total = 0;
    const add = async (list: typeof rc, prefix: string, title: string) => {
      let i = 0;
      for (const d of list) {
        const { data: file } = await supabase.storage.from(BUCKET).download(d.storage_path);
        if (!file) continue;
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (total + bytes.length > OWNER_CHECK_MAX_BYTES) continue;
        total += bytes.length;
        const label = `[${prefix}${++i}] ${title}`;
        if (d.mime_type === "application/pdf") {
          if (!isPdf(bytes)) continue;
          parts.push({ type: "text", text: label });
          parts.push({ type: "file", data: ai.toBase64(bytes), mediaType: "application/pdf", filename: d.file_name ?? `${prefix}${i}.pdf` });
        } else {
          parts.push({ type: "text", text: label });
          parts.push({ type: "image", image: ai.toBase64(bytes), mediaType: d.mime_type });
        }
      }
      return i;
    };
    const rcCount = await add(rc, "RC", "VEHICLE REGISTRATION CERTIFICATE (RC BOOK)");
    const insCount = await add(ins, "INS", "INSURANCE POLICY");
    if (!rcCount || !insCount) throw new Error("Could not read the uploaded RC book or insurance policy. Please re-upload them.");

    const result = await ai.runStructured<import("./ai.server").OwnerCheckAI>({
      name: "owner_name_check",
      effort: "low",
      instructions:
        "You verify Indian motor-insurance documents. Read the registered OWNER name on the RC book (registration certificate) [RC#] " +
        "and the INSURED / policy-holder name on the insurance policy [INS#]. Copy each name exactly as printed. " +
        "verdict = match when both refer to the same person: ignore letter case, spacing, punctuation, honorifics (Mr/Mrs/Shri/Smt), " +
        "relation suffixes (S/O, D/O, W/O and the father's/husband's name after them), and initials vs. expanded names when the rest is identical. " +
        "verdict = mismatch when the names clearly belong to different people or organisations. " +
        "verdict = unreadable when either name cannot be found or read. Also say whether the claimant name entered in the app matches the RC owner. " +
        "explanation: one or two plain sentences. suggestion: one friendly sentence on what the user can do (e.g. re-upload a clearer copy, or explain a recent ownership transfer or hypothecation). " +
        "Never accuse anyone of fraud.",
      content: parts,
      schema: ai.ownerCheckSchema,
    });

    const report = { ...result, checked_at: new Date().toISOString() };
    const { error: upErr } = await supabaseAdmin
      .from("claims")
      .update({ owner_check_status: result.verdict, owner_check_report: report as never })
      .eq("id", claim.id)
      .in("status", ["draft", "evidence_required"]);
    if (upErr) throw new Error("Could not save the owner name check");
    await supabaseAdmin
      .from("audit_logs")
      .insert({ actor_id: userId, claim_id: claim.id, action: "owner_name_checked", details: { verdict: result.verdict } });
    return report;
  });

// ---------------- AI multimodal investigation ----------------
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;

export const runInvestigation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ claimId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: claim } = await supabase.from("claims").select("*").eq("id", data.claimId).maybeSingle();
    if (!claim) throw new Error("Claim not found");
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const isOwner = claim.user_id === userId;
    if (!isAdmin && !isOwner) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ai = await import("./ai.server");
    const { isPdf } = await import("./quality-rules");

    // Atomic lock: only one analysis at a time, only from permitted states.
    const allowed: ("submitted" | "under_human_review")[] = isAdmin ? ["submitted", "under_human_review"] : ["submitted"];
    let { data: locked } = await supabaseAdmin
      .from("claims")
      .update({ status: "under_ai_analysis", ai_status: "running", ai_error: null })
      .eq("id", claim.id)
      .in("status", allowed)
      .neq("ai_status", "running")
      .select("id, status")
      .maybeSingle();
    // Admins may restart a run that has been stuck for over 10 minutes.
    if (!locked && isAdmin && claim.status === "under_ai_analysis") {
      const stale = new Date(Date.now() - 10 * 60_000).toISOString();
      ({ data: locked } = await supabaseAdmin
        .from("claims")
        .update({ ai_status: "running", ai_error: null })
        .eq("id", claim.id)
        .eq("status", "under_ai_analysis")
        .lt("updated_at", stale)
        .select("id, status")
        .maybeSingle());
    }
    if (!locked) return { ok: false as const, message: "Analysis is already running or not available for this claim." };

    try {
      await enforceRateLimit(supabaseAdmin, userId, "ai_investigation", 10, 60, claim.id);

      const { data: evidence } = await supabaseAdmin
        .from("evidence")
        .select("*")
        .eq("claim_id", claim.id)
        .order("created_at");
      const items = evidence ?? [];

      let total = 0;
      const photoLabels = new Map<string, string>();
      const docLabels = new Map<string, string>();
      let p = 0;
      let d = 0;
      const parts: Extract<import("ai").ModelMessage, { role: "user" }>["content"] = [];
      const skipped: string[] = [];
      const hashes: { id: string; label: string; sha: string }[] = [];
      const unsupported: string[] = [];

      for (const ev of items) {
        const label = ev.kind === "photo" ? `P${++p}` : `D${++d}`;
        (ev.kind === "photo" ? photoLabels : docLabels).set(ev.id, label);
        const { data: file } = await supabaseAdmin.storage.from(BUCKET).download(ev.storage_path);
        if (!file) {
          skipped.push(`${label} could not be read from storage`);
          continue;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const sha = ev.sha256 ?? (await ai.sha256Hex(bytes));
        if (!ev.sha256) await supabaseAdmin.from("evidence").update({ sha256: sha }).eq("id", ev.id);
        hashes.push({ id: ev.id, label, sha });

        if (total + bytes.length > MAX_TOTAL_BYTES) {
          skipped.push(`${label} (${ev.file_name ?? ev.kind}) not analysed: total evidence size limit reached`);
          continue;
        }
        const header =
          ev.kind === "photo"
            ? `[${label}] PHOTO — shot: ${ev.angle === "opposite_vehicle" ? "OTHER (third-party) vehicle damage" : ev.angle}; live camera: ${ev.captured_live ? "yes" : "no"}; ${ev.is_additional ? "ADDITIONAL evidence; " : ""}` +
              `claimant damaged part: ${ev.damaged_part || "n/a"}; claimant description: ${ev.damage_description || "n/a"}; ` +
              `incident date: ${ev.incident_date ?? "n/a"}; location: ${ev.incident_location || "n/a"}; extra: ${ev.additional_explanation || "n/a"}; ` +
              `intake quality check: ${ev.quality_status}; intake consistency check: ${ev.consistency_status}; captured at ${ev.created_at}`
            : `[${label}] DOCUMENT — type: ${ev.kind}; file: ${ev.file_name}; ${ev.is_additional ? "ADDITIONAL evidence; " : ""}uploaded ${ev.created_at}`;

        if (ev.mime_type === "application/pdf") {
          if (!isPdf(bytes)) {
            unsupported.push(`${label} claims to be a PDF but the file is not a valid PDF`);
            continue;
          }
          parts.push({ type: "text", text: header });
          parts.push({ type: "file", data: ai.toBase64(bytes), mediaType: "application/pdf", filename: ev.file_name ?? `${label}.pdf` });
        } else {
          parts.push({ type: "text", text: header });
          parts.push({ type: "image", image: ai.toBase64(bytes), mediaType: ev.mime_type });
        }
        total += bytes.length;
      }

      // Deterministic system checks
      const shaList = hashes.map((h) => h.sha);
      const withinDup: string[] = [];
      const seen = new Map<string, string>();
      for (const h of hashes) {
        const prev = seen.get(h.sha);
        if (prev) withinDup.push(`${h.label} is byte-identical to ${prev}`);
        else seen.set(h.sha, h.label);
      }
      const { data: crossDup } = shaList.length
        ? await supabaseAdmin
            .from("evidence")
            .select("sha256, kind, claim_id")
            .in("sha256", shaList)
            .neq("claim_id", claim.id)
            .limit(50)
        : { data: [] as { sha256: string | null; kind: string; claim_id: string }[] };
      const crossClaimIds = Array.from(new Set((crossDup ?? []).map((r) => r.claim_id)));
      const { data: crossClaims } = crossClaimIds.length
        ? await supabaseAdmin.from("claims").select("id, claim_number, user_id").in("id", crossClaimIds)
        : { data: [] as { id: string; claim_number: string; user_id: string }[] };
      const crossDuplicates = (crossDup ?? []).map((r) => {
        const c = crossClaims?.find((x) => x.id === r.claim_id);
        const mine = hashes.find((h) => h.sha === r.sha256);
        return `${mine?.label ?? "A file"} (${r.kind}) also appears in claim ${c?.claim_number ?? "unknown"}${c && c.user_id !== claim.user_id ? " filed by a different account" : ""}`;
      });

      const { data: history } = await supabaseAdmin
        .from("claims")
        .select("claim_number, status, accident_at, created_at, accident_type, claimed_amount, vehicle_registration")
        .eq("user_id", claim.user_id)
        .neq("id", claim.id)
        .neq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(15);
      const { count: sameVehicleOtherUsers } = await supabaseAdmin
        .from("claims")
        .select("id", { count: "exact", head: true })
        .ilike("vehicle_registration", claim.vehicle_registration)
        .neq("user_id", claim.user_id)
        .neq("status", "draft");

      const photos = items.filter((e) => e.kind === "photo");
      const docs = items.filter((e) => e.kind !== "photo");
      const missing: string[] = [];
      const requiredDocs: [string, string][] = [
        ["policy_document", "Insurance policy document"],
        ["rc_book", "Owner RC book"],
        ["driving_license", "Driving licence"],
        ["claim_form", "Claim form"],
        ["pan_card", "PAN card"],
        ["aadhaar_card", "Aadhaar card"],
      ];
      for (const [k, label] of requiredDocs) if (!docs.some((x) => x.kind === k)) missing.push(label);
      if (!docs.some((x) => x.kind === "repair_estimate")) missing.push("Repair estimate or invoice");
      for (const a of ["front", "rear", "left", "right", "closeup"])
        if (!photos.some((x) => x.angle === a)) missing.push(`Photo: ${a}`);

      const systemChecks = {
        duplicate_within_claim: withinDup,
        duplicate_across_claims: crossDuplicates,
        prior_claims_by_claimant: history ?? [],
        same_vehicle_claims_by_other_accounts: sameVehicleOtherUsers ?? 0,
        missing_items: missing,
        skipped_files: [...skipped, ...unsupported],
        photo_labels: Object.fromEntries(photoLabels),
        document_labels: Object.fromEntries(docLabels),
        evidence_count: { photos: photos.length, documents: docs.length },
        rc_vs_insurance_owner_check: { status: claim.owner_check_status, report: claim.owner_check_report },
        fir_or_csr_provided: docs.some((x) => x.kind === "fir_document"),
        other_vehicle_photo_provided: photos.some((x) => x.angle === "opposite_vehicle"),
      };

      const intro = {
        type: "text" as const,
        text:
          `CLAIM ${claim.claim_number}\n` +
          `Claimant: ${claim.claimant_name}\nPolicy number: ${claim.policy_number}\nInsurer claim number: ${claim.insurance_claim_number ?? "not provided"}\nVehicle registration: ${claim.vehicle_registration}\n` +
          `Accident date/time: ${claim.accident_at}\nLocation: ${claim.accident_location}\nType: ${claim.accident_type}\n` +
          `Claimed amount: ${claim.claimed_amount ?? "not stated"}\nSubmitted: ${claim.submitted_at}\n` +
          `[S1] Claimant accident statement: ${claim.accident_description}\n[S2] Claimant damage description: ${claim.damage_description}\n` +
          (claim.evidence_request ? `Investigator previously requested: ${claim.evidence_request}\n` : "") +
          `\n[SYS] Deterministic system checks (computed by the platform, treat as observed facts):\n${JSON.stringify(systemChecks, null, 1)}\n\nEVIDENCE FOLLOWS:`,
      };

      const report = await ai.runStructured<Record<string, unknown>>({
        name: "investigation_report",
        effort: "medium",
        instructions:
          "You are a meticulous motor-insurance claims investigation assistant supporting a HUMAN investigator who makes every decision. " +
          "Analyse every photograph [P#], document [D#] (policies, repair estimates, invoices), claimant statements [S#] and platform system checks [SYS]. " +
          "Tasks: (A) image analysis — visible damage, damaged components, condition, cross-photo comparison, image inconsistencies (lighting/weather/background/odometer/plates mismatches); " +
          "(B) document analysis — coverage conditions, exclusions, deductibles, policy limits, policy period; repair estimate line items, totals, dates; " +
          "(C) statement analysis — extract accident details; (D) consistency — description vs visible damage, photos vs estimate line items, claim date vs document dates, claimed cost vs coverage, submission vs policy conditions; " +
          "(E) anomalies — duplicates, repeated invoices, missing information, unusual patterns across prior claims. " +
          "RULES: An anomaly is an investigative signal, NOT proof of fraud — never conclude fraud, never recommend final approval or rejection. " +
          "Every finding must cite its supporting sources by label (e.g. 'P2', 'D1', 'S1', 'SYS'). Classify each finding's category precisely: observed_fact (directly visible/printed), " +
          "claimant_statement, ai_interpretation, unverified_assumption, or missing_information. Offer plausible innocent alternative explanations for inconsistencies. " +
          "Settlement: only compute a provisional figure if estimate and policy terms make it possible (estimate minus deductible, capped by limit); otherwise set sufficient_information=false and nulls. " +
          "Be specific and concise; keep each list to the most important items (max ~8).",
        content: [intro, ...parts],
        schema: ai.reportSchema,
      });

      const { error: insErr } = await supabaseAdmin.from("ai_reports").insert({
        claim_id: claim.id,
        report: report as never,
        system_checks: systemChecks as never,
        model: ai.AI_MODEL,
        triggered_by: userId,
      });
      if (insErr) throw new Error("Could not store the AI report");

      await supabaseAdmin
        .from("claims")
        .update({ status: "under_human_review", ai_status: "completed", ai_error: null })
        .eq("id", claim.id);
      await supabaseAdmin
        .from("audit_logs")
        .insert({ actor_id: userId, claim_id: claim.id, action: "ai_report_generated", details: { model: ai.AI_MODEL } });
      return { ok: true as const };
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI analysis failed";
      await supabaseAdmin
        .from("claims")
        .update({ status: "submitted", ai_status: "failed", ai_error: message.slice(0, 500) })
        .eq("id", claim.id);
      return { ok: false as const, message };
    }
  });
