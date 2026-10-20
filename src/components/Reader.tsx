import { openUrl } from "@tauri-apps/plugin-opener";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { collapse } from "foliate-js/epubcfi.js";
import { ArrowLeft, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, PanelLeft, Search, Type } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnnotations } from "../hooks/useAnnotations";
import { useBookSearch } from "../hooks/useBookSearch";
import { api, type Annotation, type Book } from "../lib/api";
import { modKey } from "../lib/platform";
import { LIMITS, type ReaderSettings } from "../lib/settings";
import {
  bookmarkOnPage,
  colorFill,
  exportFileName,
  toJson,
  toMarkdown,
  type HighlightColor,
} from "../reader/annotations";
import type { BookMeta, Capabilities, ReaderEngine, ReaderLocation, TextSelection, TocItem } from "../reader/engine";
import { fillGaps } from "../reader/enrich";
import { FoliateEngine } from "../reader/foliateEngine";
import { defineUrl, wikipediaUrl } from "../reader/lookup";
import { titleFromPath } from "../reader/metadata";
import { AnnotationPopover } from "./reader/AnnotationPopover";
import { NotesPanel } from "./reader/NotesPanel";
import { ReaderSidebar, type SidebarTab } from "./reader/ReaderSidebar";
import { SearchPanel } from "./reader/SearchPanel";
import { SelectionMenu } from "./reader/SelectionMenu";
import { SettingsPanel } from "./SettingsPanel";
import { TocPanel } from "./TocPanel";
import { IconButton } from "./ui";

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };
type Popover = { id: number; rect: DOMRect; editing: boolean };

const SAVE_DELAY_MS = 600;
const NOTICE_MS = 2200;
const NO_CAPABILITIES: Capabilities = { annotations: false, search: false, reflowable: true };

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

const excerpt = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 140 ? `${t.slice(0, 140).trimEnd()}…` : t;
};

export function Reader({
  book,
  settings,
  onSettingsChange,
  onClose,
  onError,
  initialSearch,
}: {
  book: Book;
  settings: ReaderSettings;
  onSettingsChange: (s: ReaderSettings) => void;
  onClose: () => void;
  onError: (message: string) => void;
  /** Opens the search panel with this query once the book is ready (from library full-text search). */
  initialSearch?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [engine, setEngine] = useState<ReaderEngine | null>(null);
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [ticks, setTicks] = useState<number[]>([]);
  const [loc, setLoc] = useState<ReaderLocation | null>(null);
  const [sidebar, setSidebar] = useState<SidebarTab | null>(null);
  const [lastTab, setLastTab] = useState<SidebarTab>("contents");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const annotations = useAnnotations(book.id, onError);
  const listRef = useRef<Annotation[]>(annotations.list);
  listRef.current = annotations.list;
  const search = useBookSearch(engine);
  const caps = engine?.capabilities ?? NO_CAPABILITIES;

  const flash = useCallback((message: string) => setNotice(message), []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  // Open the book and wire up progress persistence.
  useEffect(() => {
    const instance = new FoliateEngine(containerRef.current!);
    let cancelled = false;
    let pending: ReaderLocation | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      clearTimeout(timer);
      if (pending) api.saveProgress(book.id, pending.cfi, pending.fraction).catch(console.error);
      pending = null;
    };

    instance.onRelocate((l) => {
      setLoc(l);
      setSelection(null);
      setPopover(null);
      pending = l;
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY_MS);
    });
    instance.onSelection(setSelection);
    instance.onAnnotationClick((cfi, rect) => {
      const a = listRef.current.find((x) => x.kind === "highlight" && x.cfi === cfi);
      if (a) setPopover({ id: a.id, rect, editing: false });
    });

    (async () => {
      try {
        const file = await api.readBookFile(book);
        if (cancelled) return;
        const m = await instance.open(file, { initialCfi: book.progress?.cfi, settings: settingsRef.current });
        if (cancelled) return;
        setMeta(m);
        setToc(instance.toc);
        setTicks(instance.sectionFractions);
        setEngine(instance);
        setStatus({ kind: "ready" });
        fillGaps(book, m.metadata, m.getCover).catch(console.error);
      } catch (e) {
        if (!cancelled) setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();

    return () => {
      cancelled = true;
      flush();
      instance.destroy();
      setEngine(null);
    };
  }, [book]);

  useEffect(() => {
    engine?.applySettings(settings);
  }, [engine, settings]);

  // Draw highlights whenever the list changes.
  useEffect(() => {
    if (!engine?.capabilities.annotations) return;
    engine.setAnnotations(
      annotations.list.filter((a) => a.kind === "highlight").map((a) => ({ cfi: a.cfi, color: colorFill(a.color) })),
    );
  }, [engine, annotations.list]);

  const openTab = useCallback((tab: SidebarTab) => {
    setSidebar(tab);
    setLastTab(tab);
    setSettingsOpen(false);
    if (tab === "search") setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  const { setQuery } = search;
  useEffect(() => {
    if (engine && initialSearch && caps.search) {
      openTab("search");
      setQuery(initialSearch, true);
    }
    // Only when the book first becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const goTo = useCallback(
    (target: string) => {
      engine?.goTo(target).catch(console.error);
    },
    [engine],
  );

  const currentBookmark = bookmarkOnPage(annotations.list, loc?.cfi);

  const toggleBookmark = useCallback(async () => {
    if (!engine || !loc) return;
    const existing = bookmarkOnPage(listRef.current, loc.cfi);
    if (existing) {
      await annotations.remove(existing.id);
      flash("Bookmark removed");
    } else {
      let cfi = loc.cfi;
      try {
        cfi = collapse(loc.cfi);
      } catch {
        // Non-range CFIs (fixed layout) are already points.
      }
      await annotations.add({
        kind: "bookmark",
        cfi,
        text: excerpt(engine.visibleText()) || null,
        note: null,
        color: null,
        chapter: loc.chapter ?? null,
      });
      flash("Page bookmarked");
    }
  }, [engine, loc, annotations, flash]);

  const highlight = useCallback(
    async (color: HighlightColor, thenEditNote = false) => {
      const sel = selection;
      if (!sel?.cfi) return;
      const existing = listRef.current.find((a) => a.kind === "highlight" && a.cfi === sel.cfi);
      const a =
        existing ??
        (await annotations.add({
          kind: "highlight",
          cfi: sel.cfi,
          text: sel.text,
          note: null,
          color,
          chapter: loc?.chapter ?? null,
        }));
      engine?.clearSelection();
      if (a && thenEditNote) setPopover({ id: a.id, rect: sel.rect, editing: true });
    },
    [selection, annotations, engine, loc],
  );

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => flash("Copied"))
        .catch((e) => onError(String(e)));
    },
    [flash, onError],
  );

  const open = useCallback((url: string) => openUrl(url).catch((e) => onError(String(e))), [onError]);

  const exportNotes = useCallback(
    async (format: "md" | "json") => {
      const path = await save({
        defaultPath: exportFileName(book, format),
        filters: [format === "md" ? { name: "Markdown", extensions: ["md"] } : { name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      const list = listRef.current;
      try {
        await writeTextFile(path, format === "md" ? toMarkdown(book, list) : toJson(book, list));
        flash("Notes exported");
      } catch (e) {
        onError(String(e));
      }
    },
    [book, flash, onError],
  );

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (!engine || e.defaultPrevented || isTyping(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      const fontStep = (delta: number) => {
        e.preventDefault();
        const s = settingsRef.current;
        const fontSize = Math.min(LIMITS.fontSize.max, Math.max(LIMITS.fontSize.min, s.fontSize + delta));
        onSettingsChange({ ...s, fontSize });
      };
      if (mod && (e.key === "=" || e.key === "+")) return fontStep(1);
      if (mod && e.key === "-") return fontStep(-1);
      if (mod && e.key === "f") {
        e.preventDefault();
        if (engine.capabilities.search) openTab("search");
        return;
      }
      if (mod || e.altKey) return;
      const scrolled = settingsRef.current.flow === "scrolled";
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          engine.goLeft();
          break;
        case "ArrowRight":
          e.preventDefault();
          engine.goRight();
          break;
        case " ":
        case "PageDown":
          if (scrolled) return;
          e.preventDefault();
          if (e.shiftKey) engine.prev();
          else engine.next();
          break;
        case "PageUp":
          if (scrolled) return;
          e.preventDefault();
          engine.prev();
          break;
        case "Escape":
          if (popover) setPopover(null);
          else if (selection) engine.clearSelection();
          else if (sidebar || settingsOpen) {
            setSidebar(null);
            setSettingsOpen(false);
          } else onClose();
          break;
        case "t":
          if (sidebar === "contents") setSidebar(null);
          else openTab("contents");
          break;
        case "b":
          void toggleBookmark();
          break;
      }
    },
    [engine, onClose, onSettingsChange, openTab, popover, selection, sidebar, settingsOpen, toggleBookmark],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    const off = engine?.onKeydown(handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      off?.();
    };
  }, [handleKey, engine]);

  const title = meta?.title || book.title || titleFromPath(book.path);
  const percent = Math.round((loc?.fraction ?? book.progress?.fraction ?? 0) * 100);
  const popoverAnnotation = useMemo(
    () => (popover ? annotations.list.find((a) => a.id === popover.id) : undefined),
    [popover, annotations.list],
  );
  const ready = status.kind === "ready";

  return (
    <div className="flex h-full flex-col">
      <header
        data-tauri-drag-region
        className="relative z-20 flex h-11 shrink-0 items-center gap-1 border-b border-border/60 px-2"
      >
        <IconButton label="Back to library (Esc)" onClick={onClose}>
          <ArrowLeft size={17} />
        </IconButton>
        <IconButton
          label="Contents and notes (T)"
          active={sidebar != null}
          onClick={() => (sidebar ? setSidebar(null) : openTab(lastTab))}
        >
          <PanelLeft size={17} />
        </IconButton>
        <div
          data-tauri-drag-region
          className="min-w-0 flex-1 truncate px-2 text-center text-[13px] font-medium text-muted"
        >
          {title}
        </div>
        {caps.search && (
          <IconButton label={`Search (${modKey}F)`} active={sidebar === "search"} onClick={() => openTab("search")}>
            <Search size={16} />
          </IconButton>
        )}
        <IconButton
          label={currentBookmark ? "Remove bookmark (B)" : "Bookmark this page (B)"}
          active={!!currentBookmark}
          disabled={!ready}
          onClick={() => void toggleBookmark()}
        >
          {currentBookmark ? <BookmarkCheck size={17} className="text-accent" /> : <Bookmark size={17} />}
        </IconButton>
        <div className="relative">
          <IconButton
            label="Reading settings"
            active={settingsOpen}
            onClick={() => {
              setSettingsOpen(!settingsOpen);
              setSidebar(null);
            }}
          >
            <Type size={17} />
          </IconButton>
          {settingsOpen && (
            <div className="absolute top-10 right-0 animate-fade-in rounded-xl border border-border bg-surface shadow-panel">
              <SettingsPanel settings={settings} onChange={onSettingsChange} reflowable={caps.reflowable} />
            </div>
          )}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {(sidebar || settingsOpen) && (
          <div
            className="absolute inset-0 z-10 bg-black/10"
            onClick={() => {
              setSidebar(null);
              setSettingsOpen(false);
            }}
            aria-hidden
          />
        )}
        <ReaderSidebar
          open={sidebar != null}
          tab={sidebar ?? lastTab}
          onTab={openTab}
          noteCount={annotations.list.length}
        >
          {(sidebar ?? lastTab) === "contents" ? (
            <TocPanel
              toc={toc}
              title={title}
              authors={meta?.authors ?? book.authors ?? ""}
              current={loc?.chapterHref}
              onSelect={(href) => {
                goTo(href);
                setSidebar(null);
              }}
            />
          ) : (sidebar ?? lastTab) === "notes" ? (
            <NotesPanel
              annotations={annotations.list}
              canAnnotate={caps.annotations}
              onSelect={(a) => {
                goTo(a.cfi);
                setSidebar(null);
              }}
              onSaveNote={(a, n) => void annotations.update(a.id, n, a.color ?? undefined)}
              onDelete={(a) => void annotations.remove(a.id)}
              onExport={(f) => void exportNotes(f)}
            />
          ) : (
            <SearchPanel
              search={search}
              available={caps.search}
              inputRef={searchInputRef}
              onQuery={search.setQuery}
              onClear={search.clear}
              onSelect={goTo}
            />
          )}
        </ReaderSidebar>

        {settings.flow === "paginated" && ready && (
          <button
            type="button"
            aria-label="Previous page"
            onClick={() => engine?.goLeft()}
            className="group absolute inset-y-0 left-0 z-[5] flex w-12 items-center justify-center text-muted opacity-0 transition-opacity hover:opacity-100"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <div ref={containerRef} className="min-w-0 flex-1" />
        {settings.flow === "paginated" && ready && (
          <button
            type="button"
            aria-label="Next page"
            onClick={() => engine?.goRight()}
            className="group absolute inset-y-0 right-0 z-[5] flex w-12 items-center justify-center text-muted opacity-0 transition-opacity hover:opacity-100"
          >
            <ChevronRight size={22} />
          </button>
        )}

        {status.kind === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
          </div>
        )}
        {status.kind === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg p-8 text-center">
            <h2 className="font-serif text-lg">Couldn't open this book</h2>
            <p className="max-w-md text-[13px] text-muted">{status.message}</p>
            <button type="button" onClick={onClose} className="text-[13px] text-accent hover:underline">
              Back to library
            </button>
          </div>
        )}
      </div>

      <footer className="flex h-10 shrink-0 items-center gap-3 px-4 text-[12px] text-muted">
        <span className="w-1/3 truncate">{loc?.chapter ?? ""}</span>
        <div className="relative flex flex-1 items-center">
          <input
            type="range"
            aria-label="Book progress"
            className="w-full"
            min={0}
            max={1}
            step={0.0005}
            value={loc?.fraction ?? 0}
            disabled={!ready}
            dir={meta?.dir}
            list="section-ticks"
            onChange={(e) => engine?.goToFraction(Number(e.target.value))}
          />
          <datalist id="section-ticks">
            {ticks.map((t, i) => (
              <option key={i} value={t} />
            ))}
          </datalist>
        </div>
        <span className="w-1/3 text-right tabular-nums">
          {loc?.location ? `Loc ${loc.location.current + 1} of ${loc.location.total} · ` : ""}
          {percent}%
        </span>
      </footer>

      {selection && !popover && (
        <SelectionMenu
          selection={selection}
          canAnnotate={caps.annotations}
          canSearch={caps.search}
          onHighlight={(c) => void highlight(c)}
          onNote={() => void highlight("yellow", true)}
          onCopy={() => {
            copy(selection.text);
            engine?.clearSelection();
          }}
          onDefine={() => open(defineUrl(selection.text, meta?.language ?? book.language))}
          onWikipedia={() => open(wikipediaUrl(selection.text, meta?.language ?? book.language))}
          onSearch={() => {
            openTab("search");
            search.setQuery(selection.text, true);
            engine?.clearSelection();
          }}
        />
      )}

      {popover && popoverAnnotation && (
        <AnnotationPopover
          key={popover.id}
          annotation={popoverAnnotation}
          anchor={popover.rect}
          startEditing={popover.editing}
          onColor={(c) => void annotations.update(popoverAnnotation.id, popoverAnnotation.note, c)}
          onSaveNote={(n) => void annotations.update(popoverAnnotation.id, n, popoverAnnotation.color ?? undefined)}
          onCopy={() => copy(popoverAnnotation.text ?? "")}
          onDelete={() => {
            void annotations.remove(popoverAnnotation.id);
            setPopover(null);
          }}
          onClose={() => setPopover(null)}
        />
      )}

      {notice && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-14 left-1/2 z-50 -translate-x-1/2 animate-fade-in rounded-full bg-fg px-3.5 py-1.5 text-[12px] font-medium text-bg shadow-panel"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
