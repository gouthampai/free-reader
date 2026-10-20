import { Copy, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Annotation } from "../../lib/api";
import { modKey } from "../../lib/platform";
import type { HighlightColor } from "../../reader/annotations";
import { Button } from "../ui";
import { ColorDots } from "./ColorDots";
import { Floating } from "./Floating";

/** Note editor shared by the popover and the notes panel. Saves on ⌘/Ctrl+Enter. */
export function NoteEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (note: string | null) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const save = () => onSave(text.trim() || null);
  return (
    <div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Add a note…"
        aria-label="Note"
        className="h-24 w-full resize-y rounded-lg border border-border bg-bg px-2.5 py-2 text-[13px] leading-relaxed placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-muted">{modKey}↵ to save</span>
        <Button className="h-7 px-2.5 text-[12px]" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" className="h-7 px-2.5 text-[12px]" onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}

/** Shown when an existing highlight is clicked: recolor, edit the note, copy or delete. */
export function AnnotationPopover({
  annotation,
  anchor,
  startEditing,
  onColor,
  onSaveNote,
  onCopy,
  onDelete,
  onClose,
}: {
  annotation: Annotation;
  anchor: DOMRect;
  startEditing: boolean;
  onColor: (c: HighlightColor) => void;
  onSaveNote: (note: string | null) => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  return (
    <>
      {/* Clicks inside the book's frame don't reach the document, so catch outside clicks here. */}
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden />
      <Floating anchor={anchor} label="Highlight">
        <div className="w-72 p-2.5">
          <div className="flex items-center gap-1">
            <ColorDots value={annotation.color} onPick={onColor} />
            <div className="flex-1" />
            {!editing && (
              <button
                type="button"
                title={annotation.note ? "Edit note" : "Add note"}
                aria-label={annotation.note ? "Edit note" : "Add note"}
                onClick={() => setEditing(true)}
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
              >
                <Pencil size={14} />
              </button>
            )}
            <button
              type="button"
              title="Copy text"
              aria-label="Copy text"
              onClick={onCopy}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              title="Delete highlight"
              aria-label="Delete highlight"
              onClick={onDelete}
              className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          </div>
          {editing ? (
            <div className="mt-2.5">
              <NoteEditor
                initial={annotation.note ?? ""}
                onSave={(n) => {
                  onSaveNote(n);
                  setEditing(false);
                }}
                onCancel={() => (startEditing && !annotation.note ? onClose() : setEditing(false))}
              />
            </div>
          ) : (
            annotation.note && (
              <p className="mt-2.5 max-h-40 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap">
                {annotation.note}
              </p>
            )
          )}
        </div>
      </Floating>
    </>
  );
}
