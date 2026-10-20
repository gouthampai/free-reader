/**
 * Fills in metadata and covers the Rust importer couldn't extract (MOBI, FB2, CBZ, odd EPUBs)
 * by parsing the book with foliate-js. Never overwrites existing values.
 */
import type { FoliateBook, FoliateMetadata } from "foliate-js/view.js";
import { api, type Book, type Metadata } from "../lib/api";
import { formatLanguageMap } from "./metadata";

type Contributor = string | { name?: string | Record<string, string> } | null | undefined;

const contributorNames = (c: unknown): string[] =>
  (Array.isArray(c) ? c : [c])
    .map((x: Contributor) => (typeof x === "string" ? x : formatLanguageMap(x?.name)))
    .map((s) => s.trim())
    .filter(Boolean);

/** Strips markup from descriptions, keeping paragraph breaks. */
export function plainText(html: string): string {
  const doc = new DOMParser().parseFromString(html.replace(/<\/(p|div)>|<br\s*\/?>/gi, "\n"), "text/html");
  return (doc.body.textContent ?? "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

export function metadataFromFoliate(m: FoliateMetadata | undefined): Partial<Metadata> {
  if (!m) return {};
  const series = [m.belongsTo?.series].flat()[0];
  const position = series?.position != null ? Number(series.position) : NaN;
  const out: Partial<Metadata> = {
    title: formatLanguageMap(m.title).trim() || null,
    authors: contributorNames(m.author).join(" & ") || null,
    language: [m.language].flat()[0] || null,
    publisher: contributorNames(m.publisher)[0] ?? null,
    description: m.description ? plainText(m.description) || null : null,
    series: formatLanguageMap(series?.name).trim() || null,
    seriesIndex: Number.isFinite(position) ? position : null,
  };
  return out;
}

/** Saves discovered metadata/cover for `book` where it has none. Returns true if anything was saved. */
export async function fillGaps(
  book: Book,
  metadata: Partial<Metadata>,
  getCover: () => Promise<Blob | null> | Blob | null | undefined,
): Promise<boolean> {
  let changed = false;
  if (!book.title || !book.authors) {
    await api.fillMissingMetadata(book.id, metadata);
    changed = true;
  }
  if (!book.coverPath) {
    const cover = await Promise.resolve()
      .then(getCover)
      .catch(() => null);
    if (cover && cover.size > 0) {
      await api.setCoverBytes(book.id, cover).catch((e) => console.warn("cover rejected", book.id, e));
      changed = true;
    }
  }
  return changed;
}

export const needsEnrichment = (b: Book) => !b.title || !b.coverPath;

/**
 * Per book: how many times parsing was started without completing, or DONE once a parse
 * completed (even if it found no cover). Counting starts *before* each attempt, so a book that
 * crashes or hangs the parser is also given up on after MAX_ATTEMPTS launches.
 */
export type Attempts = Record<number, number>;
export const DONE = -1;
export const MAX_ATTEMPTS = 3;

export const shouldAttempt = (a: Attempts, id: number) => a[id] !== DONE && (a[id] ?? 0) < MAX_ATTEMPTS;
export const recordStart = (a: Attempts, id: number): Attempts => ({ ...a, [id]: (a[id] ?? 0) + 1 });
export const recordDone = (a: Attempts, id: number): Attempts => ({ ...a, [id]: DONE });

// v1 stored a set of books tried once, including ones that failed only because the parser
// couldn't load; v2 lets those be retried.
const ATTEMPTS_KEY = "free-reader:enrich-attempts:v2";
const LEGACY_KEY = "free-reader:enrich-attempted:v1";

function loadAttempts(): Attempts {
  try {
    localStorage.removeItem(LEGACY_KEY);
    const raw = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function saveAttempts(a: Attempts) {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a));
  } catch {
    // Non-critical: we'd just retry next launch.
  }
}

/**
 * Enriches books one at a time in the background. A book that parses is never re-parsed (so
 * books that genuinely lack a cover aren't read on every launch); one that fails is retried on
 * later launches, up to MAX_ATTEMPTS times, so transient failures don't stick.
 */
export async function enrichLibrary(
  books: Book[],
  onChanged: () => void,
  signal: AbortSignal,
  /** While true (a book is open in the reader), wait. Parsing PDFs concurrently can stall pdf.js. */
  isPaused: () => boolean = () => false,
) {
  let attempts = loadAttempts();
  const todo = books.filter((b) => needsEnrichment(b) && shouldAttempt(attempts, b.id));
  if (!todo.length) return;
  const { makeBook } = await import("foliate-js/view.js");
  for (const book of todo) {
    while (isPaused() && !signal.aborted) await new Promise((r) => setTimeout(r, 500));
    if (signal.aborted) return;
    attempts = recordStart(attempts, book.id);
    saveAttempts(attempts);
    let parsed: FoliateBook | undefined;
    try {
      parsed = await makeBook(await api.readBookFile(book));
      const p = parsed;
      if (await fillGaps(book, metadataFromFoliate(p.metadata), () => p.getCover?.())) onChanged();
      attempts = recordDone(attempts, book.id);
      saveAttempts(attempts);
    } catch (e) {
      console.warn(`Couldn't read metadata for ${book.path}`, e);
    } finally {
      // Releases pdf.js documents and their workers.
      parsed?.destroy?.();
    }
    // Yield so the UI stays responsive during large imports.
    await new Promise((r) => setTimeout(r, 50));
  }
}
