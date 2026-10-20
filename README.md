# Free Reader

A polished, cross-platform ereader for macOS and Windows, built with Tauri 2, React and TypeScript.
Rendering is powered by [foliate-js](https://github.com/johnfactotum/foliate-js) (vendored in `vendor/foliate-js`).

See [PLAN.md](PLAN.md) for the roadmap.

## Supported formats

EPUB, MOBI/AZW/AZW3, FB2/FBZ, CBZ and PDF. Highlights and in-book search work for reflowable formats
(not PDF or comics). DRM-protected books are not supported.

## Accessibility

Light, sepia, dark and high-contrast themes; Atkinson Hyperlegible and OpenDyslexic fonts (bundled,
OFL); read aloud with the system voices; full keyboard navigation; screen reader labels and page
announcements; and page-turn animation that follows the OS "reduce motion" setting.

## Development

Prerequisites: Node 24 LTS (`nvm use` reads `.nvmrc`), pnpm, Rust (via [rustup](https://rustup.rs)), and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS
(Xcode Command Line Tools on macOS; WebView2 and MSVC build tools on Windows).

```sh
nvm use                     # switch to Node 24
pnpm install                # install JS deps
pnpm tauri dev              # run the app with hot reload
pnpm tauri dev -- /abs/path/book.epub  # open a book on launch
```

Checks:

```sh
pnpm lint && pnpm typecheck && pnpm test   # frontend
(cd src-tauri && cargo test)               # backend
```

Release build: `pnpm tauri build`.

`pnpm-workspace.yaml` sets `minimumReleaseAge` so pnpm only installs package versions that have been public for at least two weeks.

## Layout

```
src/
  App.tsx                 app shell: library ↔ reader, adding books, drag-and-drop
  components/library/     sidebar, home, grid/list, book menus, metadata & import UI
  components/Reader.tsx   reader chrome, TOC and settings panels
  hooks/useLibrary.ts     library state, import progress, background enrichment
  reader/engine.ts        ReaderEngine interface — the UI talks only to this
  reader/foliateEngine.ts foliate-js implementation of ReaderEngine
  reader/enrich.ts        fills metadata/covers for non-EPUB formats via foliate-js
  reader/annotations.ts   highlight colors, CFI ordering, Markdown/JSON export
  reader/lookup.ts        dictionary/Wikipedia URLs, floating toolbar placement
  components/reader/      selection toolbar, highlight popover, notes & search panels
  reader/readerCss.ts     user reading preferences → CSS injected into the book
  lib/api.ts              typed wrappers for Tauri commands
  lib/library.ts          sorting, filtering, grouping (authors/series)
  lib/settings.ts         reader settings; lib/prefs.ts library view prefs
src-tauri/src/
  commands.rs             Tauri commands
  library.rs              import pipeline: discover, hash/dedupe, copy or link
  epub.rs                 fast EPUB metadata, cover and text extraction
  annotations.rs          highlights, notes, bookmarks
  fulltext.rs             FTS5 index, background indexer thread, search
  covers.rs               cover thumbnails (served via the asset protocol)
  db.rs                   SQLite schema, migrations and queries
vendor/foliate-js/        vendored rendering engine (MIT), pinned to 78914ae
```

Logs (webview errors included) go to stdout and the OS log directory; Help → Show Log Files opens it.

Library data lives in the OS app-data directory: `library.db`, `covers/`, and `books/`
(managed copies of imported books, when "Copy files into library" is on). That directory is
in `~/Library/Application Support/com.freereader.app/` on macOS and
`%APPDATA%\com.freereader.app\` on Windows.

## Keyboard shortcuts

| Key | Action |
|---|---|
| ← / → | Previous / next page |
| Space, PageDown / Shift+Space, PageUp | Next / previous page (paginated) |
| T | Toggle table of contents |
| B | Bookmark / unbookmark the current page |
| ⌘/Ctrl + F | Search the book (in the reader) or the library |
| ⌘/Ctrl + `=` / `-` | Larger / smaller text |
| ⌘/Ctrl + O / ⌘/Ctrl + Shift + O | Add books / add a folder |
| ⌘/Ctrl + L | Back to the library |
| ⌘/Ctrl + D | Bookmark the current page (same as B) |
| Esc | Stop reading aloud, close panel, then back to library |

Option groups (themes, fonts, highlight colors, sidebar tabs) are a single Tab stop; use the arrow keys
inside them.
