import { ArrowLeft, ChevronLeft, ChevronRight, List, Type } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Book } from "../lib/api";
import { LIMITS, type ReaderSettings } from "../lib/settings";
import type { BookMeta, ReaderEngine, ReaderLocation, TocItem } from "../reader/engine";
import { FoliateEngine } from "../reader/foliateEngine";
import { titleFromPath } from "../reader/metadata";
import { SettingsPanel } from "./SettingsPanel";
import { TocPanel } from "./TocPanel";
import { IconButton } from "./ui";

type Status = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

const SAVE_DELAY_MS = 600;

export function Reader({
  book,
  settings,
  onSettingsChange,
  onClose,
}: {
  book: Book;
  settings: ReaderSettings;
  onSettingsChange: (s: ReaderSettings) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReaderEngine | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [ticks, setTicks] = useState<number[]>([]);
  const [loc, setLoc] = useState<ReaderLocation | null>(null);
  const [panel, setPanel] = useState<"toc" | "settings" | null>(null);

  // Open the book and wire up progress persistence.
  useEffect(() => {
    const container = containerRef.current!;
    const engine = new FoliateEngine(container);
    engineRef.current = engine;
    let cancelled = false;
    let pending: ReaderLocation | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      clearTimeout(timer);
      if (pending) api.saveProgress(book.id, pending.cfi, pending.fraction).catch(console.error);
      pending = null;
    };

    engine.onRelocate((l) => {
      setLoc(l);
      pending = l;
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY_MS);
    });

    (async () => {
      try {
        const file = await api.readBookFile(book);
        if (cancelled) return;
        const m = await engine.open(file, { initialCfi: book.progress?.cfi, settings: settingsRef.current });
        if (cancelled) return;
        setMeta(m);
        setToc(engine.toc);
        setTicks(engine.sectionFractions);
        setStatus({ kind: "ready" });
        if (m.title && (m.title !== book.title || m.authors !== book.authors)) {
          api.setBookMetadata(book.id, m.title, m.authors || null).catch(console.error);
        }
      } catch (e) {
        if (!cancelled) setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();

    return () => {
      cancelled = true;
      flush();
      engine.destroy();
      engineRef.current = null;
    };
  }, [book]);

  useEffect(() => {
    if (status.kind === "ready") engineRef.current?.applySettings(settings);
  }, [settings, status.kind]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine || e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        onSettingsChange({
          ...settingsRef.current,
          fontSize: Math.min(LIMITS.fontSize.max, settingsRef.current.fontSize + 1),
        });
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        onSettingsChange({
          ...settingsRef.current,
          fontSize: Math.max(LIMITS.fontSize.min, settingsRef.current.fontSize - 1),
        });
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
          setPanel((p) => {
            if (!p) onClose();
            return null;
          });
          break;
        case "t":
          setPanel((p) => (p === "toc" ? null : "toc"));
          break;
      }
    },
    [onClose, onSettingsChange],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    const off = engineRef.current?.onKeydown(handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      off?.();
    };
  }, [handleKey, status.kind]);

  const title = meta?.title || book.title || titleFromPath(book.path);
  const percent = Math.round((loc?.fraction ?? book.progress?.fraction ?? 0) * 100);

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
          label="Contents (T)"
          active={panel === "toc"}
          onClick={() => setPanel(panel === "toc" ? null : "toc")}
        >
          <List size={17} />
        </IconButton>
        <div
          data-tauri-drag-region
          className="min-w-0 flex-1 truncate px-2 text-center text-[13px] font-medium text-muted"
        >
          {title}
        </div>
        <div className="relative">
          <IconButton
            label="Reading settings"
            active={panel === "settings"}
            onClick={() => setPanel(panel === "settings" ? null : "settings")}
          >
            <Type size={17} />
          </IconButton>
          {panel === "settings" && (
            <div className="absolute top-10 right-0 animate-fade-in rounded-xl border border-border bg-surface shadow-panel">
              <SettingsPanel settings={settings} onChange={onSettingsChange} />
            </div>
          )}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {panel && <div className="absolute inset-0 z-10 bg-black/10" onClick={() => setPanel(null)} aria-hidden />}
        <aside
          className={`absolute inset-y-0 left-0 z-10 w-80 max-w-[85%] border-r border-border bg-surface shadow-panel transition-transform duration-200 ${
            panel === "toc" ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-hidden={panel !== "toc"}
        >
          {panel === "toc" && (
            <TocPanel
              toc={toc}
              title={title}
              authors={meta?.authors ?? book.authors ?? ""}
              current={loc?.chapterHref}
              onSelect={(href) => {
                engineRef.current?.goTo(href).catch(console.error);
                setPanel(null);
              }}
            />
          )}
        </aside>

        {settings.flow === "paginated" && status.kind === "ready" && (
          <button
            type="button"
            aria-label="Previous page"
            onClick={() => engineRef.current?.goLeft()}
            className="group absolute inset-y-0 left-0 z-[5] flex w-12 items-center justify-center text-muted opacity-0 transition-opacity hover:opacity-100"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <div ref={containerRef} className="min-w-0 flex-1" />
        {settings.flow === "paginated" && status.kind === "ready" && (
          <button
            type="button"
            aria-label="Next page"
            onClick={() => engineRef.current?.goRight()}
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
            disabled={status.kind !== "ready"}
            dir={meta?.dir}
            list="section-ticks"
            onChange={(e) => engineRef.current?.goToFraction(Number(e.target.value))}
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
    </div>
  );
}
