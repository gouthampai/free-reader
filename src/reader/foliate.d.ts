// Minimal typings for the parts of the vendored foliate-js API we use.
declare module "foliate-js/view.js" {
  export interface FoliateTocItem {
    label: string;
    href: string;
    subitems?: FoliateTocItem[];
  }

  export interface FoliateBook {
    dir?: string;
    toc?: FoliateTocItem[];
    metadata?: {
      title?: string | Record<string, string>;
      author?: unknown;
      language?: string | string[];
    };
    getCover?(): Promise<Blob | null> | Blob | null;
    transformTarget?: EventTarget;
  }

  export interface FoliateRelocateDetail {
    cfi: string;
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
  }
}
