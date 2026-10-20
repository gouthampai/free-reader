import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { BookOpen, Check, ChevronRight, FolderSearch, Library, Pencil, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Book, Collection } from "../../lib/api";
import { revealLabel } from "../../lib/platform";
import { menuContentClass, menuDangerItemClass, menuItemClass, menuSeparatorClass } from "../ui";

export interface BookActions {
  open(book: Book): void;
  edit(book: Book): void;
  setInCollection(collectionId: number, book: Book, member: boolean): void;
  newCollectionWith(book: Book): void;
  reveal(book: Book): void;
  remove(book: Book): void;
}

// Context and dropdown menus share the same part names; render items once for both.
type Parts = typeof ContextMenu;

function Items({
  M,
  book,
  collections,
  actions,
}: {
  M: Parts;
  book: Book;
  collections: Collection[];
  actions: BookActions;
}) {
  return (
    <>
      <M.Item className={menuItemClass} onSelect={() => actions.open(book)}>
        <BookOpen size={14} /> Open
      </M.Item>
      <M.Item className={menuItemClass} onSelect={() => actions.edit(book)}>
        <Pencil size={14} /> Edit details…
      </M.Item>
      <M.Sub>
        <M.SubTrigger className={`${menuItemClass} data-[state=open]:bg-surface-2`}>
          <Library size={14} /> Collections <ChevronRight size={14} className="ml-auto" />
        </M.SubTrigger>
        <M.Portal>
          <M.SubContent className={menuContentClass} sideOffset={4}>
            {collections.map((c) => {
              const member = book.collectionIds.includes(c.id);
              return (
                <M.CheckboxItem
                  key={c.id}
                  className={`${menuItemClass} pl-7`}
                  checked={member}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(v) => actions.setInCollection(c.id, book, v === true)}
                >
                  <M.ItemIndicator className="absolute left-2">
                    <Check size={13} />
                  </M.ItemIndicator>
                  <span className="truncate">{c.name}</span>
                </M.CheckboxItem>
              );
            })}
            {collections.length > 0 && <M.Separator className={menuSeparatorClass} />}
            <M.Item className={menuItemClass} onSelect={() => actions.newCollectionWith(book)}>
              <Plus size={14} /> New collection…
            </M.Item>
          </M.SubContent>
        </M.Portal>
      </M.Sub>
      <M.Item className={menuItemClass} onSelect={() => actions.reveal(book)}>
        <FolderSearch size={14} /> {revealLabel}
      </M.Item>
      <M.Separator className={menuSeparatorClass} />
      <M.Item className={menuDangerItemClass} onSelect={() => actions.remove(book)}>
        <Trash2 size={14} /> Remove from library…
      </M.Item>
    </>
  );
}

type MenuProps = { book: Book; collections: Collection[]; actions: BookActions; children: ReactNode };

/** Right-click menu around a book tile or row. */
export function BookContextMenu({ book, collections, actions, children }: MenuProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContentClass}>
          <Items M={ContextMenu} book={book} collections={collections} actions={actions} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** "…" button menu with the same actions, for mouse and keyboard users who don't right-click. */
export function BookDropdownMenu({ book, collections, actions, children }: MenuProps) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menuContentClass} align="end" sideOffset={4}>
          <Items M={DropdownMenu as unknown as Parts} book={book} collections={collections} actions={actions} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
