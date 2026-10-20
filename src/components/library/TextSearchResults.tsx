import { useEffect, useState } from "react";
import { api, type Book, type IndexStatus, type TextHit } from "../../lib/api";
import { displayAuthors, displayTitle, snippetParts } from "../../lib/library";
import { BookCover } from "./BookCover";

const DEBOUNCE_MS = 250;
const MIN_LENGTH = 3;

/** "Found inside books" results from the full-text index, shown under title/author matches. */
export function TextSearchResults({
  query,
  books,
  onOpen,
}: {
  query: string;
  books: Book[];
  onOpen: (book: Book, query: string) => void;
}) {
  const [hits, setHits] = useState<TextHit[]>([]);
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_LENGTH) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      Promise.all([api.searchText(q), api.indexStatus()])
        .then(([h, s]) => {
          if (cancelled) return;
          setHits(h);
          setStatus(s);
        })
        .catch(console.error)
        .finally(() => !cancelled && setSearching(false));
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  if (query.trim().length < MIN_LENGTH) return null;
  const byId = new Map(books.map((b) => [b.id, b]));
  const shown = hits.filter((h) => byId.has(h.bookId));

  return (
    <section className="mt-10" aria-busy={searching}>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-[12px] font-semibold tracking-wider text-muted uppercase">Inside books</h2>
        {status && status.pending > 0 && (
          <span className="text-[11px] text-muted">
            Still indexing {status.pending} {status.pending === 1 ? "book" : "books"}…
          </span>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="text-[13px] text-muted">{searching ? "Searching…" : "No matches in book text."}</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((h) => {
            const book = byId.get(h.bookId)!;
            return (
              <li key={h.bookId}>
                <button
                  type="button"
                  onClick={() => onOpen(book, query.trim())}
                  className="flex w-full gap-3.5 rounded-lg p-2.5 text-left transition-colors hover:bg-surface-2/70"
                >
                  <div className="w-10 shrink-0">
                    <BookCover book={book} compact />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-[13px] font-medium">{displayTitle(book)}</span>
                      <span className="truncate text-[12px] text-muted">{displayAuthors(book)}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted">
                        {h.sections} {h.sections === 1 ? "section" : "sections"}
                      </span>
                    </div>
                    {h.snippets.map((s, i) => (
                      <p key={i} className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-muted">
                        {snippetParts(s).map((p, j) =>
                          p.match ? (
                            <mark key={j} className="rounded-sm bg-accent/20 px-0.5 text-fg">
                              {p.text}
                            </mark>
                          ) : (
                            <span key={j}>{p.text}</span>
                          ),
                        )}
                      </p>
                    ))}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
