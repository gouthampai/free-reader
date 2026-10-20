import { useCallback, useEffect, useRef, useState } from "react";
import type { ReaderEngine, SearchMatch } from "../reader/engine";

export interface SearchGroup {
  label: string;
  matches: SearchMatch[];
}

export interface BookSearchState {
  query: string;
  groups: SearchGroup[];
  /** 0..1 while searching, null when idle. */
  progress: number | null;
  total: number;
}

const IDLE: BookSearchState = { query: "", groups: [], progress: null, total: 0 };
const DEBOUNCE_MS = 300;
const MIN_LENGTH = 2;

/** In-book search; results stream in chapter by chapter and a new query cancels the old one. */
export function useBookSearch(engine: ReaderEngine | null) {
  const [state, setState] = useState<BookSearchState>(IDLE);
  const run = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const execute = useCallback(
    async (query: string) => {
      const id = ++run.current;
      if (!engine || query.trim().length < MIN_LENGTH) {
        engine?.clearSearch();
        setState({ ...IDLE, query });
        return;
      }
      setState({ query, groups: [], progress: 0, total: 0 });
      try {
        for await (const ev of engine.search(query.trim())) {
          if (id !== run.current) return; // superseded; returning cancels the generator
          if (ev.kind === "progress") setState((s) => ({ ...s, progress: ev.fraction }));
          else if (ev.kind === "group")
            setState((s) => ({
              ...s,
              groups: [...s.groups, { label: ev.label, matches: ev.matches }],
              total: s.total + ev.matches.length,
            }));
        }
      } catch (e) {
        console.error("search failed", e);
      }
      if (id === run.current) setState((s) => ({ ...s, progress: null }));
    },
    [engine],
  );

  const setQuery = useCallback(
    (query: string, immediate = false) => {
      clearTimeout(timer.current);
      setState((s) => ({ ...s, query }));
      if (immediate) void execute(query);
      else timer.current = setTimeout(() => void execute(query), DEBOUNCE_MS);
    },
    [execute],
  );

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    run.current++;
    engine?.clearSearch();
    setState(IDLE);
  }, [engine]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { ...state, setQuery, clear };
}
