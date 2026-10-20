/** Pure helpers for highlights, notes and bookmarks: colors, ordering, export. */
import { collapse, compare } from "foliate-js/epubcfi.js";
import type { Annotation, Book } from "../lib/api";
import { displayAuthors, displayTitle } from "../lib/library";

export const HIGHLIGHT_COLORS = {
  yellow: { label: "Yellow", fill: "#f7d23e" },
  green: { label: "Green", fill: "#7ed36b" },
  blue: { label: "Blue", fill: "#6fb3f2" },
  pink: { label: "Pink", fill: "#f28bb3" },
  purple: { label: "Purple", fill: "#b994f0" },
} as const;

export type HighlightColor = keyof typeof HIGHLIGHT_COLORS;
export const DEFAULT_COLOR: HighlightColor = "yellow";

export const colorFill = (c: string | null | undefined) =>
  HIGHLIGHT_COLORS[(c ?? DEFAULT_COLOR) as HighlightColor]?.fill ?? HIGHLIGHT_COLORS[DEFAULT_COLOR].fill;

/** Safe CFI comparison: annotations with unparseable CFIs sort last instead of throwing. */
function safeCompare(a: string, b: string): number {
  try {
    return compare(a, b);
  } catch {
    return 0;
  }
}

/** Orders annotations by where they appear in the book. */
export function sortByPosition(list: Annotation[]): Annotation[] {
  return [...list].sort((a, b) => safeCompare(a.cfi, b.cfi) || a.createdAt - b.createdAt);
}

/** True if `point` falls inside the visible page described by the range CFI `page`. */
export function isWithin(point: string, page: string): boolean {
  try {
    const p = collapse(point);
    return compare(p, collapse(page)) >= 0 && compare(p, collapse(page, true)) <= 0;
  } catch {
    return false;
  }
}

/** The bookmark that sits on the currently visible page, if any. */
export const bookmarkOnPage = (list: Annotation[], pageCfi: string | undefined) =>
  pageCfi ? list.find((a) => a.kind === "bookmark" && isWithin(a.cfi, pageCfi)) : undefined;

const quote = (text: string) =>
  text
    .split(/\n+/)
    .map((l) => `> ${l}`)
    .join("\n");

export function toMarkdown(book: Book, annotations: Annotation[], now = new Date()): string {
  const lines: string[] = [`# ${displayTitle(book)}`, "", `*${displayAuthors(book)}*`, ""];
  const sorted = sortByPosition(annotations);
  const highlights = sorted.filter((a) => a.kind === "highlight");
  const bookmarks = sorted.filter((a) => a.kind === "bookmark");
  lines.push(
    `${highlights.length} highlight${highlights.length === 1 ? "" : "s"}, ` +
      `${bookmarks.length} bookmark${bookmarks.length === 1 ? "" : "s"} · exported ${now.toISOString().slice(0, 10)}`,
    "",
  );

  let chapter: string | null | undefined;
  for (const a of highlights) {
    if (a.chapter !== chapter) {
      chapter = a.chapter;
      if (chapter) lines.push(`## ${chapter}`, "");
    }
    lines.push(quote(a.text ?? ""), "");
    if (a.note) lines.push(a.note, "");
  }

  if (bookmarks.length) {
    lines.push("## Bookmarks", "");
    for (const b of bookmarks) {
      const where = b.chapter ? `**${b.chapter}**` : "Bookmark";
      lines.push(`- ${where}${b.text ? ` — ${b.text}` : ""}${b.note ? ` (${b.note})` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function toJson(book: Book, annotations: Annotation[]): string {
  return JSON.stringify(
    {
      book: {
        title: displayTitle(book),
        authors: book.authors,
        series: book.series,
        seriesIndex: book.seriesIndex,
        language: book.language,
      },
      annotations: sortByPosition(annotations).map(
        ({ kind, cfi, text, note, color, chapter, createdAt, updatedAt }) => ({
          kind,
          cfi,
          text,
          note,
          color,
          chapter,
          createdAt: new Date(createdAt).toISOString(),
          updatedAt: new Date(updatedAt).toISOString(),
        }),
      ),
    },
    null,
    2,
  );
}

/** File name for exports: "Pride and Prejudice - notes.md". */
export function exportFileName(book: Book, ext: "md" | "json"): string {
  const safe = displayTitle(book)
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${safe || "Book"} - notes.${ext}`;
}
