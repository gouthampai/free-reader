export const isWindows = typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

/** Display prefix for keyboard shortcuts: "⌘O" on macOS, "Ctrl+O" on Windows. */
export const modKey = isWindows ? "Ctrl+" : "⌘";

export const revealLabel = isWindows ? "Show in Explorer" : "Show in Finder";
