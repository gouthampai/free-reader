import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { Library } from "./components/Library";
import { Reader } from "./components/Reader";
import { api, SUPPORTED_EXTENSIONS, type Book } from "./lib/api";
import { loadSettings, saveSettings, type ReaderSettings } from "./lib/settings";

export default function App() {
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);
  const [books, setBooks] = useState<Book[]>([]);
  const [current, setCurrent] = useState<Book | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api
      .listBooks()
      .then((all) =>
        setBooks(all.filter((b) => b.lastOpenedAt).sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))),
      )
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    saveSettings(settings);
  }, [settings]);

  const openPath = useCallback(async (path: string) => {
    try {
      setError(null);
      // Link in place: the file stays where it is, as before the library was managed.
      const summary = await api.importBooks([path], false);
      const id = summary.added[0] ?? summary.duplicates[0];
      if (id == null) {
        setError(summary.failed[0]?.error ?? `Couldn't open ${path}`);
        return;
      }
      setCurrent(await api.markOpened(id));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const openDialog = useCallback(async () => {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Ebooks", extensions: SUPPORTED_EXTENSIONS }],
    });
    if (typeof path === "string") openPath(path);
  }, [openPath]);

  useEffect(() => {
    api
      .takeLaunchPath()
      .then((p) => {
        if (p) openPath(p);
      })
      .catch(console.error);
  }, [openPath]);

  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === "enter" || type === "over") setDragging(true);
      else if (type === "leave") setDragging(false);
      else if (type === "drop") {
        setDragging(false);
        const path = event.payload.paths[0];
        if (path) openPath(path);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openPath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "o") {
        e.preventDefault();
        openDialog();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openDialog]);

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
          books={books}
          dragging={dragging}
          onOpenDialog={openDialog}
          onOpenBook={(b) => openPath(b.path)}
          onRemove={(b) =>
            api
              .removeBook(b.id)
              .then(refresh)
              .catch((e) => setError(String(e)))
          }
        />
      )}
      {error && (
        <div
          role="alert"
          className="fixed bottom-14 left-1/2 z-50 flex max-w-lg -translate-x-1/2 animate-fade-in items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5 text-[13px] shadow-panel"
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
