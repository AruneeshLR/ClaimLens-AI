// Server-only helpers for the Lovable AI Gateway (OpenAI Responses API).
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, NoObjectGeneratedError, Output, jsonSchema, streamText, type ModelMessage } from "ai";

export const AI_MODEL = "openai/gpt-6-astra";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export class AiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function runIdFetch() {
  let runId: string | undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (runId && !headers.has(RUN_ID_HEADER)) headers.set(RUN_ID_HEADER, runId);
    const res = await fetch(input, { ...init, headers });
    runId ??= res.headers.get(RUN_ID_HEADER)?.trim() || undefined;
    return res;
  };
}

function mapError(e: unknown): AiError {
  const err = APICallError.isInstance(e) ? e : APICallError.isInstance((e as { cause?: unknown })?.cause) ? ((e as { cause: APICallError }).cause) : null;
  if (err) {
    const status = err.statusCode ?? 500;
    let safe = "";
    try {
      const body = JSON.parse(err.responseBody ?? "{}");
      safe = body?.error?.message ?? body?.message ?? "";
    } catch {
      /* ignore */
    }
    if (status === 402) return new AiError(safe || "AI credits are exhausted. Please top up to continue AI analysis.", 402);
    if (status === 429) return new AiError("The AI service is busy. Please try again in a minute.", 429);
    if (status === 403) return new AiError(safe || "AI access is currently blocked for this workspace.", 403);
    if (status === 400) return new AiError("The AI could not process this evidence (unsupported or oversized input).", 400);
    return new AiError("The AI service is temporarily unavailable. Please try again.", status);
  }
  if (NoObjectGeneratedError.isInstance(e)) return new AiError("The AI returned an incomplete answer. Please retry.", 502);
  if (e instanceof AiError) return e;
  return new AiError(e instanceof Error ? e.message : "AI analysis failed", 500);
}

export async function runStructured<T>(opts: {
  instructions: string;
  content: Extract<ModelMessage, { role: "user" }>["content"];
  schema: Record<string, unknown>;
  name: string;
  effort?: "low" | "medium";
}): Promise<T> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiError("AI is not configured on the server.", 401);
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch(),
  });
  let streamError: unknown = null;
  try {
    const result = streamText({
      model: provider.responses(AI_MODEL),
      instructions: opts.instructions,
      messages: [{ role: "user", content: opts.content }],
      output: Output.object({ schema: jsonSchema<T>(opts.schema), name: opts.name }),
      maxRetries: 2,
      onError: ({ error }) => {
        streamError = error;
      },
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: opts.effort ?? "medium",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const out = (await result.output) as T;
    if (!out) throw streamError ?? new AiError("Empty AI response", 502);
    return out;
  } catch (e) {
    throw mapError(streamError ?? e);
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------- Schemas (strict: every key required, nullable for optional) ----------

const str = { type: "string" };
const strArr = { type: "array", items: str };
const nullableStr = { type: ["string", "null"] };
const nullableNum = { type: ["number", "null"] };

export const qualitySchema = {
  type: "object",
  additionalProperties: false,
  required: ["vehicle_visible", "damage_identifiable", "image_clear", "lighting_ok", "visible_parts", "issues", "summary"],
  properties: {
    vehicle_visible: { type: "boolean" },
    damage_identifiable: { type: "boolean" },
    image_clear: { type: "boolean" },
    lighting_ok: { type: "boolean" },
    visible_parts: strArr,
    issues: strArr,
    summary: str,
  },
};

export const consistencySchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "observed_damage", "matches", "mismatches", "uncertain", "suggestion"],
  properties: {
    verdict: { type: "string", enum: ["consistent", "uncertain", "mismatch"] },
    observed_damage: str,
    matches: strArr,
    mismatches: strArr,
    uncertain: strArr,
    suggestion: str,
  },
};

const finding = {
  type: "object",
  additionalProperties: false,
  required: ["finding", "category", "sources", "confidence"],
  properties: {
    finding: str,
    category: {
      type: "string",
      enum: ["observed_fact", "claimant_statement", "ai_interpretation", "unverified_assumption", "missing_information"],
    },
    sources: strArr,
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
};
const findings = { type: "array", items: finding };

export const reportSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "claim_summary",
    "image_analysis",
    "damaged_components",
    "document_analysis",
    "policy_coverage",
    "consistency_findings",
    "inconsistencies",
    "anomalies",
    "alternative_explanations",
    "missing_evidence",
    "recommended_actions",
    "settlement",
    "overall_confidence",
    "uncertainty_explanation",
  ],
  properties: {
    claim_summary: str,
    image_analysis: findings,
    damaged_components: strArr,
    document_analysis: findings,
    policy_coverage: {
      type: "object",
      additionalProperties: false,
      required: ["coverage_conditions", "exclusions", "deductible", "policy_limit", "assessment", "sources"],
      properties: {
        coverage_conditions: strArr,
        exclusions: strArr,
        deductible: nullableStr,
        policy_limit: nullableStr,
        assessment: str,
        sources: strArr,
      },
    },
    consistency_findings: findings,
    inconsistencies: findings,
    anomalies: findings,
    alternative_explanations: strArr,
    missing_evidence: strArr,
    recommended_actions: strArr,
    settlement: {
      type: "object",
      additionalProperties: false,
      required: ["sufficient_information", "estimated_repair_cost", "deductible_amount", "provisional_settlement", "currency", "rationale"],
      properties: {
        sufficient_information: { type: "boolean" },
        estimated_repair_cost: nullableNum,
        deductible_amount: nullableNum,
        provisional_settlement: nullableNum,
        currency: nullableStr,
        rationale: str,
      },
    },
    overall_confidence: { type: "string", enum: ["low", "medium", "high"] },
    uncertainty_explanation: str,
  },
};

export type QualityAI = {
  vehicle_visible: boolean;
  damage_identifiable: boolean;
  image_clear: boolean;
  lighting_ok: boolean;
  visible_parts: string[];
  issues: string[];
  summary: string;
};
export type ConsistencyAI = {
  verdict: "consistent" | "uncertain" | "mismatch";
  observed_damage: string;
  matches: string[];
  mismatches: string[];
  uncertain: string[];
  suggestion: string;
};

export const ownerCheckSchema = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "rc_owner_name", "insurance_holder_name", "claimant_matches_rc_owner", "explanation", "suggestion"],
  properties: {
    verdict: { type: "string", enum: ["match", "mismatch", "unreadable"] },
    rc_owner_name: nullableStr,
    insurance_holder_name: nullableStr,
    claimant_matches_rc_owner: { type: "string", enum: ["yes", "no", "unclear"] },
    explanation: str,
    suggestion: str,
  },
};

export type OwnerCheckAI = {
  verdict: "match" | "mismatch" | "unreadable";
  rc_owner_name: string | null;
  insurance_holder_name: string | null;
  claimant_matches_rc_owner: "yes" | "no" | "unclear";
  explanation: string;
  suggestion: string;
};
