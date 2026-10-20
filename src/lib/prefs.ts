import { SORT_LABELS, type SortKey } from "./library";

export interface LibraryPrefs {
  layout: "grid" | "list";
  sort: SortKey;
  /** Copy imported files into the managed library folder (vs. linking them in place). */
  copyOnImport: boolean;
}

export const DEFAULT_PREFS: LibraryPrefs = { layout: "grid", sort: "recent", copyOnImport: true };

const KEY = "free-reader:library-prefs:v1";

export function sanitizePrefs(raw: unknown): LibraryPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    layout: r.layout === "list" ? "list" : "grid",
    sort: typeof r.sort === "string" && r.sort in SORT_LABELS ? (r.sort as SortKey) : DEFAULT_PREFS.sort,
    copyOnImport: typeof r.copyOnImport === "boolean" ? r.copyOnImport : DEFAULT_PREFS.copyOnImport,
  };
}

export function loadPrefs(): LibraryPrefs {
  try {
    return sanitizePrefs(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: LibraryPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable; prefs won't persist.
  }
}
