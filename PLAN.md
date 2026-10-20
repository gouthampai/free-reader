# Free Reader — Plan of Attack

A polished, cross-platform (macOS + Windows) ereader desktop application.

## 1. Core technology choices

| Decision | Choice | Why |
|---|---|---|
| App shell | **Tauri 2** (Rust backend + web frontend) | Small installers (~10 MB vs ~100 MB for Electron), low memory use, native feel, built-in updater, file system access and signing support. |
| Frontend | **React + TypeScript + Vite** | Large ecosystem, easy to hire for. |
| Styling | **Tailwind + Radix UI primitives** | Accessible menus, dialogs and popovers without fighting a component library's look. |
| EPUB/MOBI/AZW3/FB2/CBZ rendering | **foliate-js** (MIT) | Engine behind the Foliate reader. Paginated and scrolled layouts, CFI locations, search, multiple formats. |
| PDF | **PDF.js** | The standard; wrapped behind the same reader interface. |
| Library database | **SQLite** (`rusqlite`) | Books, metadata, progress, annotations, collections. |
| Metadata and covers | Rust side | Runs on a background thread so large imports don't freeze the UI. |

**Out of scope:** DRM-protected books (Kindle, Adobe ADEPT). The app should say this clearly.

## 2. Architecture

```
┌──────────────── Frontend (React/TS) ────────────────┐
│  Library view │ Reader view │ Settings │ Annotations │
│        └──────── Reader abstraction ───────┘         │
│           (foliate-js adapter | PDF.js adapter)      │
└──────────────────────┬───────────────────────────────┘
                       │ Tauri commands / events
┌──────────────────────┴───────────────────────────────┐
│ Rust core: import pipeline, metadata/covers, SQLite,  │
│ file watching, full-text index, export, settings      │
└───────────────────────────────────────────────────────┘
```

Key rule: the reader UI only talks to a **`ReaderEngine` interface**
(`open`, `goTo(location)`, `next/prev`, `getTOC`, `search`, `highlight(range)`, `onRelocate`).
Each format plugs in behind it, so the UI is identical across formats.

## 3. Phased roadmap

### Phase 0 — Foundations (~1 week)
- [x] Scaffold Tauri 2 + React + TS; ESLint/Prettier, Vitest.
- [ ] Playwright end-to-end tests.
- [x] GitHub Actions build matrix: macOS universal (arm64 + x64) and Windows x64.
- [ ] Code signing early: Apple Developer ID + notarization; Windows certificate (Azure Trusted Signing).
- [x] Design tokens (type scale, spacing, light/dark/sepia palettes) before building screens.

### Phase 1 — MVP reader (2–3 weeks)
- [x] Open an EPUB via drag-and-drop or file picker.
- [x] Paginated and scrolled modes, TOC sidebar, progress bar, keyboard/trackpad navigation.
- [x] Typography controls: font, size, line height, margins, justification; light/dark/sepia themes.
- [x] Remember reading position per book (CFI).

**Done when:** you'd actually read a novel in it.

### Phase 2 — Library (2 weeks)
- [x] Import files/folders; copy into managed library or link in place; duplicate detection by hash.
- [x] Grid and list views with covers; sort/filter by author, series, recently read, progress.
- [x] Collections/shelves; metadata editor.
- [x] Home screen with "Continue reading".

### Phase 3 — Reading features (2–3 weeks)
- [x] Multi-color highlights, notes, bookmarks; annotations panel.
- [x] In-book search; library-wide full-text search (SQLite FTS5).
- [x] Dictionary/Wikipedia lookup on selection (system dictionary on macOS).
- [x] Export annotations to Markdown/JSON.
- [x] PDF support (via foliate-js's pdf.js integration, behind the same `ReaderEngine` interface).

### Phase 4 — Polish (2 weeks)
- [x] Smooth page-turn animations, instant startup, lazy cover loading.
- [x] Native menus, window state restore, file associations, "Open With".
- [x] Accessibility: full keyboard navigation, screen reader labels, high-contrast theme, dyslexia-friendly fonts.
- [x] Text-to-speech via OS voices (Web Speech API, which uses AVSpeechSynthesizer / SAPI-OneCore).
- [x] Empty-library onboarding; helpful errors for corrupt files.

### Phase 5 — Release (1 week)
- [ ] Auto-updater (Tauri updater, signed manifests).
- [ ] Installers: `.dmg` (macOS), MSI/NSIS (Windows); optional MSIX/Microsoft Store later.
- [ ] Opt-in crash reporting (Sentry), landing page, release notes.

### Later
- Sync between devices (self-hosted / WebDAV).
- OPDS catalogs (Project Gutenberg, Standard Ebooks).
- Calibre library import, Linux build, mobile (Tauri 2 supports iOS/Android).

## 4. Risks

1. **EPUB edge cases.** Build a test corpus early: Standard Ebooks, Gutenberg, fixed-layout, RTL and vertical scripts.
2. **WebView differences.** WebKit on macOS vs WebView2 (Chromium) on Windows; CSS columns and selection differ. Test both in CI from day one.
3. **Highlight anchoring.** Store a CFI **plus** a surrounding-text snippet as a fallback so highlights survive rendering changes.
4. **Signing and notarization.** Blocks release if left late — hence Phase 0.

## 5. Status and known follow-ups

- Phase 0 is done except Playwright and code signing (needs an Apple Developer ID and a Windows signing certificate).
- Phase 1 is implemented. It's verified end to end (open → render → metadata → progress saved); page turning, settings and the TOC still need manual QA on both OSes.
- Phase 2 is implemented. Import, dedupe, copy/link, EPUB metadata and covers (Rust), and MOBI/AZW3 metadata and covers (foliate enrichment) are verified in the running app. The library UI itself (grid/list, menus, dialogs, collections) still needs manual QA.
- Metadata extraction in Rust covers EPUB only. Other formats are filled in by the frontend via foliate-js after import, one book at a time in the background.
  If large MOBI libraries make that slow, move MOBI/FB2 parsing to Rust.
- Edited metadata lives only in the database; it's never written back to the book file.
- Phase 3 is implemented. Verified in the running app: PDF import/open/cover/progress from the production bundle,
  background full-text indexing of real EPUBs with ranked snippets, and highlights drawing without errors.
  The selection toolbar, highlight popover, notes/search panels and export still need manual QA.
- PDFs and comics (fixed layout) support reading, contents, bookmarks and progress, but not highlights or
  in-book search: foliate's fixed-layout renderer has no overlay or text layer search yet.
- The full-text index covers EPUB only. Other formats would need text extraction (Rust for MOBI/FB2, or via foliate).
- Background metadata enrichment pauses while a book is open: parsing a PDF concurrently with the reader stalls pdf.js.
- "Define" opens the macOS Dictionary app; Windows has no system dictionary, so it opens Wiktionary.
- Phase 4 is implemented. Verified in the running app:
  - window shown by the frontend after first render;
  - Finder-style opens (cold launch and while running) via a real `.app` bundle;
  - single-instance forwarding with a relative path;
  - window state saved on quit;
  - bundled fonts loading in the app and in book frames;
  - read aloud speaking through the system voices (68 on macOS) with sentence highlighting;
  - the strict CSP with no violations across library, EPUB, MOBI, PDF and dev mode.

  Not verified here (synthetic input is blocked): clicking menu items, the read-aloud bar, keyboard focus behavior,
  and anything on Windows.
- Known upstream issue: closing a book while foliate is still laying it out logs two harmless uncaught errors
  (`fonts.ready` / resize callbacks run after `Paginator.destroy()`). Worth reporting to foliate-js.
- Logs: `~/Library/Logs/com.freereader.app/` on macOS, `%LOCALAPPDATA%\com.freereader.app\logs` on Windows
  (Help → Show Log Files).
- Real-world EPUB check: `FR_CORPUS=/path/to/epubs cargo test corpus -- --ignored --nocapture` (in `src-tauri`).

## 6. Data model

Migrations live in `src-tauri/src/db.rs` and are tracked with `PRAGMA user_version`.

- `books(id, hash, path, managed, format, title, authors, series, series_index, language, publisher, description, cover_path, file_size, added_at, last_opened_at)`
- `progress(book_id, cfi, fraction, updated_at)`
- `collections(id, name)`, `collection_books(collection_id, book_id, added_at)`
- `annotations(id, book_id, kind, cfi, text, note, color, chapter, created_at, updated_at)`
- `book_sections(id, book_id, section, text)` + `book_text` (FTS5 external-content index over it, synced by triggers)
