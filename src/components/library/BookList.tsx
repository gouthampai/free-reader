import { ArrowDown, MoreHorizontal } from "lucide-react";
import type { Book, Collection } from "../../lib/api";
import {
  displayAuthors,
  displayTitle,
  readingStatus,
  relativeTime,
  seriesLabel,
  type SortKey,
} from "../../lib/library";
import { BookContextMenu, BookDropdownMenu, type BookActions } from "./BookMenu";
import { BookCover } from "./BookCover";
import { ProgressBar } from "./BookGrid";

const COLUMNS: { label: string; sort?: SortKey; className: string }[] = [
  { label: "Title", sort: "title", className: "w-[34%]" },
  { label: "Author", sort: "author", className: "w-[20%]" },
  { label: "Series", sort: "series", className: "w-[16%]" },
  { label: "Progress", sort: "progress", className: "w-[12%]" },
  { label: "Last read", sort: "recent", className: "w-[9%]" },
  { label: "Added", sort: "added", className: "w-[9%]" },
];

export function BookList({
  books,
  collections,
  actions,
  sort,
  onSort,
}: {
  books: Book[];
  collections: Collection[];
  actions: BookActions;
  sort: SortKey;
  onSort: (s: SortKey) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-[12px] text-muted">
            {COLUMNS.map((c) => (
              <th
                key={c.label}
                className={`py-2 pr-3 font-medium ${c.className}`}
                aria-sort={c.sort === sort ? "ascending" : undefined}
              >
                <button
                  type="button"
                  className={`inline-flex items-center gap-1 hover:text-fg ${c.sort === sort ? "text-fg" : ""}`}
                  onClick={() => c.sort && onSort(c.sort)}
                >
                  {c.label}
                  {c.sort === sort && <ArrowDown size={12} />}
                </button>
              </th>
            ))}
            <th className="w-10" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {books.map((b) => {
            const title = displayTitle(b);
            const status = readingStatus(b);
            const fraction = b.progress?.fraction ?? 0;
            return (
              <BookContextMenu key={b.id} book={b} collections={collections} actions={actions}>
                <tr
                  className="group cursor-default border-b border-border/60 hover:bg-surface-2/60"
                  onClick={() => actions.open(b)}
                  onKeyDown={(e) => e.key === "Enter" && actions.open(b)}
                  tabIndex={0}
                  aria-label={`Open ${title}`}
                >
                  <td className="py-1.5 pr-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="w-7 shrink-0">
                        <BookCover book={b} compact />
                      </div>
                      <span className="truncate font-medium" title={title}>
                        {title}
                      </span>
                    </div>
                  </td>
                  <td className="truncate pr-3 text-muted">{displayAuthors(b)}</td>
                  <td className="truncate pr-3 text-muted">{seriesLabel(b) ?? ""}</td>
                  <td className="pr-3">
                    {status === "finished" ? (
                      <span className="text-[12px] text-muted">Finished</span>
                    ) : status === "reading" ? (
                      <div className="flex items-center gap-2">
                        <ProgressBar fraction={fraction} />
                        <span className="w-8 text-right text-[11px] tabular-nums text-muted">
                          {Math.round(fraction * 100)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-[12px] text-muted">Not started</span>
                    )}
                  </td>
                  <td className="truncate pr-3 text-[12px] text-muted">{relativeTime(b.lastOpenedAt)}</td>
                  <td className="truncate pr-3 text-[12px] text-muted">{relativeTime(b.addedAt)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <BookDropdownMenu book={b} collections={collections} actions={actions}>
                      <button
                        type="button"
                        aria-label={`More actions for ${title}`}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                    </BookDropdownMenu>
                  </td>
                </tr>
              </BookContextMenu>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
