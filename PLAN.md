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
- [ ] Import files/folders; copy into managed library or link in place; duplicate detection by hash.
- [ ] Grid and list views with covers; sort/filter by author, series, recently read, progress.
- [ ] Collections/shelves; metadata editor.
- [ ] Home screen with "Continue reading".

### Phase 3 — Reading features (2–3 weeks)
- [ ] Multi-color highlights, notes, bookmarks; annotations panel.
- [ ] In-book search; library-wide full-text search (SQLite FTS5).
- [ ] Dictionary/Wikipedia lookup on selection (system dictionary on macOS).
- [ ] Export annotations to Markdown/JSON.
- [ ] PDF support via the second adapter.

### Phase 4 — Polish (2 weeks)
- [ ] Smooth page-turn animations, instant startup, lazy cover loading.
- [ ] Native menus, window state restore, file associations, "Open With".
- [ ] Accessibility: full keyboard navigation, screen reader labels, high-contrast theme, dyslexia-friendly fonts.
- [ ] Text-to-speech via OS voices (AVSpeechSynthesizer / SAPI-WinRT).
- [ ] Empty-library onboarding; helpful errors for corrupt files.

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
- PDF (Phase 3): foliate's `pdf.js` loads PDF.js assets with `new URL(\`vendor/pdfjs/${path}\`, import.meta.url)`, which Vite can't resolve.
  Fix by serving `vendor/foliate-js/vendor/pdfjs` as static assets.
- Security: the Tauri CSP is currently `null`. Tighten it once asset loading is settled (foliate needs `blob:` frames).
- macOS file associations send `RunEvent::Opened`, not argv. Handle that in Phase 4. (The argv path already works for Windows.)

## 6. Data model (initial)

- `books(id, hash, path, managed, format, title, authors, series, series_index, language, cover_path, added_at, last_opened_at)`
- `progress(book_id, cfi, fraction, updated_at)`
- `annotations(id, book_id, kind, cfi, text_snippet, color, note, created_at, updated_at)`
- `collections(id, name)`, `collection_books(collection_id, book_id)`
