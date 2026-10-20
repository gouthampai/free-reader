import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImportStatus } from "./components/library/ImportStatus";
import { Library } from "./components/library/Library";
import { Reader } from "./components/Reader";
import { useLibrary } from "./hooks/useLibrary";
import { api, SUPPORTED_EXTENSIONS, type Book, type ImportSummary } from "./lib/api";
import { loadPrefs, savePrefs, type LibraryPrefs } from "./lib/prefs";
import { dispatchAction, onAction, shortcutFor } from "./lib/actions";
import { loadSettings, saveSettings, stepFontSize, type ReaderSettings } from "./lib/settings";

const SUMMARY_TIMEOUT_MS = 6000;

export default function App() {
  const lib = useLibrary();
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);
  const [prefs, setPrefs] = useState<LibraryPrefs>(loadPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [current, setCurrent] = useState<{ book: Book; search?: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    saveSettings(settings);
  }, [settings]);

  useEffect(() => savePrefs(prefs), [prefs]);

  // The window starts hidden (tauri.conf.json) so it never flashes unstyled; show it once the first
  // render is committed. (requestAnimationFrame doesn't fire while the window is hidden.)
  useEffect(() => {
    getCurrentWindow().show().catch(console.error);
  }, []);

  // Clean summaries fade on their own; ones with failures stay until dismissed.
  useEffect(() => {
    if (!summary || summary.failed.length) return;
    const t = setTimeout(() => setSummary(null), SUMMARY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [summary]);

  const openBook = useCallback(async (book: Book, opts: { search?: string } = {}) => {
    try {
      setError(null);
      setCurrent({ book: await api.markOpened(book.id), search: opts.search });
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const { importPaths, refresh, setEnrichmentPaused } = lib;

  // Background enrichment waits while reading (see enrichLibrary).
  useEffect(() => setEnrichmentPaused(current != null), [current, setEnrichmentPaused]);
  const addPaths = useCallback(
    async (paths: string[], { openSingle = false } = {}) => {
      if (!paths.length) return;
      setSummary(null);
      // Pause before importing so enrichment doesn't start on the book we're about to open.
      if (openSingle) setEnrichmentPaused(true);
      try {
        const s = await importPaths(paths, prefsRef.current.copyOnImport);
        const id = s.added[0] ?? s.duplicates[0];
        if (openSingle && paths.length === 1 && id != null && !s.failed.length) {
          setCurrent({ book: await api.markOpened(id) });
          return;
        }
        setSummary(s);
      } catch (e) {
        setError(String(e));
      }
      // Didn't open a book after all: let enrichment resume.
      if (openSingle) setEnrichmentPaused(false);
    },
    [importPaths, setEnrichmentPaused],
  );

  const addFiles = useCallback(async () => {
    const paths = await open({
      multiple: true,
      directory: false,
      filters: [{ name: "Ebooks", extensions: SUPPORTED_EXTENSIONS }],
    });
    if (paths) addPaths(paths);
  }, [addPaths]);

  const addFolder = useCallback(async () => {
    const paths = await open({ multiple: true, directory: true });
    if (paths) addPaths(paths);
  }, [addPaths]);

  // Files opened from Finder/Explorer (double-click, Open With) or passed on the command line queue
  // in Rust. Take them on startup and whenever Rust says more arrived; a single book opens directly.
  useEffect(() => {
    const take = () =>
      api
        .takePendingOpens()
        .then((paths) => {
          if (paths.length) void addPaths(paths, { openSingle: paths.length === 1 });
        })
        .catch(console.error);
    void take();
    const unlisten = listen("pending-opens", () => void take());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [addPaths]);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === "enter" || type === "over") setDragging(true);
      else if (type === "leave") setDragging(false);
      else if (type === "drop") {
        setDragging(false);
        // Folders are expanded by the importer; unsupported files are reported in the summary.
        addPaths(event.payload.paths);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [addPaths]);

  const closeReader = useCallback(() => {
    setCurrent(null);
    refresh();
  }, [refresh]);

  // Shortcuts mirror the native menu; the dispatcher drops the duplicate when both fire.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const id = shortcutFor(e);
      if (id) {
        e.preventDefault();
        dispatchAction(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reading = current != null;
  useEffect(
    () =>
      onAction((id) => {
        switch (id) {
          case "add-books":
            void addFiles();
            return true;
          case "add-folder":
            void addFolder();
            return true;
          case "text-larger":
          case "text-smaller":
            setSettings((s) => stepFontSize(s, id === "text-larger" ? 1 : -1));
            return true;
          case "theme-light":
          case "theme-sepia":
          case "theme-dark":
            setSettings((s) => ({
              ...s,
              theme: id === "theme-light" ? "light" : id === "theme-sepia" ? "sepia" : "dark",
            }));
            return true;
          case "go-library":
            if (reading) closeReader();
            return true;
        }
      }),
    [addFiles, addFolder, closeReader, reading],
  );

  return (
    <>
      {current ? (
        <Reader
          key={current.book.id}
          book={current.book}
          initialSearch={current.search}
          settings={settings}
          onSettingsChange={setSettings}
          onClose={closeReader}
          onError={setError}
        />
      ) : (
        <Library
          books={lib.books}
          collections={lib.collections}
          loaded={lib.loaded}
          refresh={refresh}
          prefs={prefs}
          onPrefsChange={setPrefs}
          dragging={dragging}
          onOpenBook={openBook}
          onAddFiles={addFiles}
          onAddFolder={addFolder}
          onError={setError}
        />
      )}
      <ImportStatus progress={lib.progress} summary={summary} onDismiss={() => setSummary(null)} />
      {error && (
        <div
          role="alert"
          className="fixed bottom-5 left-1/2 z-50 flex max-w-lg -translate-x-1/2 animate-fade-in items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 text-[13px] shadow-panel"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" className="text-muted hover:text-fg" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
