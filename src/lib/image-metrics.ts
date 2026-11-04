// Browser-only pixel analysis for the Step 1 image quality check.
export type ImageMetrics = {
  width: number;
  height: number;
  brightness: number; // 0..255 mean luminance
  contrast: number; // luminance std-dev
  sharpness: number; // variance of Laplacian
  clippedDark: number; // share of near-black pixels 0..1
  clippedBright: number; // share of near-white pixels 0..1
};

export async function analyzeImage(blob: Blob): Promise<ImageMetrics> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const lum = new Float32Array(w * h);
  let sum = 0;
  let dark = 0;
  let bright = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    lum[p] = l;
    sum += l;
    if (l < 12) dark++;
    if (l > 245) bright++;
  }
  const n = w * h;
  const mean = sum / n;
  let varSum = 0;
  for (let p = 0; p < n; p++) varSum += (lum[p] - mean) ** 2;
  // Laplacian variance (focus measure)
  let lapSum = 0;
  let lapSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = lum[i - w] + lum[i + w] + lum[i - 1] + lum[i + 1] - 4 * lum[i];
      lapSum += v;
      lapSq += v * v;
      count++;
    }
  }
  const lapMean = lapSum / Math.max(count, 1);
  const sharpness = lapSq / Math.max(count, 1) - lapMean * lapMean;
  const result = {
    width: bitmap.width,
    height: bitmap.height,
    brightness: Math.round(mean),
    contrast: Math.round(Math.sqrt(varSum / n)),
    sharpness: Math.round(sharpness),
    clippedDark: +(dark / n).toFixed(3),
    clippedBright: +(bright / n).toFixed(3),
  };
  bitmap.close();
  return result;
}

/** Resize + re-encode a captured frame to a JPEG suitable for upload. */
export async function canvasToJpeg(canvas: HTMLCanvasElement, maxSide = 1600, quality = 0.88): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  let source = canvas;
  if (scale < 1) {
    const c = document.createElement("canvas");
    c.width = Math.round(canvas.width * scale);
    c.height = Math.round(canvas.height * scale);
    c.getContext("2d")!.drawImage(canvas, 0, 0, c.width, c.height);
    source = c;
  }
  return new Promise((resolve, reject) =>
    source.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode photo"))), "image/jpeg", quality),
  );
}
