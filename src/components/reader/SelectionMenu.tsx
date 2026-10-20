import { BookA, Copy, Globe, Search, StickyNote } from "lucide-react";
import type { HighlightColor } from "../../reader/annotations";
import type { TextSelection } from "../../reader/engine";
import { isLookupWord } from "../../reader/lookup";
import { ColorDots } from "./ColorDots";
import { Floating } from "./Floating";

function Action({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** Toolbar shown over a fresh text selection. */
export function SelectionMenu({
  selection,
  canAnnotate,
  canSearch,
  onHighlight,
  onNote,
  onCopy,
  onDefine,
  onWikipedia,
  onSearch,
}: {
  selection: TextSelection;
  canAnnotate: boolean;
  canSearch: boolean;
  onHighlight: (c: HighlightColor) => void;
  onNote: () => void;
  onCopy: () => void;
  onDefine: () => void;
  onWikipedia: () => void;
  onSearch: () => void;
}) {
  return (
    <Floating anchor={selection.rect} label="Selection actions">
      <div className="flex items-center gap-1 p-1.5">
        {canAnnotate && selection.cfi && (
          <>
            <div className="px-1.5">
              <ColorDots onPick={onHighlight} />
            </div>
            <div className="mx-0.5 h-5 w-px bg-border" />
            <Action label="Note" icon={<StickyNote size={14} />} onClick={onNote} />
          </>
        )}
        <Action label="Copy" icon={<Copy size={14} />} onClick={onCopy} />
        {isLookupWord(selection.text) && <Action label="Define" icon={<BookA size={14} />} onClick={onDefine} />}
        <Action label="Wikipedia" icon={<Globe size={14} />} onClick={onWikipedia} />
        {canSearch && <Action label="Find" icon={<Search size={14} />} onClick={onSearch} />}
      </div>
    </Floating>
  );
}
