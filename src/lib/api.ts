import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface Progress {
  cfi: string;
  fraction: number;
}

export interface Metadata {
  title: string | null;
  /** Multiple authors are joined with " & ". */
  authors: string | null;
  series: string | null;
  seriesIndex: number | null;
  language: string | null;
  publisher: string | null;
  description: string | null;
}

export interface Book extends Metadata {
  id: number;
  path: string;
  format: string;
  coverPath: string | null;
  /** True when the file is a copy in the app's library folder (deleted with the book). */
  managed: boolean;
  fileSize: number | null;
  addedAt: number;
  lastOpenedAt: number | null;
  progress: Progress | null;
  collectionIds: number[];
}

export interface Collection {
  id: number;
  name: string;
  bookCount: number;
}

export interface ImportSummary {
  added: number[];
  duplicates: number[];
  failed: { path: string; error: string }[];
}

export interface ImportProgress {
  done: number;
  total: number;
  current: string;
}

export type AnnotationKind = "highlight" | "bookmark";

export interface Annotation {
  id: number;
  bookId: number;
  kind: AnnotationKind;
  cfi: string;
  /** Highlighted text, or a page excerpt for bookmarks. */
  text: string | null;
  note: string | null;
  color: string | null;
  chapter: string | null;
  createdAt: number;
  updatedAt: number;
}

export type NewAnnotation = Pick<Annotation, "kind" | "cfi" | "text" | "note" | "color" | "chapter">;

export interface TextHit {
  bookId: number;
  sections: number;
  /** Snippets with matches wrapped in \u0002 … \u0003. */
  snippets: string[];
}

export interface IndexStatus {
  pending: number;
  indexed: number;
}

export const SUPPORTED_EXTENSIONS = ["epub", "mobi", "azw", "azw3", "fb2", "fbz", "cbz", "pdf"];

const MIME: Record<string, string> = {
  epub: "application/epub+zip",
  cbz: "application/vnd.comicbook+zip",
  fb2: "application/x-fictionbook+xml",
  pdf: "application/pdf",
};

export const coverUrl = (book: Book) => (book.coverPath ? convertFileSrc(book.coverPath) : null);

export const api = {
  importBooks: (paths: string[], copy: boolean) => invoke<ImportSummary>("import_books", { paths, copy }),
  onImportProgress: (cb: (p: ImportProgress) => void) =>
    listen<ImportProgress>("import-progress", (e) => cb(e.payload)),
  listBooks: () => invoke<Book[]>("list_books"),
  markOpened: (id: number) => invoke<Book>("mark_opened", { id }),
  updateMetadata: (id: number, metadata: Metadata) => invoke<Book>("update_metadata", { id, metadata }),
  fillMissingMetadata: (id: number, metadata: Partial<Metadata>) =>
    invoke<void>("fill_missing_metadata", { id, metadata }),
  setCoverBytes: async (id: number, image: Blob) =>
    invoke<Book>("set_cover_bytes", new Uint8Array(await image.arrayBuffer()), {
      headers: { "x-book-id": String(id) },
    }),
  setCoverFromFile: (id: number, path: string) => invoke<Book>("set_cover_from_file", { id, path }),
  saveProgress: (id: number, cfi: string, fraction: number) => invoke<void>("save_progress", { id, cfi, fraction }),
  removeBook: (id: number) => invoke<void>("remove_book", { id }),
  listCollections: () => invoke<Collection[]>("list_collections"),
  createCollection: (name: string) => invoke<number>("create_collection", { name }),
  renameCollection: (id: number, name: string) => invoke<void>("rename_collection", { id, name }),
  deleteCollection: (id: number) => invoke<void>("delete_collection", { id }),
  setInCollection: (collectionId: number, bookIds: number[], member: boolean) =>
    invoke<void>("set_in_collection", { collectionId, bookIds, member }),
  listAnnotations: (bookId: number) => invoke<Annotation[]>("list_annotations", { bookId }),
  addAnnotation: (bookId: number, annotation: NewAnnotation) =>
    invoke<Annotation>("add_annotation", { bookId, annotation }),
  updateAnnotation: (id: number, note: string | null, color?: string) =>
    invoke<Annotation>("update_annotation", { id, note, color: color ?? null }),
  deleteAnnotation: (id: number) => invoke<void>("delete_annotation", { id }),
  searchText: (query: string) => invoke<TextHit[]>("search_text", { query }),
  indexStatus: () => invoke<IndexStatus>("index_status"),
  takeLaunchPath: () => invoke<string | null>("take_launch_path"),

  /** Loads a registered book's bytes as a File that foliate-js can open. */
  async readBookFile(book: Book): Promise<File> {
    const buf = await invoke<ArrayBuffer>("read_book", { id: book.id });
    const name = book.path.split(/[\\/]/).pop() ?? `book.${book.format}`;
    return new File([buf], name, { type: MIME[book.format] ?? "application/octet-stream" });
  },
};
