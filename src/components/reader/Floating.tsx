import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { placeFloating } from "../../reader/lookup";

/** A fixed-position card anchored to a rect in the book (re-placed as its own size changes). */
export function Floating({ anchor, label, children }: { anchor: DOMRect; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      setPos(placeFloating(anchor, { width: r.width, height: r.height }, { width: innerWidth, height: innerHeight }));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="fixed z-40 animate-fade-in rounded-xl border border-border bg-surface text-fg shadow-panel"
    >
      {children}
    </div>
  );
}
