// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { nextIndex, onRovingKeyDown, rovingTabIndex } from "./roving";

describe("nextIndex", () => {
  it("moves and wraps with arrows, jumps with Home/End", () => {
    expect(nextIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextIndex("ArrowDown", 2, 3)).toBe(0);
    expect(nextIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextIndex("ArrowUp", 1, 3)).toBe(0);
    expect(nextIndex("Home", 2, 3)).toBe(0);
    expect(nextIndex("End", 0, 3)).toBe(2);
    expect(nextIndex("Enter", 0, 3)).toBeNull();
    expect(nextIndex("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("rovingTabIndex", () => {
  it("makes only the selected option tabbable, or the first if none is", () => {
    expect([0, 1, 2].map((i) => rovingTabIndex(i === 1, i, true))).toEqual([-1, 0, -1]);
    expect([0, 1, 2].map((i) => rovingTabIndex(false, i, false))).toEqual([0, -1, -1]);
  });
});

describe("onRovingKeyDown", () => {
  it("focuses and selects the next option", () => {
    const group = document.createElement("div");
    const clicked: string[] = [];
    for (const name of ["a", "b", "c"]) {
      const b = document.createElement("button");
      b.setAttribute("role", "radio");
      b.textContent = name;
      b.addEventListener("click", () => clicked.push(name));
      group.append(b);
    }
    document.body.append(group);
    const [a, b] = Array.from(group.children) as HTMLElement[];
    a.focus();
    let prevented = false;
    onRovingKeyDown({
      key: "ArrowRight",
      currentTarget: group,
      preventDefault: () => (prevented = true),
      stopPropagation: () => {},
    } as never);
    expect(document.activeElement).toBe(b);
    expect(clicked).toEqual(["b"]);
    expect(prevented).toBe(true);

    // Action-button groups move focus without activating.
    onRovingKeyDown(
      { key: "End", currentTarget: group, preventDefault: () => {}, stopPropagation: () => {} } as never,
      { select: false },
    );
    expect(document.activeElement).toBe(group.lastElementChild);
    expect(clicked).toEqual(["b"]);
  });
});
