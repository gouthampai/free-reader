export const THEMES = ["light", "sepia", "dark", "contrast"] as const;
export type Theme = (typeof THEMES)[number];
export type Flow = "paginated" | "scrolled";
export type FontChoice = "publisher" | "serif" | "sans";

export interface ReaderSettings {
  theme: Theme;
  flow: Flow;
  font: FontChoice;
  /** Base font size in px. */
  fontSize: number;
  lineHeight: number;
  /** Maximum text column width in px. */
  maxWidth: number;
  /** Gap between/around columns as a percentage of the page. */
  margin: number;
  justify: boolean;
  hyphenate: boolean;
  /** Allow two-page spreads on wide windows (paginated only). */
  spread: boolean;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: "light",
  flow: "paginated",
  font: "publisher",
  fontSize: 18,
  lineHeight: 1.5,
  maxWidth: 720,
  margin: 6,
  justify: true,
  hyphenate: true,
  spread: true,
};

export const LIMITS = {
  fontSize: { min: 12, max: 36, step: 1 },
  lineHeight: { min: 1.1, max: 2.2, step: 0.1 },
  maxWidth: { min: 480, max: 1200, step: 40 },
  margin: { min: 2, max: 16, step: 1 },
} as const;

/** Changes the font size by `delta` px, within limits. */
export const stepFontSize = (s: ReaderSettings, delta: number): ReaderSettings => ({
  ...s,
  fontSize: Math.min(LIMITS.fontSize.max, Math.max(LIMITS.fontSize.min, s.fontSize + delta)),
});

const KEY = "free-reader:settings:v1";

const clamp = (v: unknown, { min, max }: { min: number; max: number }, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

/** Validates untrusted (stored) input, falling back to defaults field by field. */
export function sanitizeSettings(raw: unknown): ReaderSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    theme: oneOf(r.theme, THEMES, d.theme),
    flow: oneOf(r.flow, ["paginated", "scrolled"] as const, d.flow),
    font: oneOf(r.font, ["publisher", "serif", "sans"] as const, d.font),
    fontSize: clamp(r.fontSize, LIMITS.fontSize, d.fontSize),
    lineHeight: clamp(r.lineHeight, LIMITS.lineHeight, d.lineHeight),
    maxWidth: clamp(r.maxWidth, LIMITS.maxWidth, d.maxWidth),
    margin: clamp(r.margin, LIMITS.margin, d.margin),
    justify: typeof r.justify === "boolean" ? r.justify : d.justify,
    hyphenate: typeof r.hyphenate === "boolean" ? r.hyphenate : d.hyphenate,
    spread: typeof r.spread === "boolean" ? r.spread : d.spread,
  };
}

export function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable; settings just won't persist this session.
  }
}
