import type { ReactNode } from "react";

export type SidebarTab = "contents" | "notes" | "search";

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "contents", label: "Contents" },
  { id: "notes", label: "Notes" },
  { id: "search", label: "Search" },
];

/** Left drawer with Contents / Notes / Search tabs. */
export function ReaderSidebar({
  open,
  tab,
  onTab,
  noteCount,
  children,
}: {
  open: boolean;
  tab: SidebarTab;
  onTab: (t: SidebarTab) => void;
  noteCount: number;
  children: ReactNode;
}) {
  return (
    <aside
      className={`absolute inset-y-0 left-0 z-10 flex w-80 max-w-[85%] flex-col border-r border-border bg-surface shadow-panel transition-transform duration-200 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
      aria-hidden={!open}
      inert={!open}
    >
      <div role="tablist" aria-label="Sidebar" className="flex shrink-0 gap-1 border-b border-border px-2 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-2.5 pb-2 text-[13px] transition-colors ${
              tab === t.id ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.label}
            {t.id === "notes" && noteCount > 0 && (
              <span className="rounded-full bg-surface-2 px-1.5 text-[10px] tabular-nums">{noteCount}</span>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1">
        {children}
      </div>
    </aside>
  );
}
