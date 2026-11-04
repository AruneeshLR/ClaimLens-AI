import type { ImageMetrics } from "./image-metrics";

export type QualityIssue = { code: string; message: string; severity: "retake" | "fail" };

/** Deterministic pixel-level rules for Step 1. Pure so it can be unit tested. */
export function evaluatePixelQuality(m: ImageMetrics): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (Math.min(m.width, m.height) < 480)
    issues.push({ code: "low_resolution", message: "Resolution is too low — move closer or use the rear camera.", severity: "retake" });
  if (m.brightness < 45 || m.clippedDark > 0.45)
    issues.push({ code: "too_dark", message: "The photo is too dark — add light or use the flash.", severity: "retake" });
  if (m.brightness > 235 || m.clippedBright > 0.45)
    issues.push({ code: "overexposed", message: "The photo is overexposed — avoid pointing at strong light.", severity: "retake" });
  if (m.contrast < 14)
    issues.push({ code: "low_visibility", message: "Very low contrast — the subject is hard to make out.", severity: "retake" });
  if (m.sharpness < 40)
    issues.push({ code: "blurry", message: "The photo is blurry — hold steady and tap to focus.", severity: "retake" });
  return issues;
}

/** Minimal binary sanity check: JPEG/PNG/WEBP signature and a plausible size. */
export function checkImageBytes(bytes: Uint8Array, mime: string): QualityIssue | null {
  if (bytes.length < 8 * 1024)
    return { code: "incomplete", message: "The image file looks incomplete or corrupted.", severity: "fail" };
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  const ok = (mime === "image/jpeg" && jpeg) || (mime === "image/png" && png) || (mime === "image/webp" && webp);
  if (!ok) return { code: "corrupted", message: "The file is not a valid image (corrupted or wrong type).", severity: "fail" };
  if (mime === "image/jpeg") {
    const endsOk = bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
    if (!endsOk) return { code: "truncated", message: "The image appears truncated — please retake it.", severity: "fail" };
  }
  return null;
}

export function isPdf(bytes: Uint8Array) {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}
