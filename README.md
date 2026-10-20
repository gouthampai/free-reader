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
  App.tsx                 app shell: library ↔ reader, file open, drag-and-drop
  components/             Library, Reader, TOC and settings panels, UI primitives
  reader/engine.ts        ReaderEngine interface — the UI talks only to this
  reader/foliateEngine.ts foliate-js implementation of ReaderEngine
  reader/readerCss.ts     user reading preferences → CSS injected into the book
  lib/api.ts              typed wrappers for Tauri commands
  lib/settings.ts         reader settings, validation, persistence
src-tauri/src/
  commands.rs             Tauri commands (open/read book, progress, metadata)
  db.rs                   SQLite schema, migrations and queries
vendor/foliate-js/        vendored rendering engine (MIT), pinned to 78914ae
```

The library database lives in the OS app-data directory
(`~/Library/Application Support/com.freereader.app/library.db` on macOS,
`%APPDATA%\com.freereader.app\library.db` on Windows).

## Keyboard shortcuts

| Key | Action |
|---|---|
| ← / → | Previous / next page |
| Space, PageDown / Shift+Space, PageUp | Next / previous page (paginated) |
| T | Toggle table of contents |
| ⌘/Ctrl + `=` / `-` | Larger / smaller text |
| ⌘/Ctrl + O | Open a book |
| Esc | Close panel, then back to library |
