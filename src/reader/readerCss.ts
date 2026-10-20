import type { FontChoice, ReaderSettings, Theme } from "../lib/settings";

/** Colors used inside the book frame. Keep in sync with the app tokens in index.css. */
export const THEME_COLORS: Record<Theme, { bg: string; fg: string; link: string }> = {
  light: { bg: "#fbfaf7", fg: "#1f1d1a", link: "#2f5fa7" },
  sepia: { bg: "#f4ecd8", fg: "#3b2f20", link: "#8a4b14" },
  dark: { bg: "#17171a", fg: "#d9d6cf", link: "#8fb4ff" },
  contrast: { bg: "#000000", fg: "#ffffff", link: "#ffd400" },
};

const SELECTION: Record<Theme, string> = {
  light: "background: #b9d3ff;",
  sepia: "background: #b9d3ff;",
  dark: "background: #3d5a8a;",
  // Inverted, so selected text stays maximally legible.
  contrast: "background: #ffd400; color: #000000;",
};

export const FONT_STACKS: Record<Exclude<FontChoice, "publisher">, string> = {
  serif: `"Iowan Old Style", "Palatino Linotype", Palatino, Charter, Georgia, serif`,
  sans: `-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`,
};

/** CSS injected into every section of the book to apply the user's reading preferences. */
export function buildReaderCss(s: ReaderSettings): string {
  const c = THEME_COLORS[s.theme];
  const isDark = s.theme === "dark" || s.theme === "contrast";
  const font =
    s.font === "publisher"
      ? ""
      : `
    body, p, li, blockquote, dd, dt, div, span, h1, h2, h3, h4, h5, h6, td, th {
        font-family: ${FONT_STACKS[s.font]} !important;
    }`;
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
        color-scheme: ${isDark ? "dark" : "light"};
        font-size: ${s.fontSize}px !important;
        color: ${c.fg} !important;
        background: ${c.bg} !important;
    }
    body {
        color: inherit !important;
        background: transparent !important;
    }
    a:link, a:visited { color: ${c.link} !important; }
    p, li, blockquote, dd {
        line-height: ${s.lineHeight} !important;
        text-align: ${s.justify ? "justify" : "start"};
        -webkit-hyphens: ${s.hyphenate ? "auto" : "manual"};
        hyphens: ${s.hyphenate ? "auto" : "manual"};
        -webkit-hyphenate-limit-before: 3;
        -webkit-hyphenate-limit-after: 2;
        -webkit-hyphenate-limit-lines: 2;
        hanging-punctuation: allow-end last;
        widows: 2;
    }
    [align="left"] { text-align: left; }
    [align="right"] { text-align: right; }
    [align="center"] { text-align: center; }
    [align="justify"] { text-align: justify; }
    pre { white-space: pre-wrap !important; }
    ${s.theme === "dark" ? "img, svg { filter: brightness(0.9); }" : ""}
    ::selection { ${SELECTION[s.theme]} }
    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] { display: none; }
    ${font}
  `;
}
