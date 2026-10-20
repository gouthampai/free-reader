import { Check } from "lucide-react";
import { onRovingKeyDown, rovingTabIndex } from "../../lib/roving";
import { HIGHLIGHT_COLORS, type HighlightColor } from "../../reader/annotations";

/**
 * Highlight color picker. With a `value` it's a radio group (recoloring an existing highlight);
 * without one each dot is an action that creates a highlight, so arrow keys only move focus.
 */
export function ColorDots({ value, onPick }: { value?: string | null; onPick: (c: HighlightColor) => void }) {
  const picking = value === undefined;
  const colors = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[];
  return (
    <div
      className="flex items-center gap-1.5"
      role={picking ? "group" : "radiogroup"}
      aria-label={picking ? "Highlight" : "Highlight color"}
      onKeyDown={(e) => onRovingKeyDown(e, { selector: "button", select: !picking })}
    >
      {colors.map((c, i) => (
        <button
          key={c}
          type="button"
          role={picking ? undefined : "radio"}
          aria-checked={picking ? undefined : value === c}
          tabIndex={rovingTabIndex(
            value === c,
            i,
            colors.some((x) => x === value),
          )}
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
