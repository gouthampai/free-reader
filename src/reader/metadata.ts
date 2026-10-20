/** Helpers for normalizing foliate-js metadata, which may be plain strings or language maps. */

type LanguageMap = string | Record<string, string> | undefined | null;
type Contributor = string | { name?: LanguageMap } | undefined | null;

export function formatLanguageMap(x: LanguageMap): string {
  if (!x) return "";
  if (typeof x === "string") return x;
  const first = Object.keys(x)[0];
  return first ? x[first] : "";
}

const formatOne = (c: Contributor): string => (typeof c === "string" ? c : formatLanguageMap(c?.name));

export function formatContributors(c: Contributor | Contributor[]): string {
  const list = (Array.isArray(c) ? c : [c]).map(formatOne).filter(Boolean);
  return new Intl.ListFormat("en", { style: "short", type: "conjunction" }).format(list);
}

/** Display title for a file whose metadata is missing: "my_book-v2.epub" -> "my book v2". */
export function titleFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return (
    base
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .trim() || "Untitled"
  );
}
