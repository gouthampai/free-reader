import { Search, X } from "lucide-react";
import type { RefObject } from "react";
import type { BookSearchState } from "../../hooks/useBookSearch";

export function SearchPanel({
  search,
  available,
  inputRef,
  onQuery,
  onClear,
  onSelect,
}: {
  search: BookSearchState;
  available: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onQuery: (q: string, immediate?: boolean) => void;
  onClear: () => void;
  onSelect: (cfi: string) => void;
}) {
  if (!available)
    return <p className="p-6 text-center text-[13px] text-muted">Search isn't available for this book's format.</p>;

  const searching = search.progress != null;
  const done = !searching && search.query.trim().length >= 2;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-2.5">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            type="search"
            value={search.query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") onQuery(search.query, true);
              if (e.key === "Escape") (search.query ? onClear : () => inputRef.current?.blur())();
            }}
            placeholder="Search this book"
            aria-label="Search this book"
            className="h-8 w-full rounded-lg border border-border bg-bg pr-7 pl-8 text-[13px] placeholder:text-muted focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {search.query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={onClear}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted hover:text-fg"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="mt-2 flex h-4 items-center gap-2 text-[11px] text-muted" aria-live="polite">
          {searching ? (
            <>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{ width: `${(search.progress ?? 0) * 100}%` }}
                />
              </div>
              <span className="tabular-nums">{search.total} found</span>
            </>
          ) : done ? (
            <span>
              {search.total
                ? `${search.total} ${search.total === 1 ? "result" : "results"} in ${search.groups.length} ${search.groups.length === 1 ? "section" : "sections"}`
                : "No results"}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {search.groups.map((g, gi) => (
          <section key={gi} className="mb-2">
            <h3 className="sticky top-0 bg-surface px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
              {g.label || "Untitled section"}
            </h3>
            <ul>
              {g.matches.map((m) => (
                <li key={m.cfi}>
                  <button
                    type="button"
                    onClick={() => onSelect(m.cfi)}
                    className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] leading-snug hover:bg-surface-2/70"
                  >
                    <span className="text-muted">…{m.excerpt.pre}</span>
                    <mark className="rounded-sm bg-accent/20 px-0.5 text-fg">{m.excerpt.match}</mark>
                    <span className="text-muted">{m.excerpt.post}…</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
