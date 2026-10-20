import { describe, expect, it } from "vitest";
import { defineUrl, isLookupWord, languageCode, placeFloating, wikipediaUrl } from "./lookup";

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

describe("lookup URLs", () => {
  it("normalizes language tags", () => {
    expect(languageCode("en-GB")).toBe("en");
    expect(languageCode("FR")).toBe("fr");
    expect(languageCode("x-klingon-weird")).toBe("en");
    expect(languageCode(null)).toBe("en");
  });

  it("uses the system dictionary on macOS and Wiktionary on Windows", () => {
    expect(defineUrl(" serendipity ", "en", false)).toBe("dict://serendipity");
    expect(defineUrl("café crème", "fr-FR", true)).toBe(
      "https://fr.wiktionary.org/wiki/Special:Search?search=caf%C3%A9%20cr%C3%A8me",
    );
  });

  it("searches Wikipedia in the book's language", () => {
    expect(wikipediaUrl("Napoléon\n Bonaparte", "fr")).toBe(
      "https://fr.wikipedia.org/wiki/Special:Search?search=Napol%C3%A9on%20Bonaparte",
    );
  });

  it("treats short selections as words", () => {
    expect(isLookupWord("ephemeral")).toBe(true);
    expect(isLookupWord("a whole long sentence here")).toBe(false);
  });
});

describe("placeFloating", () => {
  const viewport = { width: 1000, height: 800 };
  const size = { width: 200, height: 40 };

  it("centers above the anchor when there is room", () => {
    expect(placeFloating(rect(400, 300, 100, 20), size, viewport)).toEqual({ top: 252, left: 350, placement: "above" });
  });

  it("flips below near the top edge", () => {
    expect(placeFloating(rect(400, 20, 100, 20), size, viewport)).toEqual({ top: 48, left: 350, placement: "below" });
  });

  it("clamps to the viewport horizontally", () => {
    expect(placeFloating(rect(-50, 300, 40, 20), size, viewport).left).toBe(8);
    expect(placeFloating(rect(990, 300, 40, 20), size, viewport).left).toBe(792);
  });
});
