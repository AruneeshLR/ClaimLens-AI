// When the app is rebuilt or redeployed while a tab is open, the browser may
// still reference old page files that no longer exist. A single fresh reload
// fixes it; the timestamp guard prevents reload loops if the error persists.

const KEY = "chunk-reload-at";
const WINDOW_MS = 10_000;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
    message,
  );
}

/** Reloads the page once per short window. Returns true if a reload was triggered. */
export function reloadOnceForChunkError(error: unknown): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(error)) return false;
  try {
    const last = Number(window.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < WINDOW_MS) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // sessionStorage unavailable — still try one reload
  }
  window.location.reload();
  return true;
}
