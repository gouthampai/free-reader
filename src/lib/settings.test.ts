import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, LIMITS, sanitizeSettings, stepFontSize } from "./settings";

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

  it("steps the font size within limits", () => {
    expect(stepFontSize(DEFAULT_SETTINGS, 2).fontSize).toBe(DEFAULT_SETTINGS.fontSize + 2);
    expect(stepFontSize({ ...DEFAULT_SETTINGS, fontSize: LIMITS.fontSize.max }, 1).fontSize).toBe(LIMITS.fontSize.max);
    expect(stepFontSize({ ...DEFAULT_SETTINGS, fontSize: LIMITS.fontSize.min }, -1).fontSize).toBe(LIMITS.fontSize.min);
  });

  it("validates read-aloud settings", () => {
    expect(sanitizeSettings({ speechRate: 9, speechVoice: "com.apple.voice.Samantha" })).toMatchObject({
      speechRate: LIMITS.speechRate.max,
      speechVoice: "com.apple.voice.Samantha",
    });
    expect(sanitizeSettings({ speechVoice: 42 }).speechVoice).toBeNull();
    expect(sanitizeSettings({ speechVoice: "" }).speechVoice).toBeNull();
  });

  it("rejects non-finite numbers", () => {
    expect(sanitizeSettings({ fontSize: Number.NaN }).fontSize).toBe(DEFAULT_SETTINGS.fontSize);
  });
});
