import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowUpDown, Check, ChevronDown, FilePlus, FolderPlus, LayoutGrid, List, Plus, Search, X } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { SORT_LABELS, type SortKey, type StatusFilter } from "../../lib/library";
import { modKey } from "../../lib/platform";
import type { LibraryPrefs } from "../../lib/prefs";
import { Button, IconButton, menuContentClass, menuItemClass, menuLabelClass, menuSeparatorClass } from "../ui";

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All",
  unread: "Not started",
  reading: "Reading",
  finished: "Finished",
};

function Picker<T extends string>({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted hover:bg-surface-2 hover:text-fg data-[state=open]:bg-surface-2"
        >
          {icon}
          <span className="hidden lg:inline">{options[value]}</span>
          <ChevronDown size={12} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menuContentClass} align="end" sideOffset={4}>
          <DropdownMenu.Label className={menuLabelClass}>{label}</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
            {(Object.keys(options) as T[]).map((k) => (
              <DropdownMenu.RadioItem key={k} value={k} className={`${menuItemClass} pl-7`}>
                <DropdownMenu.ItemIndicator className="absolute left-2">
                  <Check size={13} />
                </DropdownMenu.ItemIndicator>
                {options[k]}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export const SearchBox = forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void }>(
  function SearchBox({ value, onChange }, ref) {
    return (
      <div className="relative w-56 max-w-[40vw]">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onChange("")}
          placeholder="Search library"
          aria-label="Search library"
          className="h-8 w-full rounded-lg border border-border bg-surface pr-7 pl-8 text-[13px] placeholder:text-muted focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange("")}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted hover:text-fg"
          >
            <X size={13} />
          </button>
        )}
      </div>
    );
  },
);

export function AddMenu({
  copyOnImport,
  onCopyOnImportChange,
  onAddFiles,
  onAddFolder,
}: {
  copyOnImport: boolean;
  onCopyOnImportChange: (v: boolean) => void;
  onAddFiles: () => void;
  onAddFolder: () => void;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button variant="primary" className="h-8 px-3">
          <Plus size={15} /> Add
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={menuContentClass} align="end" sideOffset={4}>
          <DropdownMenu.Item className={menuItemClass} onSelect={onAddFiles}>
            <FilePlus size={14} /> Add books…
            <span className="ml-auto pl-4 text-[11px] opacity-60">{modKey}O</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={menuItemClass} onSelect={onAddFolder}>
            <FolderPlus size={14} /> Add folder…
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={menuSeparatorClass} />
          <DropdownMenu.CheckboxItem
            className={`${menuItemClass} pl-7`}
            checked={copyOnImport}
            onCheckedChange={(v) => onCopyOnImportChange(v === true)}
            onSelect={(e) => e.preventDefault()}
          >
            <DropdownMenu.ItemIndicator className="absolute left-2">
              <Check size={13} />
            </DropdownMenu.ItemIndicator>
            Copy files into library
          </DropdownMenu.CheckboxItem>
          <p className="max-w-[240px] px-2.5 pb-1.5 text-[11px] leading-snug text-muted">
            {copyOnImport
              ? "Imported books are copied, so the originals can be moved or deleted."
              : "Books stay where they are. Moving them breaks the link until re-added."}
          </p>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function ListControls({
  prefs,
  onPrefsChange,
  status,
  onStatusChange,
}: {
  prefs: LibraryPrefs;
  onPrefsChange: (p: LibraryPrefs) => void;
  status: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Picker
        icon={<Check size={13} />}
        label="Show"
        value={status}
        options={STATUS_LABELS}
        onChange={onStatusChange}
      />
      <Picker
        icon={<ArrowUpDown size={13} />}
        label="Sort by"
        value={prefs.sort}
        options={SORT_LABELS as Record<SortKey, string>}
        onChange={(sort) => onPrefsChange({ ...prefs, sort })}
      />
      <div className="mx-1 h-5 w-px bg-border" />
      <IconButton
        label="Grid view"
        active={prefs.layout === "grid"}
        onClick={() => onPrefsChange({ ...prefs, layout: "grid" })}
      >
        <LayoutGrid size={15} />
      </IconButton>
      <IconButton
        label="List view"
        active={prefs.layout === "list"}
        onClick={() => onPrefsChange({ ...prefs, layout: "list" })}
      >
        <List size={15} />
      </IconButton>
    </div>
  );
}
