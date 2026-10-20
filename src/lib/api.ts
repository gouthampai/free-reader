import { invoke } from "@tauri-apps/api/core";

export interface Progress {
  cfi: string;
  fraction: number;
}

export interface Book {
  id: number;
  path: string;
  format: string;
  title: string | null;
  authors: string | null;
  lastOpenedAt: number | null;
  progress: Progress | null;
}

export const SUPPORTED_EXTENSIONS = ["epub", "mobi", "azw", "azw3", "fb2", "fbz", "cbz"];

export const isSupportedPath = (path: string) =>
  SUPPORTED_EXTENSIONS.includes(path.split(".").pop()?.toLowerCase() ?? "");

const MIME: Record<string, string> = {
  epub: "application/epub+zip",
  cbz: "application/vnd.comicbook+zip",
  fb2: "application/x-fictionbook+xml",
};

export const api = {
  openBook: (path: string) => invoke<Book>("open_book", { path }),
  recentBooks: (limit?: number) => invoke<Book[]>("recent_books", { limit }),
  setBookMetadata: (id: number, title: string | null, authors: string | null) =>
    invoke<void>("set_book_metadata", { id, title, authors }),
  saveProgress: (id: number, cfi: string, fraction: number) => invoke<void>("save_progress", { id, cfi, fraction }),
  removeBook: (id: number) => invoke<void>("remove_book", { id }),

  /** Loads a registered book's bytes as a File that foliate-js can open. */
  async readBookFile(book: Book): Promise<File> {
    const buf = await invoke<ArrayBuffer>("read_book", { id: book.id });
    const name = book.path.split(/[\\/]/).pop() ?? `book.${book.format}`;
    return new File([buf], name, { type: MIME[book.format] ?? "application/octet-stream" });
  },
};
