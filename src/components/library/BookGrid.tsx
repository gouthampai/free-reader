import { CheckCircle2, MoreHorizontal } from "lucide-react";
import type { Book, Collection } from "../../lib/api";
import { displayAuthors, displayTitle, readingStatus, seriesLabel } from "../../lib/library";
import { BookContextMenu, BookDropdownMenu, type BookActions } from "./BookMenu";
import { BookCover } from "./BookCover";

export function ProgressBar({ fraction }: { fraction: number }) {
  return (
    <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(fraction * 100)}%` }} />
    </div>
  );
}

export function BookTile({
  book,
  collections,
  actions,
  showSeries = false,
}: {
  book: Book;
  collections: Collection[];
  actions: BookActions;
  showSeries?: boolean;
}) {
  const title = displayTitle(book);
  const status = readingStatus(book);
  const fraction = book.progress?.fraction ?? 0;
  const series = showSeries ? seriesLabel(book) : null;

  return (
    <BookContextMenu book={book} collections={collections} actions={actions}>
      <li className="group relative animate-fade-in">
        <button
          type="button"
          onClick={() => actions.open(book)}
          className="block w-full rounded-md text-left"
          aria-label={`Open ${title}`}
        >
          <div className="transition-transform duration-150 group-hover:-translate-y-0.5">
            <BookCover book={book} />
          </div>
          <div className="mt-2.5 line-clamp-2 text-[13px] leading-snug font-medium" title={title}>
            {title}
          </div>
          <div className="truncate text-[12px] text-muted">{series ?? displayAuthors(book)}</div>
          <div className="mt-1.5 flex h-4 items-center gap-2 text-[11px] text-muted">
            {status === "finished" ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 size={12} className="text-accent" /> Finished
              </span>
            ) : status === "reading" ? (
              <>
                <ProgressBar fraction={fraction} />
                <span className="tabular-nums">{Math.round(fraction * 100)}%</span>
              </>
            ) : (
              <span className="rounded bg-surface-2 px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase">
                New
              </span>
            )}
          </div>
        </button>
        <BookDropdownMenu book={book} collections={collections} actions={actions}>
          <button
            type="button"
            aria-label={`More actions for ${title}`}
            className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal size={15} />
          </button>
        </BookDropdownMenu>
      </li>
    </BookContextMenu>
  );
}

export function BookGrid({
  books,
  collections,
  actions,
  showSeries,
}: {
  books: Book[];
  collections: Collection[];
  actions: BookActions;
  showSeries?: boolean;
}) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-6 gap-y-8">
      {books.map((b) => (
        <BookTile key={b.id} book={b} collections={collections} actions={actions} showSeries={showSeries} />
      ))}
    </ul>
  );
}
