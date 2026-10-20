// Minimal typings for the parts of the vendored foliate-js API we use.
declare module "foliate-js/view.js" {
  export interface FoliateTocItem {
    label: string;
    href: string;
    subitems?: FoliateTocItem[];
  }

  export interface FoliateMetadata {
    title?: string | Record<string, string>;
    author?: unknown;
    language?: string | string[];
    publisher?: unknown;
    description?: string;
    belongsTo?: { series?: FoliateSeries | FoliateSeries[] };
  }

  export interface FoliateSeries {
    name?: string | Record<string, string>;
    position?: number | string;
  }

  /** Parses a book file without rendering it. */
  export function makeBook(file: File | Blob): Promise<FoliateBook>;

  export interface FoliateBook {
    dir?: string;
    sections?: { createDocument?: unknown }[];
    toc?: FoliateTocItem[];
    metadata?: FoliateMetadata;
    getCover?(): Promise<Blob | null> | Blob | null;
    destroy?(): void;
    transformTarget?: EventTarget;
  }

  export interface FoliateRelocateDetail {
    cfi: string;
    range?: Range;
    fraction: number;
    location?: { current: number; next: number; total: number };
    tocItem?: { label?: string; href?: string };
  }

  export interface FoliateRenderer extends HTMLElement {
    setStyles?(css: string): void;
    next(): Promise<void>;
  }

  export class View extends HTMLElement {
    book: FoliateBook;
    renderer: FoliateRenderer;
    lastLocation?: FoliateRelocateDetail;
    open(file: File | Blob | string): Promise<void>;
    init(opts: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
    close(): void;
    goTo(target: string): Promise<unknown>;
    goToFraction(fraction: number): Promise<void>;
    goLeft(): Promise<void>;
    goRight(): Promise<void>;
    next(distance?: number): Promise<void>;
    prev(distance?: number): Promise<void>;
    getSectionFractions(): number[];
    isFixedLayout: boolean;
    getCFI(index: number, range?: Range): string;
    resolveNavigation(target: string): { index: number } | undefined;
    addAnnotation(annotation: { value: string }, remove?: boolean): Promise<unknown>;
    deleteAnnotation(annotation: { value: string }): Promise<unknown>;
    search(opts: {
      query: string;
      matchCase?: boolean;
      matchWholeWords?: boolean;
    }): AsyncGenerator<
      | "done"
      | { progress: number }
      | { label: string; subitems: { cfi: string; excerpt: { pre: string; match: string; post: string } }[] }
    >;
    clearSearch(): void;
  }
}

declare module "foliate-js/epubcfi.js" {
  /** Collapses a range CFI to its start (or end) point. */
  export function collapse(cfi: string, toEnd?: boolean): string;
  /** Orders two CFIs by position in the book: negative, zero or positive. */
  export function compare(a: string, b: string): number;
  export const isCFI: RegExp;
}

declare module "foliate-js/overlayer.js" {
  export class Overlayer {
    static highlight: unknown;
    static underline: unknown;
    static outline: unknown;
  }
}
