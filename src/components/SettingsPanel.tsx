import { RotateCcw } from "lucide-react";
import { DEFAULT_SETTINGS, LIMITS, THEMES, type FontChoice, type ReaderSettings, type Theme } from "../lib/settings";
import { FONT_STACKS, THEME_COLORS } from "../reader/readerCss";
import { Segmented, Slider, Toggle } from "./ui";

const THEME_LABELS: Record<Theme, string> = { light: "Light", sepia: "Sepia", dark: "Dark", contrast: "High contrast" };

const FONT_OPTIONS: { value: FontChoice; label: string; title: string }[] = [
  { value: "publisher", label: "Original", title: "Use the book's fonts" },
  { value: "serif", label: "Serif", title: "Serif" },
  { value: "sans", label: "Sans", title: "Sans-serif" },
  { value: "atkinson", label: "Hyperlegible", title: "Atkinson Hyperlegible, designed for low-vision readers" },
  { value: "dyslexic", label: "Dyslexic", title: "OpenDyslexic, designed for readers with dyslexia" },
];

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
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={settings.theme === t}
              onClick={() => set("theme", t)}
              title={THEME_LABELS[t]}
              className={`flex h-12 flex-1 items-center justify-center rounded-lg border font-serif text-[14px] transition ${
                settings.theme === t ? "border-accent ring-2 ring-accent/30" : "border-border"
              }`}
              style={{ background: THEME_COLORS[t].bg, color: THEME_COLORS[t].fg }}
            >
              {t === "contrast" ? "Contrast" : THEME_LABELS[t]}
            </button>
          ))}
        </div>
      </section>

      {reflowable ? (
        <>
          <section className="space-y-2">
            <div className="text-[12px] font-semibold tracking-wider text-muted uppercase">Text</div>
            <div role="radiogroup" aria-label="Font" className="grid grid-cols-3 gap-1">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={settings.font === f.value}
                  title={f.title}
                  onClick={() => set("font", f.value)}
                  style={f.value === "publisher" ? undefined : { fontFamily: FONT_STACKS[f.value] }}
                  className={`h-9 truncate rounded-md px-1.5 text-[12px] transition ${
                    settings.font === f.value ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-fg"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
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
