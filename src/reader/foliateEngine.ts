import type { FoliateRelocateDetail, View } from "foliate-js/view.js";
import "foliate-js/view.js";
import { Overlayer } from "foliate-js/overlayer.js";
import type { ReaderSettings } from "../lib/settings";
import type {
  AnnotationMark,
  BookMeta,
  Capabilities,
  ReaderEngine,
  ReaderLocation,
  SearchEvent,
  TextSelection,
  TocItem,
} from "./engine";
import { metadataFromFoliate } from "./enrich";
import { formatContributors, formatLanguageMap } from "./metadata";
import { fontFaceCss } from "./fonts";
import { buildReaderCss } from "./readerCss";

type Listeners<T extends unknown[]> = Set<(...args: T) => void>;
const emit = <T extends unknown[]>(set: Listeners<T>, ...args: T) => set.forEach((cb) => cb(...args));
const subscribe = <T extends unknown[]>(set: Listeners<T>, cb: (...args: T) => void) => {
  set.add(cb);
  return () => void set.delete(cb);
};

/** Maps a range inside a book frame to viewport coordinates (frames may be offset or scaled). */
function rangeRect(range: Range): DOMRect {
  const doc = range.startContainer.ownerDocument;
  const frame = doc?.defaultView?.frameElement as HTMLElement | null;
  const first = range.getClientRects()[0] ?? range.getBoundingClientRect();
  if (!frame) return first;
  const f = frame.getBoundingClientRect();
  const scale = frame.clientWidth ? f.width / frame.clientWidth : 1;
  return new DOMRect(f.x + first.x * scale, f.y + first.y * scale, first.width * scale, first.height * scale);
}

/** ReaderEngine backed by foliate-js (EPUB, MOBI/AZW3, FB2, CBZ, PDF). */
export class FoliateEngine implements ReaderEngine {
  #view: View;
  #relocate: Listeners<[ReaderLocation]> = new Set();
  #keydown: Listeners<[KeyboardEvent]> = new Set();
  #selection: Listeners<[TextSelection | null]> = new Set();
  #annotationClick: Listeners<[string, DOMRect]> = new Set();
  /** Highlights by CFI. Foliate asks us to draw them as their sections load. */
  #marks = new Map<string, AnnotationMark>();
  #docs = new Set<Document>();
  #fontFaces = fontFaceCss();
  /** Page turns slide unless the OS asks for reduced motion. */
  #reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  #onMotionChange = () => this.#applyMotion();

  constructor(container: HTMLElement) {
    const view = (this.#view = document.createElement("foliate-view") as View);
    view.style.cssText = "display:block;width:100%;height:100%";
    container.append(view);
    this.#reducedMotion.addEventListener("change", this.#onMotionChange);

    view.addEventListener("relocate", (e) => {
      const d = (e as CustomEvent<FoliateRelocateDetail>).detail;
      // Foliate reports NaN progress while a section is still being laid out; skip those.
      if (!Number.isFinite(d.fraction)) return;
      emit(this.#relocate, {
        cfi: d.cfi,
        fraction: d.fraction,
        chapter: d.tocItem?.label?.trim(),
        chapterHref: d.tocItem?.href,
        location: d.location ? { current: d.location.current, total: d.location.total } : undefined,
      });
    });

    view.addEventListener("load", (e) => {
      const { doc, index } = (e as CustomEvent<{ doc: Document; index: number }>).detail;
      this.#docs.add(doc);
      doc.addEventListener("keydown", (ev) => emit(this.#keydown, ev));
      const report = () => {
        const sel = doc.getSelection();
        const text = sel?.toString().trim();
        if (!sel || sel.isCollapsed || !sel.rangeCount || !text) return emit(this.#selection, null);
        const range = sel.getRangeAt(0);
        let cfi = "";
        try {
          cfi = view.getCFI(index, range);
        } catch {
          // Selections we can't anchor can still be copied or looked up.
        }
        emit(this.#selection, { cfi, text, rect: rangeRect(range) });
      };
      // Report once the user lets go, not on every intermediate selection change.
      doc.addEventListener("pointerup", () => setTimeout(report, 0));
      doc.addEventListener("keyup", (ev) => ev.shiftKey && report());
      doc.addEventListener("selectionchange", () => {
        if (doc.getSelection()?.isCollapsed) emit(this.#selection, null);
      });
    });

    view.addEventListener("draw-annotation", (e) => {
      const { draw, annotation } = (
        e as CustomEvent<{ draw: (fn: unknown, opts: object) => void; annotation: { value: string } }>
      ).detail;
      const mark = this.#marks.get(annotation.value);
      if (mark) draw(Overlayer.highlight, { color: mark.color });
    });

    view.addEventListener("create-overlay", (e) => {
      const { index } = (e as CustomEvent<{ index: number }>).detail;
      for (const cfi of this.#marks.keys()) if (this.#indexOf(cfi) === index) this.#draw(cfi);
    });

    view.addEventListener("show-annotation", (e) => {
      const { value, range } = (e as CustomEvent<{ value: string; range: Range }>).detail;
      emit(this.#annotationClick, value, rangeRect(range));
    });
  }

  #indexOf(cfi: string): number | undefined {
    try {
      return this.#view.resolveNavigation(cfi)?.index;
    } catch {
      return undefined;
    }
  }

  #draw(cfi: string) {
    this.#view.addAnnotation({ value: cfi }).catch((err) => console.warn("Couldn't draw highlight", cfi, err));
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
      metadata: metadataFromFoliate(book.metadata),
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

  get capabilities(): Capabilities {
    const fixed = this.#view.isFixedLayout;
    return {
      annotations: !fixed,
      search: !!this.#view.book?.sections?.some((s) => s.createDocument),
      reflowable: !fixed,
    };
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
    this.#applyMotion();
    r.setStyles?.(buildReaderCss(s, this.#fontFaces));
  }

  #applyMotion() {
    this.#view.renderer?.toggleAttribute("animated", !this.#reducedMotion.matches);
  }

  onRelocate(cb: (loc: ReaderLocation) => void) {
    return subscribe(this.#relocate, cb);
  }

  onKeydown(cb: (e: KeyboardEvent) => void) {
    return subscribe(this.#keydown, cb);
  }

  onSelection(cb: (sel: TextSelection | null) => void) {
    return subscribe(this.#selection, cb);
  }

  clearSelection() {
    for (const doc of this.#docs) doc.getSelection()?.removeAllRanges();
    emit(this.#selection, null);
  }

  setAnnotations(marks: AnnotationMark[]) {
    const next = new Map(marks.map((m) => [m.cfi, m]));
    for (const cfi of this.#marks.keys()) {
      if (!next.has(cfi)) {
        this.#marks.delete(cfi);
        this.#view.deleteAnnotation({ value: cfi }).catch(() => {});
      }
    }
    for (const [cfi, mark] of next) {
      if (this.#marks.get(cfi)?.color === mark.color) continue;
      this.#marks.set(cfi, mark);
      this.#draw(cfi);
    }
  }

  onAnnotationClick(cb: (cfi: string, rect: DOMRect) => void) {
    return subscribe(this.#annotationClick, cb);
  }

  visibleText() {
    return this.#view.lastLocation?.range?.toString() ?? "";
  }

  async *search(query: string): AsyncGenerator<SearchEvent> {
    for await (const r of this.#view.search({ query })) {
      if (r === "done") {
        yield { kind: "done" };
        return;
      }
      if ("progress" in r) yield { kind: "progress", fraction: r.progress };
      else if (r.subitems?.length) yield { kind: "group", label: r.label?.trim() ?? "", matches: r.subitems };
    }
  }

  clearSearch() {
    this.#view.clearSearch();
  }

  destroy() {
    this.#reducedMotion.removeEventListener("change", this.#onMotionChange);
    for (const set of [this.#relocate, this.#keydown, this.#selection, this.#annotationClick]) set.clear();
    this.#docs.clear();
    try {
      this.#view.close();
    } catch {
      // Already closed or never opened.
    }
    this.#view.remove();
  }
}
