import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bookmark, Download, Highlighter, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Annotation } from "../../lib/api";
import { colorFill } from "../../reader/annotations";
import { menuContentClass, menuItemClass, Segmented } from "../ui";
import { NoteEditor } from "./AnnotationPopover";

type Filter = "all" | "highlight" | "bookmark";

function Item({
  a,
  onSelect,
  onSaveNote,
  onDelete,
}: {
  a: Annotation;
  onSelect: () => void;
  onSaveNote: (note: string | null) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const isBookmark = a.kind === "bookmark";
  return (
    <li className="group relative rounded-lg px-2.5 py-2 hover:bg-surface-2/70">
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">
          {isBookmark ? (
            <Bookmark size={11} className="text-accent" />
          ) : (
            <span className="h-2 w-2 rounded-full" style={{ background: colorFill(a.color) }} />
          )}
          <span className="truncate">{a.chapter || (isBookmark ? "Bookmark" : "Highlight")}</span>
        </div>
        {a.text && (
          <p
            className={`line-clamp-4 text-[13px] leading-snug ${isBookmark ? "text-muted" : "border-l-2 pl-2"}`}
            style={isBookmark ? undefined : { borderColor: colorFill(a.color) }}
          >
            {a.text}
          </p>
        )}
      </button>
      {editing ? (
        <div className="mt-2">
          <NoteEditor
            initial={a.note ?? ""}
            onSave={(n) => {
              onSaveNote(n);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        a.note && <p className="mt-1.5 text-[12px] leading-relaxed whitespace-pre-wrap text-fg/80">{a.note}</p>
      )}
      {!editing && (
        <div className="absolute top-1.5 right-1.5 hidden gap-0.5 bg-surface-2/90 group-focus-within:flex group-hover:flex">
          <button
            type="button"
            aria-label={a.note ? "Edit note" : "Add note"}
            title={a.note ? "Edit note" : "Add note"}
            onClick={() => setEditing(true)}
            className="rounded p-1 text-muted hover:text-fg"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            aria-label="Delete"
            title="Delete"
            onClick={onDelete}
            className="rounded p-1 text-muted hover:text-danger"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </li>
  );
}

export function NotesPanel({
  annotations,
  canAnnotate,
  onSelect,
  onSaveNote,
  onDelete,
  onExport,
}: {
  annotations: Annotation[];
  canAnnotate: boolean;
  onSelect: (a: Annotation) => void;
  onSaveNote: (a: Annotation, note: string | null) => void;
  onDelete: (a: Annotation) => void;
  onExport: (format: "md" | "json") => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? annotations : annotations.filter((a) => a.kind === filter);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-2.5">
        <div className="flex-1">
          <Segmented
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "highlight", label: "Highlights" },
              { value: "bookmark", label: "Bookmarks" },
            ]}
          />
        </div>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Export notes"
              title="Export notes"
              disabled={!annotations.length}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
            >
              <Download size={15} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={menuContentClass} align="end" sideOffset={4}>
              <DropdownMenu.Item className={menuItemClass} onSelect={() => onExport("md")}>
                Export as Markdown…
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItemClass} onSelect={() => onExport("json")}>
                Export as JSON…
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {shown.length ? (
          <ul className="space-y-0.5">
            {shown.map((a) => (
              <Item
                key={a.id}
                a={a}
                onSelect={() => onSelect(a)}
                onSaveNote={(n) => onSaveNote(a, n)}
                onDelete={() => onDelete(a)}
              />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center px-6 pt-10 text-center text-[13px] text-muted">
            {filter === "bookmark" ? <Bookmark size={22} /> : <Highlighter size={22} />}
            <p className="mt-3">
              {filter === "bookmark"
                ? "No bookmarks yet. Press B or use the bookmark button to mark a page."
                : canAnnotate
                  ? "Select text in the book to highlight it or add a note."
                  : "Highlights aren't available for this book's format, but you can still add bookmarks."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
