import type { ReaderSettings } from "../lib/settings";

/**
 * Format-agnostic reader contract. The UI talks only to this interface;
 * each format (foliate-js for EPUB/MOBI/FB2/CBZ, PDF.js later) implements it.
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

export interface ReaderEngine {
  open(file: File, opts?: { initialCfi?: string; settings?: ReaderSettings }): Promise<BookMeta>;
  readonly toc: TocItem[];
  /** Section boundaries as fractions (0..1), for progress bar tick marks. */
  readonly sectionFractions: number[];
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
  destroy(): void;
}
