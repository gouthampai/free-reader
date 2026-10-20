import { BookOpen, FolderOpen, X } from "lucide-react";
import type { Book } from "../lib/api";
import { titleFromPath } from "../reader/metadata";
import { Button } from "./ui";

const COVER_HUES = [12, 32, 160, 200, 220, 260, 290, 340];

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Typographic placeholder cover until real covers are extracted in Phase 2. */
function Cover({ title, authors }: { title: string; authors: string }) {
  const hue = COVER_HUES[hashString(title) % COVER_HUES.length];
  return (
    <div
      className="flex aspect-[2/3] w-full flex-col justify-between rounded-md p-3 text-left shadow-panel"
      style={{ background: `linear-gradient(160deg, hsl(${hue} 35% 42%), hsl(${hue} 40% 28%))`, color: "#fdfbf6" }}
    >
      <div className="font-serif text-[15px] leading-snug font-semibold line-clamp-5">{title}</div>
      <div className="text-[11px] opacity-80 line-clamp-2">{authors}</div>
    </div>
  );
}

export function Library({
  books,
  dragging,
  onOpenDialog,
  onOpenBook,
  onRemove,
}: {
  books: Book[];
  dragging: boolean;
  onOpenDialog: () => void;
  onOpenBook: (b: Book) => void;
  onRemove: (b: Book) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <header data-tauri-drag-region className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2.5" data-tauri-drag-region>
          <BookOpen size={20} className="text-accent" />
          <h1 className="text-[15px] font-semibold tracking-tight">Free Reader</h1>
        </div>
        <Button variant="primary" onClick={onOpenDialog}>
          <FolderOpen size={15} /> Open book…
        </Button>
      </header>

      <main className="relative flex-1 overflow-y-auto px-6 py-6">
        {books.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2">
              <BookOpen size={28} className="text-muted" />
            </div>
            <h2 className="mb-1.5 font-serif text-xl">Your library is empty</h2>
            <p className="mb-5 max-w-sm text-muted">
              Drop an EPUB, MOBI, AZW3, FB2 or CBZ file anywhere in this window, or open one from disk.
            </p>
            <Button variant="primary" onClick={onOpenDialog}>
              <FolderOpen size={15} /> Open book…
            </Button>
          </div>
        ) : (
          <>
            <h2 className="mb-4 text-[12px] font-semibold tracking-wider text-muted uppercase">Continue reading</h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-7">
              {books.map((b) => {
                const title = b.title || titleFromPath(b.path);
                const pct = Math.round((b.progress?.fraction ?? 0) * 100);
                return (
                  <li key={b.id} className="group relative animate-fade-in">
                    <button
                      type="button"
                      onClick={() => onOpenBook(b)}
                      className="block w-full rounded-md text-left transition-transform group-hover:-translate-y-0.5"
                      aria-label={`Open ${title}`}
                    >
                      <Cover title={title} authors={b.authors ?? ""} />
                      <div className="mt-2.5 truncate text-[13px] font-medium">{title}</div>
                      <div className="truncate text-[12px] text-muted">{b.authors || "Unknown author"}</div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] tabular-nums text-muted">{pct}%</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${title} from library`}
                      title="Remove from library"
                      onClick={() => onRemove(b)}
                      className="absolute top-1.5 right-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white group-hover:flex focus-visible:flex"
                    >
                      <X size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-surface/80 text-[15px] font-medium text-accent">
            Drop to open
          </div>
        )}
      </main>
    </div>
  );
}
