/**
 * App-wide commands, triggered from the native menu or keyboard shortcuts.
 *
 * Both paths can fire for one key press (the menu's accelerator, and the webview's keydown on
 * platforms or frames where the menu doesn't swallow it), so repeats within a short window are
 * dropped. Handlers run newest first; returning true stops the event (so the reader can claim
 * "find" before the library does).
 */
import { listen } from "@tauri-apps/api/event";

export const ACTIONS = [
  "add-books",
  "add-folder",
  "find",
  "text-larger",
  "text-smaller",
  "theme-light",
  "theme-sepia",
  "theme-dark",
  "theme-contrast",
  "go-library",
  "bookmark",
] as const;

export type ActionId = (typeof ACTIONS)[number];

export const isActionId = (x: unknown): x is ActionId => ACTIONS.includes(x as ActionId);

type Handler = (id: ActionId) => boolean | void;

const DEDUPE_MS = 250;

export function createDispatcher(now: () => number = () => performance.now()) {
  const handlers: Handler[] = [];
  let last: { id: ActionId | null; at: number } = { id: null, at: -Infinity };

  return {
    /** Registers a handler; returns an unsubscribe function. */
    on(handler: Handler) {
      handlers.push(handler);
      return () => {
        const i = handlers.lastIndexOf(handler);
        if (i >= 0) handlers.splice(i, 1);
      };
    },
    dispatch(id: ActionId) {
      const t = now();
      if (last.id === id && t - last.at < DEDUPE_MS) return;
      last = { id, at: t };
      for (const h of [...handlers].reverse()) if (h(id) === true) return;
    },
  };
}

const dispatcher = createDispatcher();
export const onAction = dispatcher.on;
export const dispatchAction = dispatcher.dispatch;

/** Routes native menu clicks (emitted by Rust as "menu" events) to the dispatcher. */
export function listenForMenu() {
  return listen<string>("menu", (e) => {
    if (isActionId(e.payload)) dispatchAction(e.payload);
  });
}

/** Keyboard shortcuts mirroring the menu accelerators (keep in sync with src-tauri/src/menu.rs). */
export function shortcutFor(
  e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
): ActionId | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  switch (e.key.toLowerCase()) {
    case "o":
      return e.shiftKey ? "add-folder" : "add-books";
    case "f":
      return "find";
    case "=":
    case "+":
      return "text-larger";
    case "-":
      return "text-smaller";
    case "d":
      return "bookmark";
    case "l":
      return "go-library";
    default:
      return null;
  }
}
