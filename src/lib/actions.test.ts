import { describe, expect, it } from "vitest";
import { createDispatcher, isActionId, shortcutFor } from "./actions";

describe("dispatcher", () => {
  it("runs the newest handler first and stops when one claims the action", () => {
    const d = createDispatcher(() => 0);
    const calls: string[] = [];
    d.on(() => void calls.push("app"));
    const off = d.on((id) => {
      calls.push("reader");
      return id === "find";
    });
    d.dispatch("find");
    expect(calls).toEqual(["reader"]);

    off();
    d.dispatch("bookmark");
    expect(calls).toEqual(["reader", "app"]);
  });

  it("drops a repeat of the same action within the dedupe window", () => {
    let t = 0;
    const d = createDispatcher(() => t);
    let n = 0;
    d.on(() => void n++);
    d.dispatch("add-books");
    t = 100;
    d.dispatch("add-books"); // menu accelerator + keydown for one key press
    expect(n).toBe(1);
    d.dispatch("find"); // a different action isn't deduped
    t = 500;
    d.dispatch("add-books");
    expect(n).toBe(3);
  });
});

describe("shortcutFor", () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    shortcutFor({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

  it("maps Cmd/Ctrl shortcuts to actions", () => {
    expect(key("o", { metaKey: true })).toBe("add-books");
    expect(key("O", { ctrlKey: true, shiftKey: true })).toBe("add-folder");
    expect(key("f", { metaKey: true })).toBe("find");
    expect(key("=", { metaKey: true })).toBe("text-larger");
    expect(key("+", { ctrlKey: true, shiftKey: true })).toBe("text-larger");
    expect(key("-", { metaKey: true })).toBe("text-smaller");
    expect(key("d", { metaKey: true })).toBe("bookmark");
    expect(key("l", { metaKey: true })).toBe("go-library");
  });

  it("ignores unmodified keys and Alt combinations", () => {
    expect(key("o")).toBeNull();
    expect(key("f", { metaKey: true, altKey: true })).toBeNull();
    expect(key("x", { metaKey: true })).toBeNull();
  });

  it("validates menu payloads", () => {
    expect(isActionId("find")).toBe(true);
    expect(isActionId("rm -rf")).toBe(false);
  });
});
