// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { DONE, MAX_ATTEMPTS, metadataFromFoliate, plainText, recordDone, recordStart, shouldAttempt } from "./enrich";

describe("metadataFromFoliate", () => {
  it("maps MOBI/FB2-style metadata", () => {
    expect(
      metadataFromFoliate({
        title: "  Dune ",
        author: ["Frank Herbert", { name: "Brian Herbert" }],
        language: ["en"],
        publisher: "Chilton",
        description: "<p>Desert <b>planet</b>.</p><p>Spice.</p>",
        belongsTo: { series: { name: "Dune Chronicles", position: "1" } },
      }),
    ).toEqual({
      title: "Dune",
      authors: "Frank Herbert & Brian Herbert",
      language: "en",
      publisher: "Chilton",
      description: "Desert planet.\n\nSpice.",
      series: "Dune Chronicles",
      seriesIndex: 1,
    });
  });

  it("returns nulls for missing fields", () => {
    expect(metadataFromFoliate({})).toEqual({
      title: null,
      authors: null,
      language: null,
      publisher: null,
      description: null,
      series: null,
      seriesIndex: null,
    });
    expect(metadataFromFoliate(undefined)).toEqual({});
  });

  it("handles language-map titles and series arrays", () => {
    const m = metadataFromFoliate({
      title: { fr: "Les Misérables" },
      belongsTo: { series: [{ name: "S", position: "x" }] },
    });
    expect(m.title).toBe("Les Misérables");
    expect(m.series).toBe("S");
    expect(m.seriesIndex).toBeNull();
  });
});

describe("plainText", () => {
  it("strips tags and keeps paragraphs", () => {
    expect(plainText("<div>One<br/>Two</div>  <p>  Three   four </p>")).toBe("One\n\nTwo\n\nThree four");
  });
});

describe("enrichment attempts", () => {
  it("retries failures up to the limit but never re-parses a finished book", () => {
    let a = {};
    expect(shouldAttempt(a, 7)).toBe(true);
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) a = recordStart(a, 7);
    expect(shouldAttempt(a, 7)).toBe(true);
    a = recordStart(a, 7);
    expect(shouldAttempt(a, 7)).toBe(false);

    a = recordDone(recordStart(a, 8), 8);
    expect(a).toMatchObject({ 8: DONE });
    expect(shouldAttempt(a, 8)).toBe(false);
    expect(shouldAttempt(a, 9)).toBe(true);
  });
});
