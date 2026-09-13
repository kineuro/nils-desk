// SPDX-License-Identifier: AGPL-3.0-only
// The theme switch goes round the system, dark and light, and a choice is kept
// and read again; anything else kept, or no storage at all, is the system.

import { describe, expect, it } from "vitest";
import { applyTheme, nextTheme, readTheme, THEME_KEY } from "./theme";

function store(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

describe("the theme switch", () => {
  it("goes round the system, dark and light", () => {
    expect(nextTheme("system")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("system");
  });

  it("reads a kept choice, and the system for anything else", () => {
    expect(readTheme(store({ [THEME_KEY]: "dark" }))).toBe("dark");
    expect(readTheme(store({ [THEME_KEY]: "light" }))).toBe("light");
    expect(readTheme(store({ [THEME_KEY]: "purple" }))).toBe("system");
    expect(readTheme(store())).toBe("system");
    expect(readTheme(null)).toBe("system");
  });

  it("stamps a choice on the root and keeps it, and the system stamps and keeps nothing", () => {
    const s = store();
    const root = { dataset: {} as Record<string, string> } as unknown as HTMLElement;
    applyTheme("dark", root, s);
    expect(root.dataset.theme).toBe("dark");
    expect(s.m.get(THEME_KEY)).toBe("dark");
    applyTheme("system", root, s);
    expect(root.dataset.theme).toBeUndefined();
    expect(s.m.has(THEME_KEY)).toBe(false);
  });
});
