/**
 * Roving focus for radio groups and tab lists (WAI-ARIA pattern): the group is one tab stop, and
 * arrow keys / Home / End move between options and select them.
 */
import type { KeyboardEvent } from "react";

/** tabIndex for an option: only the selected one (or the first, if none is) is tabbable. */
export const rovingTabIndex = (selected: boolean, index: number, anySelected: boolean) =>
  selected || (!anySelected && index === 0) ? 0 : -1;

/** Index to move to for `key`, or null if the key isn't a navigation key. Wraps around. */
export function nextIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * onKeyDown for the group container. `select` also activates the newly focused option (radio
 * groups and tabs); turn it off for groups of action buttons, where activating has side effects.
 */
export function onRovingKeyDown(
  e: KeyboardEvent<HTMLElement>,
  { selector = '[role="radio"]', select = true }: { selector?: string; select?: boolean } = {},
) {
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(selector));
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next = nextIndex(e.key, Math.max(current, 0), items.length);
  if (next == null) return;
  e.preventDefault();
  e.stopPropagation(); // don't also turn the page
  items[next].focus();
  if (select) items[next].click();
}
