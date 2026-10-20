import { Check } from "lucide-react";
import { HIGHLIGHT_COLORS, type HighlightColor } from "../../reader/annotations";

export function ColorDots({ value, onPick }: { value?: string | null; onPick: (c: HighlightColor) => void }) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Highlight color">
      {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={`${HIGHLIGHT_COLORS[c].label} highlight`}
          title={HIGHLIGHT_COLORS[c].label}
          onClick={() => onPick(c)}
          className="flex h-6 w-6 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent"
          style={{ background: HIGHLIGHT_COLORS[c].fill }}
        >
          {value === c && <Check size={13} className="text-black/70" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}
