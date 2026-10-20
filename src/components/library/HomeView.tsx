import { FilePlus, FolderPlus, Play } from "lucide-react";
import type { Book, Collection } from "../../lib/api";
import { displayAuthors, displayTitle, readingStatus, sortBooks } from "../../lib/library";
import { Button } from "../ui";
import { BookGrid, ProgressBar } from "./BookGrid";
import { BookContextMenu, type BookActions } from "./BookMenu";
import { BookCover } from "./BookCover";

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-[12px] font-semibold tracking-wider text-muted uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Large "resume" card for books in progress. */
function ContinueCard({ book, collections, actions }: { book: Book; collections: Collection[]; actions: BookActions }) {
  const fraction = book.progress?.fraction ?? 0;
  const title = displayTitle(book);
  return (
    <BookContextMenu book={book} collections={collections} actions={actions}>
      <button
        type="button"
        onClick={() => actions.open(book)}
        aria-label={`Continue reading ${title}`}
        className="group flex w-full animate-fade-in gap-4 rounded-xl border border-border bg-surface p-3 text-left transition-shadow hover:shadow-panel"
      >
        <div className="w-20 shrink-0">
          <BookCover book={book} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col py-1">
          <div className="line-clamp-2 font-serif text-[15px] leading-snug font-semibold">{title}</div>
          <div className="mt-0.5 truncate text-[12px] text-muted">{displayAuthors(book)}</div>
          <div className="mt-auto flex items-center gap-2 text-[11px] text-muted">
            <ProgressBar fraction={fraction} />
            <span className="tabular-nums">{Math.round(fraction * 100)}%</span>
          </div>
          <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-accent opacity-80 group-hover:opacity-100">
            <Play size={12} /> Resume
          </span>
        </div>
      </button>
    </BookContextMenu>
  );
}

export function EmptyLibrary({ onAddFiles, onAddFolder }: { onAddFiles: () => void; onAddFolder: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center pb-16 text-center">
      <div className="mb-5 grid grid-cols-3 gap-1.5 opacity-80" aria-hidden>
        {[200, 30, 260].map((h) => (
          <div
            key={h}
            className="h-16 w-11 rounded-[3px] shadow-panel"
            style={{ background: `linear-gradient(160deg, hsl(${h} 35% 48%), hsl(${h} 40% 32%))` }}
          />
        ))}
      </div>
      <h2 className="mb-1.5 font-serif text-xl">Start your library</h2>
      <p className="mb-6 max-w-sm text-muted">
        Drop EPUB, MOBI, AZW3, FB2 or CBZ files — or whole folders — anywhere in this window.
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={onAddFiles}>
          <FilePlus size={15} /> Add books…
        </Button>
        <Button onClick={onAddFolder}>
          <FolderPlus size={15} /> Add folder…
        </Button>
      </div>
    </div>
  );
}

export function HomeView({
  books,
  collections,
  actions,
  onShowAll,
}: {
  books: Book[];
  collections: Collection[];
  actions: BookActions;
  onShowAll: () => void;
}) {
  const reading = sortBooks(
    books.filter((b) => readingStatus(b) === "reading"),
    "recent",
  ).slice(0, 6);
  const recent = sortBooks(books, "added").slice(0, 12);

  return (
    <>
      {reading.length > 0 && (
        <Section title="Continue reading">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {reading.map((b) => (
              <ContinueCard key={b.id} book={b} collections={collections} actions={actions} />
            ))}
          </div>
        </Section>
      )}
      <Section
        title="Recently added"
        action={
          books.length > recent.length && (
            <button type="button" onClick={onShowAll} className="text-[12px] text-accent hover:underline">
              See all {books.length}
            </button>
          )
        }
      >
        <BookGrid books={recent} collections={collections} actions={actions} />
      </Section>
    </>
  );
}
