import type { Metadata } from "../lib/api";
import type { ReaderSettings } from "../lib/settings";

/**
 * Format-agnostic reader contract. The UI talks only to this interface;
 * each format family implements it (today: foliate-js for EPUB/MOBI/FB2/CBZ/PDF).
 */

export interface TocItem {
  label: string;
  href: string;
  subitems?: TocItem[];
}

export interface BookMeta {
  title: string;
  authors: string;
  language?: string;
  dir: "ltr" | "rtl";
  getCover(): Promise<Blob | null>;
  /** Library-shaped metadata, used to fill fields the importer couldn't extract. */
  metadata: Partial<Metadata>;
}

export interface ReaderLocation {
  /** Stable position (EPUB CFI) suitable for persistence. */
  cfi: string;
  /** Overall progress through the book, 0..1. */
  fraction: number;
  /** Label of the current TOC entry, if any. */
  chapter?: string;
  /** href of the current TOC entry, for highlighting it in the TOC. */
  chapterHref?: string;
  /** Approximate location index and total, for "page x of y" style displays. */
  location?: { current: number; total: number };
}

/** What the open book supports; fixed-layout books (PDF, comics) can't be highlighted or reflowed. */
export interface Capabilities {
  annotations: boolean;
  search: boolean;
  /** Text settings (font, size, spacing, scroll mode) apply. */
  reflowable: boolean;
}

export interface TextSelection {
  cfi: string;
  text: string;
  /** Rect of the selection's first line, in viewport coordinates, for placing a toolbar. */
  rect: DOMRect;
}

export interface AnnotationMark {
  cfi: string;
  /** CSS fill color. */
  color: string;
}

export interface SearchMatch {
  cfi: string;
  excerpt: { pre: string; match: string; post: string };
}

export type SearchEvent =
  { kind: "progress"; fraction: number } | { kind: "group"; label: string; matches: SearchMatch[] } | { kind: "done" };

export interface ReaderEngine {
  open(file: File, opts?: { initialCfi?: string; settings?: ReaderSettings }): Promise<BookMeta>;
  readonly toc: TocItem[];
  /** Section boundaries as fractions (0..1), for progress bar tick marks. */
  readonly sectionFractions: number[];
  readonly capabilities: Capabilities;
  goTo(target: string): Promise<void>;
  goToFraction(fraction: number): Promise<void>;
  /** Visual left/right navigation, respecting the book's reading direction. */
  goLeft(): Promise<void>;
  goRight(): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  applySettings(settings: ReaderSettings): void;
  onRelocate(cb: (loc: ReaderLocation) => void): () => void;
  /** Key events from inside the book's frames, which don't bubble to the window. */
  onKeydown(cb: (e: KeyboardEvent) => void): () => void;
  /** Fires when the user finishes selecting text (null when the selection is cleared). */
  onSelection(cb: (sel: TextSelection | null) => void): () => void;
  clearSelection(): void;
  /** Replaces the set of drawn highlights. */
  setAnnotations(marks: AnnotationMark[]): void;
  /** Fires when the user clicks an existing highlight. */
  onAnnotationClick(cb: (cfi: string, rect: DOMRect) => void): () => void;
  /** Text of the visible page, e.g. for bookmark excerpts. */
  visibleText(): string;
  /** Searches the whole book, streaming results chapter by chapter. Break out of the loop to cancel. */
  search(query: string): AsyncGenerator<SearchEvent>;
  clearSearch(): void;
  destroy(): void;
}
