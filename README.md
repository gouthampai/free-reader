# Free Reader

A polished, cross-platform ereader for macOS and Windows, built with Tauri 2, React and TypeScript.
Rendering is powered by [foliate-js](https://github.com/johnfactotum/foliate-js) (vendored in `vendor/foliate-js`).

See [PLAN.md](PLAN.md) for the roadmap.

## Supported formats

EPUB, MOBI/AZW/AZW3, FB2/FBZ and CBZ. PDF support is planned (Phase 3). DRM-protected books are not supported.

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
  reader/readerCss.ts     user reading preferences → CSS injected into the book
  lib/api.ts              typed wrappers for Tauri commands
  lib/library.ts          sorting, filtering, grouping (authors/series)
  lib/settings.ts         reader settings; lib/prefs.ts library view prefs
src-tauri/src/
  commands.rs             Tauri commands
  library.rs              import pipeline: discover, hash/dedupe, copy or link
  epub.rs                 fast EPUB metadata + cover extraction
  covers.rs               cover thumbnails (served via the asset protocol)
  db.rs                   SQLite schema, migrations and queries
vendor/foliate-js/        vendored rendering engine (MIT), pinned to 78914ae
```

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
| ⌘/Ctrl + `=` / `-` | Larger / smaller text |
| ⌘/Ctrl + O | Add books |
| ⌘/Ctrl + F | Search the library |
| Esc | Close panel, then back to library |
