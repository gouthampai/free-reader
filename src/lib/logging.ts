/** Forwards webview errors to the Rust log (stdout + log file), where they're visible outside devtools. */
import { error, warn } from "@tauri-apps/plugin-log";

function stringify(x: unknown): string {
  if (x instanceof Error) return x.stack ? `${x.message}\n${x.stack}` : x.message;
  if (typeof x === "string") return x;
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

export const formatArgs = (args: unknown[]) => args.map(stringify).join(" ");

export function forwardConsoleToLog() {
  for (const [level, send] of [
    ["error", error],
    ["warn", warn],
  ] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      send(formatArgs(args)).catch(() => {});
    };
  }
  window.addEventListener("error", (e) => {
    error(`Uncaught ${formatArgs([e.error ?? e.message])} (${e.filename}:${e.lineno})`).catch(() => {});
  });
  window.addEventListener("unhandledrejection", (e) => {
    error(`Unhandled rejection: ${formatArgs([e.reason])}`).catch(() => {});
  });
}
