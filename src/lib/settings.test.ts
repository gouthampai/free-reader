import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, LIMITS, sanitizeSettings } from "./settings";

describe("sanitizeSettings", () => {
  it("returns defaults for missing or malformed input", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("nope")).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ theme: "neon", fontSize: "big", justify: 1 })).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values and clamps numbers into range", () => {
    const s = sanitizeSettings({ theme: "dark", flow: "scrolled", fontSize: 999, lineHeight: 0, margin: 8 });
    expect(s.theme).toBe("dark");
    expect(s.flow).toBe("scrolled");
    expect(s.fontSize).toBe(LIMITS.fontSize.max);
    expect(s.lineHeight).toBe(LIMITS.lineHeight.min);
    expect(s.margin).toBe(8);
  });

  it("rejects non-finite numbers", () => {
    expect(sanitizeSettings({ fontSize: Number.NaN }).fontSize).toBe(DEFAULT_SETTINGS.fontSize);
  });
});
