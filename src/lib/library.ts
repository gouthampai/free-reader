/** Pure helpers for presenting, sorting and filtering the library. */
import type { Book } from "./api";
import { titleFromPath } from "../reader/metadata";

export type ReadingStatus = "unread" | "reading" | "finished";
export type SortKey = "recent" | "added" | "title" | "author" | "series" | "progress";
export type StatusFilter = "all" | ReadingStatus;

export const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently read",
  added: "Recently added",
  title: "Title",
  author: "Author",
  series: "Series",
  progress: "Progress",
};

/** Progress at or beyond this counts as finished (the last page rarely reports exactly 1). */
const FINISHED_AT = 0.98;

export const displayTitle = (b: Book) => b.title || titleFromPath(b.path);
export const displayAuthors = (b: Book) => splitAuthors(b.authors).join(", ") || "Unknown author";

export function splitAuthors(authors: string | null | undefined): string[] {
  return (authors ?? "")
    .split(" & ")
    .map((a) => a.trim())
    .filter(Boolean);
}

export function readingStatus(b: Book): ReadingStatus {
  const f = b.progress?.fraction ?? 0;
  if (f >= FINISHED_AT) return "finished";
  return f > 0 || b.lastOpenedAt ? "reading" : "unread";
}

export function seriesLabel(b: Book): string | null {
  if (!b.series) return null;
  return b.seriesIndex != null ? `${b.series} #${formatIndex(b.seriesIndex)}` : b.series;
}

const formatIndex = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** "The Hobbit" sorts under H. */
export const titleSortKey = (title: string) => title.replace(/^(the|a|an)\s+/i, "");

/** "Ursula K. Le Guin" -> "Le Guin, Ursula K." is hard; we use the last word, which is right for most names. */
export function authorSortKey(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2 || name.includes(",")) return name;
  const last = parts.pop()!;
  return `${last}, ${parts.join(" ")}`;
}

const firstAuthorKey = (b: Book) => {
  const first = splitAuthors(b.authors)[0];
  return first ? authorSortKey(first) : "￿"; // unknown authors last
};

const byTitle = (a: Book, b: Book) => collator.compare(titleSortKey(displayTitle(a)), titleSortKey(displayTitle(b)));

const bySeries = (a: Book, b: Book) => {
  if (!a.series !== !b.series) return a.series ? -1 : 1;
  return (
    collator.compare(a.series ?? "", b.series ?? "") ||
    (a.seriesIndex ?? Infinity) - (b.seriesIndex ?? Infinity) ||
    byTitle(a, b)
  );
};

export function sortBooks(books: Book[], key: SortKey): Book[] {
  const sorted = [...books];
  switch (key) {
    case "recent":
      return sorted.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.addedAt - a.addedAt);
    case "added":
      return sorted.sort((a, b) => b.addedAt - a.addedAt);
    case "title":
      return sorted.sort(byTitle);
    case "author":
      return sorted.sort((a, b) => collator.compare(firstAuthorKey(a), firstAuthorKey(b)) || bySeries(a, b));
    case "series":
      return sorted.sort(bySeries);
    case "progress":
      return sorted.sort((a, b) => (b.progress?.fraction ?? 0) - (a.progress?.fraction ?? 0) || byTitle(a, b));
  }
}

export interface BookFilter {
  query?: string;
  status?: StatusFilter;
  collectionId?: number;
  author?: string;
  series?: string;
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function filterBooks(books: Book[], f: BookFilter): Book[] {
  const terms = normalize(f.query ?? "")
    .split(/\s+/)
    .filter(Boolean);
  return books.filter((b) => {
    if (f.status && f.status !== "all" && readingStatus(b) !== f.status) return false;
    if (f.collectionId != null && !b.collectionIds.includes(f.collectionId)) return false;
    if (f.author != null && !splitAuthors(b.authors).includes(f.author)) return false;
    if (f.series != null && b.series !== f.series) return false;
    if (terms.length) {
      const haystack = normalize([displayTitle(b), b.authors, b.series, b.publisher].filter(Boolean).join(" "));
      if (!terms.every((t) => haystack.includes(t))) return false;
    }
    return true;
  });
}

export interface Group {
  name: string;
  count: number;
  /** A representative book (for a cover thumbnail). */
  sample: Book;
}

export function groupByAuthor(books: Book[]): Group[] {
  const map = new Map<string, Group>();
  for (const b of books)
    for (const a of splitAuthors(b.authors)) {
      const g = map.get(a);
      if (g) g.count++;
      else map.set(a, { name: a, count: 1, sample: b });
    }
  return [...map.values()].sort((a, b) => collator.compare(authorSortKey(a.name), authorSortKey(b.name)));
}

export function groupBySeries(books: Book[]): Group[] {
  const map = new Map<string, Group>();
  for (const b of sortBooks(books, "series")) {
    if (!b.series) continue;
    const g = map.get(b.series);
    if (g) g.count++;
    else map.set(b.series, { name: b.series, count: 1, sample: b });
  }
  return [...map.values()].sort((a, b) => collator.compare(a.name, b.name));
}

/** "2 days ago" style relative time for list views. */
export function relativeTime(ms: number | null, now = Date.now()): string {
  if (!ms) return "—";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const diff = (ms - now) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of units) if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  return "just now";
}
