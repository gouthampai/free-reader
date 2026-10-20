import { describe, expect, it } from "vitest";
import type { Book } from "./api";
import {
  authorSortKey,
  displayAuthors,
  displayTitle,
  filterBooks,
  groupByAuthor,
  groupBySeries,
  readingStatus,
  relativeTime,
  seriesLabel,
  snippetParts,
  sortBooks,
  splitAuthors,
} from "./library";

let nextId = 1;
function book(p: Partial<Book> = {}): Book {
  return {
    id: nextId++,
    path: "/books/untitled.epub",
    format: "epub",
    title: null,
    authors: null,
    series: null,
    seriesIndex: null,
    language: null,
    publisher: null,
    description: null,
    coverPath: null,
    managed: true,
    fileSize: null,
    addedAt: 0,
    lastOpenedAt: null,
    progress: null,
    collectionIds: [],
    missing: false,
    ...p,
  };
}

const titles = (bs: Book[]) => bs.map(displayTitle);

describe("display helpers", () => {
  it("falls back to the file name and unknown author", () => {
    const b = book({ path: "/x/my_book.mobi" });
    expect(displayTitle(b)).toBe("my book");
    expect(displayAuthors(b)).toBe("Unknown author");
  });

  it("splits and joins multiple authors", () => {
    expect(splitAuthors("A & B &  C ")).toEqual(["A", "B", "C"]);
    expect(displayAuthors(book({ authors: "A & B" }))).toBe("A, B");
  });

  it("labels series with integer or fractional index", () => {
    expect(seriesLabel(book({ series: "Dune", seriesIndex: 2 }))).toBe("Dune #2");
    expect(seriesLabel(book({ series: "Dune", seriesIndex: 1.5 }))).toBe("Dune #1.5");
    expect(seriesLabel(book({ series: "Dune" }))).toBe("Dune");
    expect(seriesLabel(book())).toBeNull();
  });

  it("derives reading status", () => {
    expect(readingStatus(book())).toBe("unread");
    expect(readingStatus(book({ lastOpenedAt: 5 }))).toBe("reading");
    expect(readingStatus(book({ progress: { cfi: "", fraction: 0.4 } }))).toBe("reading");
    expect(readingStatus(book({ progress: { cfi: "", fraction: 0.99 } }))).toBe("finished");
  });

  it("sorts authors by last name", () => {
    expect(authorSortKey("Mary Shelley")).toBe("Shelley, Mary");
    expect(authorSortKey("Shelley, Mary")).toBe("Shelley, Mary");
    expect(authorSortKey("Homer")).toBe("Homer");
  });
});

describe("sortBooks", () => {
  const a = book({ title: "The Zebra", authors: "Ann Young", addedAt: 3, lastOpenedAt: 10 });
  const b = book({ title: "Apple", authors: "Zed Adams", addedAt: 2, series: "S", seriesIndex: 2 });
  const c = book({
    title: "an Mango",
    authors: "Bea Adams",
    addedAt: 1,
    lastOpenedAt: 20,
    series: "S",
    seriesIndex: 1,
  });
  const all = [a, b, c];

  it("sorts by title ignoring leading articles", () => {
    expect(titles(sortBooks(all, "title"))).toEqual(["Apple", "an Mango", "The Zebra"]);
  });
  it("sorts by recently read, then added", () => {
    expect(titles(sortBooks(all, "recent"))).toEqual(["an Mango", "The Zebra", "Apple"]);
  });
  it("sorts by author last name", () => {
    expect(titles(sortBooks(all, "author"))).toEqual(["an Mango", "Apple", "The Zebra"]);
  });
  it("sorts series by index with non-series books last", () => {
    expect(titles(sortBooks(all, "series"))).toEqual(["an Mango", "Apple", "The Zebra"]);
  });
  it("does not mutate the input", () => {
    sortBooks(all, "title");
    expect(all).toEqual([a, b, c]);
  });
});

describe("filterBooks", () => {
  const a = book({ title: "Les Misérables", authors: "Victor Hugo", collectionIds: [1] });
  const b = book({ title: "Dune", authors: "Frank Herbert", series: "Dune", progress: { cfi: "", fraction: 1 } });
  const all = [a, b];

  it("matches all query terms, ignoring case and accents", () => {
    expect(titles(filterBooks(all, { query: "miserables hugo" }))).toEqual(["Les Misérables"]);
    expect(filterBooks(all, { query: "hugo dune" })).toEqual([]);
  });
  it("filters by status, collection, author and series", () => {
    expect(titles(filterBooks(all, { status: "finished" }))).toEqual(["Dune"]);
    expect(titles(filterBooks(all, { collectionId: 1 }))).toEqual(["Les Misérables"]);
    expect(titles(filterBooks(all, { author: "Frank Herbert" }))).toEqual(["Dune"]);
    expect(titles(filterBooks(all, { series: "Dune" }))).toEqual(["Dune"]);
    expect(filterBooks(all, { status: "all" })).toHaveLength(2);
  });
});

describe("grouping", () => {
  const books = [
    book({ authors: "Mary Shelley & Percy Shelley", series: "B", seriesIndex: 2 }),
    book({ authors: "Mary Shelley", series: "B", seriesIndex: 1, title: "First" }),
    book({ authors: "Jane Austen" }),
  ];
  it("groups by individual author, sorted by last name", () => {
    expect(groupByAuthor(books).map((g) => [g.name, g.count])).toEqual([
      ["Jane Austen", 1],
      ["Mary Shelley", 2],
      ["Percy Shelley", 1],
    ]);
  });
  it("groups by series using the first book as sample", () => {
    const [g] = groupBySeries(books);
    expect(g.name).toBe("B");
    expect(g.count).toBe(2);
    expect(g.sample.title).toBe("First");
  });
});

describe("relativeTime", () => {
  it("formats past times", () => {
    const now = 1_000_000_000_000;
    expect(relativeTime(null, now)).toBe("—");
    expect(relativeTime(now - 10_000, now)).toBe("just now");
    expect(relativeTime(now - 2 * 86_400_000, now)).toMatch(/2 days ago/);
  });
});

describe("snippetParts", () => {
  it("splits matches out of snippets", () => {
    expect(snippetParts("…a \u0002whale\u0003 of a \u0002whale\u0003…")).toEqual([
      { text: "…a ", match: false },
      { text: "whale", match: true },
      { text: " of a ", match: false },
      { text: "whale", match: true },
      { text: "…", match: false },
    ]);
    expect(snippetParts("no match")).toEqual([{ text: "no match", match: false }]);
    expect(snippetParts("\u0002start\u0003")).toEqual([{ text: "start", match: true }]);
  });
});
