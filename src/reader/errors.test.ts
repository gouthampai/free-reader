import { describe, expect, it } from "vitest";
import { describeOpenError } from "./errors";

const named = (name: string, message: string) => Object.assign(new Error(message), { name });

describe("describeOpenError", () => {
  it("recognizes missing files from the backend", () => {
    expect(describeOpenError("The file is missing: /books/a.epub").kind).toBe("missing");
    expect(describeOpenError(new Error("No such file or directory (os error 2)")).kind).toBe("missing");
  });

  it("recognizes damaged or unsupported files", () => {
    expect(describeOpenError(named("UnsupportedTypeError", "File type not supported")).kind).toBe("damaged");
    expect(describeOpenError(new Error("End of central directory record not found")).kind).toBe("damaged");
    expect(describeOpenError(new Error("Invalid zip data")).kind).toBe("damaged");
    expect(describeOpenError(named("NotFoundError", "File not found")).kind).toBe("damaged");
  });

  it("falls back to a generic message", () => {
    const info = describeOpenError(new Error("Something odd"));
    expect(info.kind).toBe("unknown");
    expect(info.title).toBe("Couldn't open this book");
  });
});
