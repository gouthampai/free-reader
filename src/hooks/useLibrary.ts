import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Book, type Collection, type ImportProgress, type ImportSummary } from "../lib/api";
import { enrichLibrary } from "../reader/enrich";

export function useLibrary() {
  const [books, setBooks] = useState<Book[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const booksRef = useRef(books);
  booksRef.current = books;

  const refresh = useCallback(async () => {
    const [b, c] = await Promise.all([api.listBooks(), api.listCollections()]);
    setBooks(b);
    setCollections(c);
    setLoaded(true);
    return b;
  }, []);

  // Background enrichment: one run at a time; requests during a run queue one more pass.
  const enrich = useRef({ running: false, again: false, paused: false, abort: new AbortController() });
  const setEnrichmentPaused = useCallback((paused: boolean) => {
    enrich.current.paused = paused;
  }, []);
  const runEnrichment = useCallback(
    async (latest?: Book[]) => {
      const e = enrich.current;
      if (e.running) {
        e.again = true;
        return;
      }
      e.running = true;
      try {
        // Re-read e.abort each pass: a remount replaces the controller.
        let list = latest ?? booksRef.current;
        do {
          e.again = false;
          await enrichLibrary(
            list,
            () => void refresh(),
            e.abort.signal,
            () => e.paused,
          );
          list = booksRef.current;
        } while (e.again && !e.abort.signal.aborted);
      } finally {
        e.running = false;
      }
    },
    [refresh],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    enrich.current.abort = ctrl;
    refresh().then((b) => runEnrichment(b));
    return () => ctrl.abort();
  }, [refresh, runEnrichment]);

  useEffect(() => {
    const unlisten = api.onImportProgress((p) => setProgress(p.done < p.total ? p : null));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const importPaths = useCallback(
    async (paths: string[], copy: boolean): Promise<ImportSummary> => {
      try {
        return await api.importBooks(paths, copy);
      } finally {
        setProgress(null);
        void runEnrichment(await refresh());
      }
    },
    [refresh, runEnrichment],
  );

  return { books, collections, loaded, progress, refresh, importPaths, setEnrichmentPaused };
}
