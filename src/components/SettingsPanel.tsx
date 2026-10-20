import { RotateCcw } from "lucide-react";
import { DEFAULT_SETTINGS, LIMITS, type ReaderSettings } from "../lib/settings";
import { THEME_COLORS } from "../reader/readerCss";
import { Segmented, Slider, Toggle } from "./ui";

export function SettingsPanel({
  settings,
  onChange,
  reflowable = true,
}: {
  settings: ReaderSettings;
  onChange: (s: ReaderSettings) => void;
  /** False for fixed-layout books (PDF, comics), where only the theme applies. */
  reflowable?: boolean;
}) {
  const set = <K extends keyof ReaderSettings>(k: K, v: ReaderSettings[K]) => onChange({ ...settings, [k]: v });

  return (
    <div className="w-72 space-y-4 p-4" role="dialog" aria-label="Reading settings">
      <section>
        <div className="mb-2 text-[12px] font-semibold tracking-wider text-muted uppercase">Theme</div>
        <div className="flex gap-2" role="radiogroup" aria-label="Theme">
          {(["light", "sepia", "dark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={settings.theme === t}
              onClick={() => set("theme", t)}
              className={`flex h-12 flex-1 items-center justify-center rounded-lg border font-serif text-[15px] capitalize transition ${
                settings.theme === t ? "border-accent ring-2 ring-accent/30" : "border-border"
              }`}
              style={{ background: THEME_COLORS[t].bg, color: THEME_COLORS[t].fg }}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {reflowable ? (
        <>
          <section className="space-y-2">
            <div className="text-[12px] font-semibold tracking-wider text-muted uppercase">Text</div>
            <Segmented
              label="Font"
              value={settings.font}
              onChange={(v) => set("font", v)}
              options={[
                { value: "publisher", label: "Original", title: "Use the book's fonts" },
                { value: "serif", label: <span className="font-serif">Serif</span> },
                { value: "sans", label: "Sans" },
              ]}
            />
            <Slider
              label="Size"
              {...LIMITS.fontSize}
              value={settings.fontSize}
              format={(v) => `${v}px`}
              onChange={(v) => set("fontSize", v)}
            />
            <Slider
              label="Line spacing"
              {...LIMITS.lineHeight}
              value={settings.lineHeight}
              format={(v) => v.toFixed(1)}
              onChange={(v) => set("lineHeight", Math.round(v * 10) / 10)}
            />
            <Toggle label="Justify text" checked={settings.justify} onChange={(v) => set("justify", v)} />
            <Toggle label="Hyphenation" checked={settings.hyphenate} onChange={(v) => set("hyphenate", v)} />
          </section>

          <section className="space-y-2">
            <div className="text-[12px] font-semibold tracking-wider text-muted uppercase">Layout</div>
            <Segmented
              label="Layout"
              value={settings.flow}
              onChange={(v) => set("flow", v)}
              options={[
                { value: "paginated", label: "Pages" },
                { value: "scrolled", label: "Scroll" },
              ]}
            />
            <Slider
              label="Column width"
              {...LIMITS.maxWidth}
              value={settings.maxWidth}
              format={(v) => `${v}px`}
              onChange={(v) => set("maxWidth", v)}
            />
            <Slider
              label="Margins"
              {...LIMITS.margin}
              value={settings.margin}
              format={(v) => `${v}%`}
              onChange={(v) => set("margin", v)}
            />
            {settings.flow === "paginated" && (
              <Toggle label="Two pages on wide windows" checked={settings.spread} onChange={(v) => set("spread", v)} />
            )}
          </section>

          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_SETTINGS, theme: settings.theme })}
            className="flex items-center gap-1.5 text-[12px] text-muted hover:text-fg"
          >
            <RotateCcw size={12} /> Reset to defaults
          </button>
        </>
      ) : (
        <p className="text-[12px] leading-relaxed text-muted">
          This book has a fixed layout, so text and layout settings don't apply.
        </p>
      )}
    </div>
  );
}
