import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(72, "At most 72 characters")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number");

export const registerSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.string().trim().email("Enter a valid email").max(255),
  phone: phoneSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(1, "Enter your password").max(72),
});

export const claimDetailsSchema = z.object({
  claimant_name: z.string().trim().min(2, "Enter the claimant name").max(120),
  policy_number: z.string().trim().min(3, "Enter the policy number").max(60).regex(/^[A-Za-z0-9\-\/ ]+$/, "Letters, numbers, - and / only"),
  insurance_claim_number: z.string().trim().min(3, "Enter the claim number from your insurer").max(60).regex(/^[A-Za-z0-9\-\/ ]*$/, "Letters, numbers, - and / only"),
  vehicle_registration: z.string().trim().min(2, "Enter the registration number").max(30).regex(/^[A-Za-z0-9\- ]+$/, "Letters, numbers and - only"),
  accident_at: z
    .string()
    .min(1, "Enter the accident date and time")
    .refine((v) => !Number.isNaN(Date.parse(v)) && Date.parse(v) <= Date.now() + 60_000, "Date cannot be in the future"),
  accident_location: z.string().trim().min(2, "Enter the location").max(300),
  accident_type: z.string().min(2, "Choose the accident type").max(60),
  accident_description: z.string().trim().min(10, "Describe what happened (at least 10 characters)").max(4000),
  damage_description: z.string().trim().min(5, "Describe the damage").max(4000),
  claimed_amount: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= 1e11), "Enter a valid amount"),
});

/** Only allow same-origin relative redirects. */
export function safeRedirect(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  try {
    const url = new URL(value, "http://x");
    if (url.origin !== "http://x" && typeof window !== "undefined" && url.origin !== window.location.origin) return fallback;
    const path = url.pathname + url.search;
    if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/auth") || path.startsWith("/admin-login")) return fallback;
    return path;
  } catch {
    return fallback;
  }
}
