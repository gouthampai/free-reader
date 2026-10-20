import { useEffect, useRef } from "react";
import type { TocItem } from "../reader/engine";

function TocList({
  items,
  depth,
  current,
  onSelect,
}: {
  items: TocItem[];
  depth: number;
  current?: string;
  onSelect: (href: string) => void;
}) {
  return (
    <ul>
      {items.map((item, i) => {
        const active = item.href === current;
        return (
          <li key={`${item.href}-${i}`}>
            <button
              type="button"
              data-active={active || undefined}
              onClick={() => onSelect(item.href)}
              className={`block w-full truncate rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors hover:bg-surface-2 ${
                active ? "bg-surface-2 font-medium text-accent" : ""
              }`}
              style={{ paddingLeft: 10 + depth * 14 }}
              title={item.label}
            >
              {item.label.trim()}
            </button>
            {item.subitems?.length ? (
              <TocList items={item.subitems} depth={depth + 1} current={current} onSelect={onSelect} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TocPanel({
  toc,
  title,
  authors,
  current,
  onSelect,
}: {
  toc: TocItem[];
  title: string;
  authors: string;
  current?: string;
  onSelect: (href: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("[data-active]")?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <nav aria-label="Table of contents" className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3.5">
        <div className="font-serif text-[15px] leading-snug font-semibold line-clamp-2">{title}</div>
        {authors && <div className="mt-0.5 text-[12px] text-muted">{authors}</div>}
      </div>
      <div ref={ref} className="flex-1 overflow-y-auto p-2">
        {toc.length ? (
          <TocList items={toc} depth={0} current={current} onSelect={onSelect} />
        ) : (
          <p className="p-3 text-[13px] text-muted">This book has no table of contents.</p>
        )}
      </div>
    </nav>
  );
}
