import { describe, expect, it } from "vitest";
import { formatContributors, formatLanguageMap, titleFromPath } from "./metadata";

describe("metadata helpers", () => {
  it("formats language maps", () => {
    expect(formatLanguageMap("Dune")).toBe("Dune");
    expect(formatLanguageMap({ en: "Dune", fr: "Dune (fr)" })).toBe("Dune");
    expect(formatLanguageMap(undefined)).toBe("");
  });

  it("formats single and multiple contributors", () => {
    expect(formatContributors("Ursula K. Le Guin")).toBe("Ursula K. Le Guin");
    expect(formatContributors([{ name: "A" }, "B", { name: { en: "C" } }])).toBe("A, B, & C");
    expect(formatContributors(undefined)).toBe("");
  });

  it("derives a readable title from a file path", () => {
    expect(titleFromPath("/books/the_left-hand_of_darkness.epub")).toBe("the left hand of darkness");
    expect(titleFromPath("C:\\Books\\Dune.azw3")).toBe("Dune");
  });
});
