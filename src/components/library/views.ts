export type LibraryView =
  | { kind: "home" }
  | { kind: "all" }
  | { kind: "authors" }
  | { kind: "series-index" }
  | { kind: "author"; name: string }
  | { kind: "series"; name: string }
  | { kind: "collection"; id: number };

export const sameView = (a: LibraryView, b: LibraryView) => JSON.stringify(a) === JSON.stringify(b);
