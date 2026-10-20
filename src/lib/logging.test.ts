import { describe, expect, it } from "vitest";
import { formatArgs } from "./logging";

describe("formatArgs", () => {
  it("formats strings, errors and objects", () => {
    const err = new Error("boom");
    err.stack = "Error: boom\n    at x";
    expect(formatArgs(["Failed:", err, { id: 3 }, 4])).toBe('Failed: boom\nError: boom\n    at x {"id":3} 4');
  });

  it("survives unserializable values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(formatArgs([cyclic])).toBe("[object Object]");
  });
});
