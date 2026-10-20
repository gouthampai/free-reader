import type { View, FoliateRelocateDetail } from "foliate-js/view.js";
import "foliate-js/view.js";
import type { ReaderSettings } from "../lib/settings";
import type { BookMeta, ReaderEngine, ReaderLocation, TocItem } from "./engine";
import { formatContributors, formatLanguageMap } from "./metadata";
import { buildReaderCss } from "./readerCss";

/** ReaderEngine backed by foliate-js (EPUB, MOBI/AZW3, FB2, CBZ). */
export class FoliateEngine implements ReaderEngine {
  #view: View;
  #relocate = new Set<(loc: ReaderLocation) => void>();
  #keydown = new Set<(e: KeyboardEvent) => void>();

  constructor(container: HTMLElement) {
    this.#view = document.createElement("foliate-view") as View;
    this.#view.style.cssText = "display:block;width:100%;height:100%";
    container.append(this.#view);

    this.#view.addEventListener("relocate", (e) => {
      const d = (e as CustomEvent<FoliateRelocateDetail>).detail;
      const loc: ReaderLocation = {
        cfi: d.cfi,
        fraction: d.fraction ?? 0,
        chapter: d.tocItem?.label?.trim(),
        chapterHref: d.tocItem?.href,
        location: d.location ? { current: d.location.current, total: d.location.total } : undefined,
      };
      this.#relocate.forEach((cb) => cb(loc));
    });

    this.#view.addEventListener("load", (e) => {
      const doc = (e as CustomEvent<{ doc: Document }>).detail.doc;
      doc.addEventListener("keydown", (ev) => this.#keydown.forEach((cb) => cb(ev)));
    });
  }

  async open(file: File, opts: { initialCfi?: string; settings?: ReaderSettings } = {}): Promise<BookMeta> {
    const view = this.#view;
    await view.open(file);
    const { book } = view;
    // Missing resources shouldn't abort rendering the whole section.
    book.transformTarget?.addEventListener("data", (e) => {
      const detail = (e as CustomEvent<{ data: unknown; name: string }>).detail;
      detail.data = Promise.resolve(detail.data).catch((err) => {
        console.error(`Failed to load ${detail.name}`, err);
        return "";
      });
    });
    if (opts.settings) this.applySettings(opts.settings);
    await view.init({ lastLocation: opts.initialCfi, showTextStart: !opts.initialCfi });
    return {
      title: formatLanguageMap(book.metadata?.title),
      authors: formatContributors(book.metadata?.author as never),
      language: [book.metadata?.language].flat()[0],
      dir: book.dir === "rtl" ? "rtl" : "ltr",
      getCover: async () => (await book.getCover?.()) ?? null,
    };
  }

  get toc(): TocItem[] {
    return this.#view.book?.toc ?? [];
  }

  get sectionFractions(): number[] {
    try {
      return this.#view.getSectionFractions();
    } catch {
      return [];
    }
  }

  async goTo(target: string) {
    await this.#view.goTo(target);
  }
  goToFraction(fraction: number) {
    return this.#view.goToFraction(fraction);
  }
  goLeft() {
    return this.#view.goLeft();
  }
  goRight() {
    return this.#view.goRight();
  }
  next() {
    return this.#view.next();
  }
  prev() {
    return this.#view.prev();
  }

  applySettings(s: ReaderSettings) {
    const r = this.#view.renderer;
    if (!r) return;
    r.setAttribute("flow", s.flow);
    r.setAttribute("gap", `${s.margin}%`);
    r.setAttribute("max-inline-size", `${s.maxWidth}px`);
    r.setAttribute("max-column-count", s.spread ? "2" : "1");
    r.setAttribute("animated", "");
    r.setStyles?.(buildReaderCss(s));
  }

  onRelocate(cb: (loc: ReaderLocation) => void) {
    this.#relocate.add(cb);
    return () => this.#relocate.delete(cb);
  }

  onKeydown(cb: (e: KeyboardEvent) => void) {
    this.#keydown.add(cb);
    return () => this.#keydown.delete(cb);
  }

  destroy() {
    this.#relocate.clear();
    this.#keydown.clear();
    try {
      this.#view.close();
    } catch {
      // Already closed or never opened.
    }
    this.#view.remove();
  }
}
