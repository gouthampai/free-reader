import { useState } from "react";
import { coverUrl, type Book } from "../../lib/api";
import { displayAuthors, displayTitle } from "../../lib/library";

const COVER_HUES = [12, 32, 160, 200, 220, 260, 290, 340];

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The book's cover image, or a typographic placeholder when there is none. */
export function BookCover({ book, compact = false }: { book: Book; compact?: boolean }) {
  const url = coverUrl(book);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const title = displayTitle(book);

  if (url && failedUrl !== url) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailedUrl(url)}
        className="aspect-[2/3] w-full rounded-[3px] bg-surface-2 object-cover shadow-panel"
      />
    );
  }

  const hue = COVER_HUES[hashString(title) % COVER_HUES.length];
  return (
    <div
      aria-hidden
      className={`flex aspect-[2/3] w-full flex-col justify-between rounded-[3px] text-left shadow-panel ${compact ? "p-1" : "p-3"}`}
      style={{ background: `linear-gradient(160deg, hsl(${hue} 35% 42%), hsl(${hue} 40% 28%))`, color: "#fdfbf6" }}
    >
      {!compact && (
        <>
          <div className="line-clamp-5 font-serif text-[15px] leading-snug font-semibold">{title}</div>
          <div className="line-clamp-2 text-[11px] opacity-80">{book.authors ? displayAuthors(book) : ""}</div>
        </>
      )}
    </div>
  );
}
