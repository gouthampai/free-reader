import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useState } from "react";
import type { ImportProgress, ImportSummary } from "../../lib/api";

export function summarize(s: ImportSummary): string {
  const parts: string[] = [];
  if (s.added.length) parts.push(`Added ${s.added.length} ${s.added.length === 1 ? "book" : "books"}`);
  if (s.duplicates.length) parts.push(`${s.duplicates.length} already in library`);
  if (s.failed.length) parts.push(`${s.failed.length} couldn't be added`);
  return parts.join(" · ") || "No books found";
}

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Bottom-right card showing import progress, then a summary until dismissed. */
export function ImportStatus({
  progress,
  summary,
  onDismiss,
}: {
  progress: ImportProgress | null;
  summary: ImportSummary | null;
  onDismiss: () => void;
}) {
  const [showFailures, setShowFailures] = useState(false);
  if (!progress && !summary) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-5 bottom-5 z-40 w-80 animate-fade-in rounded-xl border border-border bg-surface p-3.5 text-[13px] shadow-panel"
    >
      {progress ? (
        <>
          <div className="mb-2 flex justify-between gap-3">
            <span className="font-medium">Importing…</span>
            <span className="text-[12px] tabular-nums text-muted">
              {progress.done + 1} of {progress.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${((progress.done + 1) / Math.max(progress.total, 1)) * 100}%` }}
            />
          </div>
          <div className="mt-1.5 truncate text-[11px] text-muted">{progress.current}</div>
        </>
      ) : (
        summary && (
          <>
            <div className="flex items-start gap-2.5">
              {summary.failed.length ? (
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" />
              ) : (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent" />
              )}
              <span className="flex-1">{summarize(summary)}</span>
              <button type="button" aria-label="Dismiss" onClick={onDismiss} className="text-muted hover:text-fg">
                <X size={14} />
              </button>
            </div>
            {summary.failed.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowFailures(!showFailures)}
                  className="mt-1.5 ml-6.5 text-[12px] text-accent hover:underline"
                >
                  {showFailures ? "Hide details" : "Show details"}
                </button>
                {showFailures && (
                  <ul className="mt-2 ml-6.5 max-h-40 space-y-1.5 overflow-y-auto text-[11px]">
                    {summary.failed.map((f) => (
                      <li key={f.path}>
                        <div className="truncate font-medium" title={f.path}>
                          {fileName(f.path)}
                        </div>
                        <div className="text-muted">{f.error}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )
      )}
    </div>
  );
}
