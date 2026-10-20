import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/settings";
import { buildReaderCss, FONT_STACKS, THEME_COLORS } from "./readerCss";

describe("buildReaderCss", () => {
  it("applies theme colors and font size", () => {
    const css = buildReaderCss({ ...DEFAULT_SETTINGS, theme: "sepia", fontSize: 21 });
    expect(css).toContain(`background: ${THEME_COLORS.sepia.bg} !important`);
    expect(css).toContain("font-size: 21px !important");
    expect(css).toContain("color-scheme: light");
  });

  it("leaves publisher fonts alone unless overridden", () => {
    expect(buildReaderCss(DEFAULT_SETTINGS)).not.toContain(FONT_STACKS.serif);
    expect(buildReaderCss({ ...DEFAULT_SETTINGS, font: "serif" })).toContain(FONT_STACKS.serif);
  });

  it("respects justify and hyphenation toggles", () => {
    const css = buildReaderCss({ ...DEFAULT_SETTINGS, justify: false, hyphenate: false });
    expect(css).toContain("text-align: start");
    expect(css).toContain("hyphens: manual");
  });

  it("uses a dark color scheme for the dark theme", () => {
    expect(buildReaderCss({ ...DEFAULT_SETTINGS, theme: "dark" })).toContain("color-scheme: dark");
  });
});
