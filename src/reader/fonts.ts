/**
 * Bundled reading fonts (SIL Open Font License): Atkinson Hyperlegible, designed for low-vision
 * readers, and OpenDyslexic. Book sections render in blob: documents, which can't resolve
 * relative URLs, so @font-face rules use absolute URLs.
 */
import atkinson400 from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2?url";
import atkinson400i from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-italic.woff2?url";
import atkinson700 from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2?url";
import atkinson700i from "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-italic.woff2?url";
import dyslexic400 from "@fontsource/opendyslexic/files/opendyslexic-latin-400-normal.woff2?url";
import dyslexic400i from "@fontsource/opendyslexic/files/opendyslexic-latin-400-italic.woff2?url";
import dyslexic700 from "@fontsource/opendyslexic/files/opendyslexic-latin-700-normal.woff2?url";
import dyslexic700i from "@fontsource/opendyslexic/files/opendyslexic-latin-700-italic.woff2?url";

export interface FontFace {
  family: string;
  weight: 400 | 700;
  style: "normal" | "italic";
  url: string;
}

export const ATKINSON = "Atkinson Hyperlegible";
export const OPEN_DYSLEXIC = "OpenDyslexic";

export const BUNDLED_FACES: FontFace[] = [
  { family: ATKINSON, weight: 400, style: "normal", url: atkinson400 },
  { family: ATKINSON, weight: 400, style: "italic", url: atkinson400i },
  { family: ATKINSON, weight: 700, style: "normal", url: atkinson700 },
  { family: ATKINSON, weight: 700, style: "italic", url: atkinson700i },
  { family: OPEN_DYSLEXIC, weight: 400, style: "normal", url: dyslexic400 },
  { family: OPEN_DYSLEXIC, weight: 400, style: "italic", url: dyslexic400i },
  { family: OPEN_DYSLEXIC, weight: 700, style: "normal", url: dyslexic700 },
  { family: OPEN_DYSLEXIC, weight: 700, style: "italic", url: dyslexic700i },
];

/** @font-face rules for `faces`, with URLs made absolute against `base`. */
export function fontFaceCss(faces: FontFace[] = BUNDLED_FACES, base: string = location.href): string {
  return faces
    .map(
      (f) =>
        `@font-face { font-family: "${f.family}"; font-weight: ${f.weight}; font-style: ${f.style}; ` +
        `font-display: swap; src: url("${new URL(f.url, base).href}") format("woff2"); }`,
    )
    .join("\n");
}

/** Registers the bundled faces in the app document, e.g. for previews in the font picker. */
export function installAppFonts() {
  const style = document.createElement("style");
  style.dataset.bundledFonts = "";
  style.textContent = fontFaceCss();
  document.head.append(style);
}
