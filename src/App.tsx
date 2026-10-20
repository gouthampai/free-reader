import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImportStatus } from "./components/library/ImportStatus";
import { Library } from "./components/library/Library";
import { Reader } from "./components/Reader";
import { useLibrary } from "./hooks/useLibrary";
import { api, SUPPORTED_EXTENSIONS, type Book, type ImportSummary } from "./lib/api";
import { loadPrefs, savePrefs, type LibraryPrefs } from "./lib/prefs";
import { loadSettings, saveSettings, type ReaderSettings } from "./lib/settings";

const SUMMARY_TIMEOUT_MS = 6000;

export default function App() {
  const lib = useLibrary();
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);
  const [prefs, setPrefs] = useState<LibraryPrefs>(loadPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const [current, setCurrent] = useState<Book | null>(null);
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    saveSettings(settings);
  }, [settings]);

  useEffect(() => savePrefs(prefs), [prefs]);

  // Clean summaries fade on their own; ones with failures stay until dismissed.
  useEffect(() => {
    if (!summary || summary.failed.length) return;
    const t = setTimeout(() => setSummary(null), SUMMARY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [summary]);

  const openBook = useCallback(async (book: Book) => {
    try {
      setError(null);
      setCurrent(await api.markOpened(book.id));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const { importPaths, refresh } = lib;
  const addPaths = useCallback(
    async (paths: string[], { openSingle = false } = {}) => {
      if (!paths.length) return;
      setSummary(null);
      try {
        const s = await importPaths(paths, prefsRef.current.copyOnImport);
        const id = s.added[0] ?? s.duplicates[0];
        if (openSingle && paths.length === 1 && id != null && !s.failed.length) {
          setCurrent(await api.markOpened(id));
        } else {
          setSummary(s);
        }
      } catch (e) {
        setError(String(e));
      }
    },
    [importPaths],
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

  // Opened via file association / command line: add it and start reading.
  useEffect(() => {
    api
      .takeLaunchPath()
      .then((p) => {
        if (p) addPaths([p], { openSingle: true });
      })
      .catch(console.error);
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "o") {
        e.preventDefault();
        addFiles();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addFiles]);

  const closeReader = useCallback(() => {
    setCurrent(null);
    refresh();
  }, [refresh]);

  return (
    <>
      {current ? (
        <Reader
          key={current.id}
          book={current}
          settings={settings}
          onSettingsChange={setSettings}
          onClose={closeReader}
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
