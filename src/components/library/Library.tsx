import { ask } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Book, type Collection } from "../../lib/api";
import {
  displayTitle,
  filterBooks,
  groupByAuthor,
  groupBySeries,
  sortBooks,
  type BookFilter,
  type StatusFilter,
} from "../../lib/library";
import { onAction } from "../../lib/actions";
import type { LibraryPrefs } from "../../lib/prefs";
import { BookGrid } from "./BookGrid";
import { BookList } from "./BookList";
import type { BookActions } from "./BookMenu";
import { GroupIndex } from "./GroupIndex";
import { EmptyLibrary, HomeView } from "./HomeView";
import { MetadataDialog } from "./MetadataDialog";
import { NameDialog } from "./NameDialog";
import { Sidebar } from "./Sidebar";
import { TextSearchResults } from "./TextSearchResults";
import { AddMenu, ListControls, SearchBox } from "./Toolbar";
import type { LibraryView } from "./views";

type NamePrompt = { mode: "create"; bookId?: number } | { mode: "rename"; collection: Collection };

export function Library({
  books,
  collections,
  loaded,
  refresh,
  prefs,
  onPrefsChange,
  dragging,
  onOpenBook,
  onAddFiles,
  onAddFolder,
  onError,
}: {
  books: Book[];
  collections: Collection[];
  loaded: boolean;
  refresh: () => Promise<unknown>;
  prefs: LibraryPrefs;
  onPrefsChange: (p: LibraryPrefs) => void;
  dragging: boolean;
  onOpenBook: (b: Book, opts?: { search?: string }) => void;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onError: (message: string) => void;
}) {
  const [view, setView] = useState<LibraryView>({ kind: "home" });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<Book | null>(null);
  const [namePrompt, setNamePrompt] = useState<NamePrompt | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const fail = (e: unknown) => onError(String(e));

  const navigate = (v: LibraryView) => {
    setView(v);
    setQuery("");
    mainRef.current?.scrollTo({ top: 0 });
  };

  useEffect(
    () =>
      onAction((id) => {
        if (id !== "find") return;
        searchRef.current?.focus();
        searchRef.current?.select();
        return true;
      }),
    [],
  );

  // A collection that was deleted elsewhere shouldn't leave us on a dead view.
  useEffect(() => {
    if (view.kind === "collection" && loaded && !collections.some((c) => c.id === view.id)) setView({ kind: "home" });
  }, [view, collections, loaded]);

  const actions: BookActions = {
    open: (b) => onOpenBook(b),
    edit: setEditing,
    setInCollection: (cid, book, member) => api.setInCollection(cid, [book.id], member).then(refresh).catch(fail),
    newCollectionWith: (book) => setNamePrompt({ mode: "create", bookId: book.id }),
    reveal: (book) => revealItemInDir(book.path).catch(fail),
    remove: async (book) => {
      const ok = await ask(
        book.managed
          ? "The book's file will be deleted from your library folder. Reading progress is also removed."
          : "The file stays where it is on disk. Reading progress is removed.",
        { title: `Remove “${displayTitle(book)}”?`, kind: "warning", okLabel: "Remove", cancelLabel: "Cancel" },
      );
      if (ok) await api.removeBook(book.id).then(refresh).catch(fail);
    },
  };

  const deleteCollection = async (c: Collection) => {
    const ok = await ask("Books in it stay in your library.", {
      title: `Delete the collection “${c.name}”?`,
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (ok) await api.deleteCollection(c.id).then(refresh).catch(fail);
  };

  const submitName = async (name: string) => {
    if (!namePrompt) return;
    if (namePrompt.mode === "rename") {
      await api.renameCollection(namePrompt.collection.id, name);
    } else {
      const id = await api.createCollection(name);
      if (namePrompt.bookId != null) await api.setInCollection(id, [namePrompt.bookId], true);
      else navigate({ kind: "collection", id });
    }
    await refresh();
  };

  // Searching from Home or an index searches the whole library.
  const effective: LibraryView = useMemo(
    () =>
      query && (view.kind === "home" || view.kind === "authors" || view.kind === "series-index")
        ? { kind: "all" }
        : view,
    [query, view],
  );

  const listed = useMemo(() => {
    const f: BookFilter = { query, status };
    if (effective.kind === "collection") f.collectionId = effective.id;
    if (effective.kind === "author") f.author = effective.name;
    if (effective.kind === "series") f.series = effective.name;
    const sort = effective.kind === "series" ? "series" : prefs.sort;
    return sortBooks(filterBooks(books, f), sort);
  }, [books, effective, query, status, prefs.sort]);

  const collection = effective.kind === "collection" ? collections.find((c) => c.id === effective.id) : undefined;

  const header: { title: string; back?: LibraryView } = (() => {
    switch (effective.kind) {
      case "home":
        return { title: "Home" };
      case "all":
        return { title: query ? "Search results" : "All Books" };
      case "authors":
        return { title: "Authors" };
      case "series-index":
        return { title: "Series" };
      case "author":
        return { title: effective.name, back: { kind: "authors" } };
      case "series":
        return { title: effective.name, back: { kind: "series-index" } };
      case "collection":
        return { title: collection?.name ?? "Collection" };
    }
  })();

  const isList =
    effective.kind === "all" ||
    effective.kind === "collection" ||
    effective.kind === "author" ||
    effective.kind === "series";

  const emptyMessage = query
    ? "No titles, authors or series match."
    : status !== "all"
      ? "No books match."
      : effective.kind === "collection"
        ? "This collection is empty. Right-click a book and choose Collections to add it."
        : "No books yet.";

  return (
    <div className="flex h-full">
      <Sidebar
        view={view}
        onNavigate={navigate}
        bookCount={books.length}
        collections={collections}
        onNewCollection={() => setNamePrompt({ mode: "create" })}
        onRenameCollection={(c) => setNamePrompt({ mode: "rename", collection: c })}
        onDeleteCollection={deleteCollection}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header data-tauri-drag-region className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
          {header.back && (
            <button
              type="button"
              aria-label="Back"
              onClick={() => navigate(header.back!)}
              className="-ml-2 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg"
            >
              <ChevronLeft size={17} />
            </button>
          )}
          <h1 data-tauri-drag-region className="min-w-0 truncate text-[15px] font-semibold tracking-tight">
            {header.title}
          </h1>
          {isList && <span className="text-[12px] text-muted tabular-nums">{listed.length}</span>}
          <div data-tauri-drag-region className="flex-1" />
          {isList && books.length > 0 && (
            <ListControls prefs={prefs} onPrefsChange={onPrefsChange} status={status} onStatusChange={setStatus} />
          )}
          {books.length > 0 && <SearchBox ref={searchRef} value={query} onChange={setQuery} />}
          <AddMenu
            copyOnImport={prefs.copyOnImport}
            onCopyOnImportChange={(copyOnImport) => onPrefsChange({ ...prefs, copyOnImport })}
            onAddFiles={onAddFiles}
            onAddFolder={onAddFolder}
          />
        </header>

        <main ref={mainRef} className="relative flex-1 overflow-y-auto px-6 py-6">
          {!loaded ? null : books.length === 0 ? (
            <EmptyLibrary onAddFiles={onAddFiles} onAddFolder={onAddFolder} />
          ) : effective.kind === "home" ? (
            <HomeView
              books={books}
              collections={collections}
              actions={actions}
              onShowAll={() => navigate({ kind: "all" })}
            />
          ) : effective.kind === "authors" ? (
            <GroupIndex
              groups={groupByAuthor(books)}
              empty="No authors yet."
              onSelect={(name) => navigate({ kind: "author", name })}
            />
          ) : effective.kind === "series-index" ? (
            <GroupIndex
              groups={groupBySeries(books)}
              empty="No series yet. Series are read from book metadata, or you can set one with Edit details."
              onSelect={(name) => navigate({ kind: "series", name })}
            />
          ) : listed.length === 0 ? (
            <p className={query ? "text-[13px] text-muted" : "pt-10 text-center text-muted"}>{emptyMessage}</p>
          ) : prefs.layout === "list" ? (
            <BookList
              books={listed}
              collections={collections}
              actions={actions}
              sort={effective.kind === "series" ? "series" : prefs.sort}
              onSort={(sort) => onPrefsChange({ ...prefs, sort })}
            />
          ) : (
            <BookGrid
              books={listed}
              collections={collections}
              actions={actions}
              showSeries={effective.kind === "series" || prefs.sort === "series"}
            />
          )}

          {query && books.length > 0 && (
            <TextSearchResults query={query} books={books} onOpen={(b, q) => onOpenBook(b, { search: q })} />
          )}

          {dragging && (
            <div className="pointer-events-none fixed inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-surface/85 text-[15px] font-medium text-accent">
              Drop books or folders to add them
            </div>
          )}
        </main>
      </div>

      <MetadataDialog book={editing} onClose={() => setEditing(null)} onSaved={() => void refresh()} />
      <NameDialog
        open={namePrompt != null}
        title={namePrompt?.mode === "rename" ? "Rename collection" : "New collection"}
        initial={namePrompt?.mode === "rename" ? namePrompt.collection.name : ""}
        confirmLabel={namePrompt?.mode === "rename" ? "Rename" : "Create"}
        onSubmit={submitName}
        onClose={() => setNamePrompt(null)}
      />
    </div>
  );
}
