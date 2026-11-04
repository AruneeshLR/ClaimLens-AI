import { describe, it, expect, beforeEach, vi } from "vitest";
import { isChunkLoadError, reloadOnceForChunkError } from "@/lib/chunk-reload";

describe("chunk reload", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("recognises stale page-file errors", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/a.tsx"))).toBe(true);
    expect(isChunkLoadError(new Error("Network down"))).toBe(false);
  });

  it("reloads only once within the guard window", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, configurable: true });
    const err = new TypeError("Failed to fetch dynamically imported module");
    expect(reloadOnceForChunkError(err)).toBe(true);
    expect(reloadOnceForChunkError(err)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
