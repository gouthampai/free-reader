import { describe, expect, it } from "vitest";
import type { Annotation, Book } from "../lib/api";
import {
  bookmarkOnPage,
  colorFill,
  exportFileName,
  HIGHLIGHT_COLORS,
  isWithin,
  sortByPosition,
  toJson,
  toMarkdown,
} from "./annotations";

const book: Book = {
  id: 1,
  path: "/b/pride.epub",
  format: "epub",
  title: "Pride: and Prejudice?",
  authors: "Jane Austen",
  series: null,
  seriesIndex: null,
  language: "en",
  publisher: null,
  description: null,
  coverPath: null,
  managed: true,
  fileSize: null,
  addedAt: 0,
  lastOpenedAt: null,
  progress: null,
  collectionIds: [],
};

let id = 1;
const ann = (p: Partial<Annotation>): Annotation => ({
  id: id++,
  bookId: 1,
  kind: "highlight",
  cfi: "epubcfi(/6/4!/4/2/1:0)",
  text: null,
  note: null,
  color: "yellow",
  chapter: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...p,
});

// Sections /6/4 and /6/8; paragraphs /4/2 and /4/10.
const early = ann({ cfi: "epubcfi(/6/4!/4/2,/1:0,/1:10)", text: "It is a truth", chapter: "Chapter 1" });
const late = ann({
  cfi: "epubcfi(/6/8!/4/10,/1:5,/1:20)",
  text: "Line one\nLine two",
  note: "Nice",
  chapter: "Chapter 2",
});
const mark = ann({
  kind: "bookmark",
  cfi: "epubcfi(/6/8!/4/2/1:0)",
  text: "Page start",
  chapter: "Chapter 2",
  color: null,
});

describe("ordering and bookmarks", () => {
  it("sorts by position in the book, not creation time", () => {
    expect(sortByPosition([late, mark, early]).map((a) => a.id)).toEqual([early.id, mark.id, late.id]);
  });

  it("detects points inside a page range", () => {
    const page = "epubcfi(/6/8!/4,/2/1:0,/12/1:0)";
    expect(isWithin(mark.cfi, page)).toBe(true);
    expect(isWithin(early.cfi, page)).toBe(false);
    expect(isWithin("garbage", page)).toBe(false);
    expect(bookmarkOnPage([early, mark], page)?.id).toBe(mark.id);
    expect(bookmarkOnPage([early, mark], undefined)).toBeUndefined();
  });

  it("maps colors with a fallback", () => {
    expect(colorFill("blue")).toBe(HIGHLIGHT_COLORS.blue.fill);
    expect(colorFill("not-a-color")).toBe(HIGHLIGHT_COLORS.yellow.fill);
    expect(colorFill(null)).toBe(HIGHLIGHT_COLORS.yellow.fill);
  });
});

describe("export", () => {
  it("writes Markdown grouped by chapter with notes and bookmarks", () => {
    const md = toMarkdown(book, [late, mark, early], new Date("2026-10-19T12:00:00Z"));
    expect(md).toBe(
      [
        "# Pride: and Prejudice?",
        "",
        "*Jane Austen*",
        "",
        "2 highlights, 1 bookmark · exported 2026-10-19",
        "",
        "## Chapter 1",
        "",
        "> It is a truth",
        "",
        "## Chapter 2",
        "",
        "> Line one",
        "> Line two",
        "",
        "Nice",
        "",
        "## Bookmarks",
        "",
        "- **Chapter 2** — Page start",
        "",
      ].join("\n"),
    );
  });

  it("writes JSON in reading order with ISO dates", () => {
    const data = JSON.parse(toJson(book, [late, early]));
    expect(data.book.title).toBe("Pride: and Prejudice?");
    expect(data.annotations.map((a: { text: string }) => a.text)).toEqual(["It is a truth", "Line one\nLine two"]);
    expect(data.annotations[0].createdAt).toBe("2023-11-14T22:13:20.000Z");
    expect(data.annotations[0]).not.toHaveProperty("id");
  });

  it("makes file-system-safe names", () => {
    expect(exportFileName(book, "md")).toBe("Pride and Prejudice - notes.md");
  });
});
