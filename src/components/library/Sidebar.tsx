import * as ContextMenu from "@radix-ui/react-context-menu";
import { BookCopy, BookOpen, House, Layers, Library, Pencil, Plus, Trash2, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { Collection } from "../../lib/api";
import { menuContentClass, menuDangerItemClass, menuItemClass, menuSeparatorClass } from "../ui";
import { sameView, type LibraryView } from "./views";

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] transition-colors ${
        active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2/70 hover:text-fg"
      }`}
    >
      <span className={active ? "text-accent" : ""}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && <span className="text-[11px] tabular-nums text-muted">{count}</span>}
    </button>
  );
}

export function Sidebar({
  view,
  onNavigate,
  bookCount,
  collections,
  onNewCollection,
  onRenameCollection,
  onDeleteCollection,
}: {
  view: LibraryView;
  onNavigate: (v: LibraryView) => void;
  bookCount: number;
  collections: Collection[];
  onNewCollection: () => void;
  onRenameCollection: (c: Collection) => void;
  onDeleteCollection: (c: Collection) => void;
}) {
  const nav = (v: LibraryView, icon: ReactNode, label: string, count?: number) => (
    <NavItem icon={icon} label={label} count={count} active={sameView(view, v)} onClick={() => onNavigate(v)} />
  );

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface/60">
      <div data-tauri-drag-region className="flex h-14 items-center gap-2.5 px-4">
        <BookOpen size={18} className="text-accent" />
        <span className="text-[14px] font-semibold tracking-tight">Free Reader</span>
      </div>
      <nav aria-label="Library" className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {nav({ kind: "home" }, <House size={15} />, "Home")}
        {nav({ kind: "all" }, <BookCopy size={15} />, "All Books", bookCount)}
        {nav({ kind: "authors" }, <Users size={15} />, "Authors")}
        {nav({ kind: "series-index" }, <Layers size={15} />, "Series")}

        <div className="flex items-center justify-between px-2.5 pt-5 pb-1">
          <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">Collections</span>
          <button
            type="button"
            onClick={onNewCollection}
            aria-label="New collection"
            title="New collection"
            className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-fg"
          >
            <Plus size={14} />
          </button>
        </div>
        {collections.length === 0 && (
          <button
            type="button"
            onClick={onNewCollection}
            className="w-full px-2.5 py-1 text-left text-[12px] text-muted hover:text-fg"
          >
            Create a collection to group books.
          </button>
        )}
        {collections.map((c) => (
          <ContextMenu.Root key={c.id}>
            <ContextMenu.Trigger asChild>
              <div>{nav({ kind: "collection", id: c.id }, <Library size={15} />, c.name, c.bookCount)}</div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content className={menuContentClass}>
                <ContextMenu.Item className={menuItemClass} onSelect={() => onRenameCollection(c)}>
                  <Pencil size={14} /> Rename…
                </ContextMenu.Item>
                <ContextMenu.Separator className={menuSeparatorClass} />
                <ContextMenu.Item className={menuDangerItemClass} onSelect={() => onDeleteCollection(c)}>
                  <Trash2 size={14} /> Delete collection…
                </ContextMenu.Item>
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        ))}
      </nav>
    </aside>
  );
}
