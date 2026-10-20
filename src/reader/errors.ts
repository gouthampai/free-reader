/** Turns errors from opening a book into something a reader can act on. */

export type OpenErrorKind = "missing" | "damaged" | "unknown";

export interface OpenErrorInfo {
  kind: OpenErrorKind;
  title: string;
  detail: string;
}

const DAMAGED =
  /not supported|not found|empty|unsupported|central directory|zip|unexpected end|end of (data|file)|invalid|corrupt|malformed|parse|decode|not a valid|bad/i;

export function describeOpenError(error: unknown): OpenErrorInfo {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  // From read_book or the OS. (foliate's "File not found" means an empty file, i.e. damaged.)
  if (/file is missing|no such file or directory|ENOENT/i.test(message)) {
    return {
      kind: "missing",
      title: "The book file can't be found",
      detail: "It may have been moved, renamed or deleted. Go back to the library to locate it.",
    };
  }
  if (name === "UnsupportedTypeError" || DAMAGED.test(message)) {
    return {
      kind: "damaged",
      title: "This book can't be opened",
      detail: "The file seems to be damaged, incomplete, or not a supported ebook format. Try downloading it again.",
    };
  }
  return { kind: "unknown", title: "Couldn't open this book", detail: "Something went wrong while opening it." };
}
