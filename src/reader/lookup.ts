/** Dictionary and encyclopedia lookups for selected text, and floating-toolbar placement. */
import { isWindows } from "../lib/platform";

/** Two- or three-letter language subtag from a BCP 47 tag ("en-GB" → "en"); defaults to English. */
export function languageCode(tag: string | null | undefined): string {
  const code = (tag ?? "").toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(code) ? code : "en";
}

const tidy = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 200);

/** macOS opens the system Dictionary app; Windows has none, so use Wiktionary. */
export function defineUrl(text: string, lang?: string | null, windows = isWindows): string {
  const q = tidy(text);
  return windows
    ? `https://${languageCode(lang)}.wiktionary.org/wiki/Special:Search?search=${encodeURIComponent(q)}`
    : `dict://${encodeURIComponent(q)}`;
}

export const wikipediaUrl = (text: string, lang?: string | null) =>
  `https://${languageCode(lang)}.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(tidy(text))}`;

/** Single words get "Define"; longer selections are better served by search than a dictionary. */
export const isLookupWord = (text: string) => tidy(text).split(" ").length <= 3;

export interface Size {
  width: number;
  height: number;
}

/**
 * Positions a floating element centered over `anchor`: above it when there's room,
 * otherwise below, and always fully inside the viewport (with a margin).
 */
export function placeFloating(anchor: DOMRect, size: Size, viewport: Size, gap = 8, margin = 8) {
  const above = anchor.top - gap - size.height;
  const top = above >= margin ? above : Math.min(anchor.bottom + gap, viewport.height - size.height - margin);
  const centered = anchor.left + anchor.width / 2 - size.width / 2;
  const left = Math.max(margin, Math.min(centered, viewport.width - size.width - margin));
  return { top: Math.max(margin, top), left, placement: above >= margin ? ("above" as const) : ("below" as const) };
}
