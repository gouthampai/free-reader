import { ChevronRight } from "lucide-react";
import type { Group } from "../../lib/library";
import { BookCover } from "./BookCover";

/** Index of authors or series; each row links to a filtered book list. */
export function GroupIndex({
  groups,
  empty,
  onSelect,
}: {
  groups: Group[];
  empty: string;
  onSelect: (name: string) => void;
}) {
  if (!groups.length) return <p className="pt-10 text-center text-muted">{empty}</p>;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
      {groups.map((g) => (
        <li key={g.name}>
          <button
            type="button"
            onClick={() => onSelect(g.name)}
            className="group flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-surface-2"
          >
            <div className="w-9 shrink-0">
              <BookCover book={g.sample} compact />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{g.name}</div>
              <div className="text-[12px] text-muted">
                {g.count} {g.count === 1 ? "book" : "books"}
              </div>
            </div>
            <ChevronRight size={15} className="text-muted opacity-0 group-hover:opacity-100" />
          </button>
        </li>
      ))}
    </ul>
  );
}
