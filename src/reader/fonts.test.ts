import { describe, expect, it } from "vitest";
import { BUNDLED_FACES, fontFaceCss } from "./fonts";

describe("fontFaceCss", () => {
  it("makes URLs absolute so blob: book documents can load them", () => {
    const css = fontFaceCss(
      [{ family: "OpenDyslexic", weight: 700, style: "italic", url: "/assets/od-700i.woff2" }],
      "tauri://localhost/index.html",
    );
    expect(css).toBe(
      '@font-face { font-family: "OpenDyslexic"; font-weight: 700; font-style: italic; font-display: swap; src: url("tauri://localhost/assets/od-700i.woff2") format("woff2"); }',
    );
  });

  it("bundles regular, bold and italic faces for both fonts", () => {
    expect(BUNDLED_FACES).toHaveLength(8);
    expect(new Set(BUNDLED_FACES.map((f) => f.family))).toEqual(new Set(["Atkinson Hyperlegible", "OpenDyslexic"]));
    expect(BUNDLED_FACES.every((f) => f.url.includes(".woff2"))).toBe(true);
  });
});
