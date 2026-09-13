// SPDX-License-Identifier: AGPL-3.0-only
// The theme a person chooses in the top bar: as the system, dark or light. A
// choice stamps data-theme on the root, which theme.css answers; the system
// stamps nothing and leaves it to the scheme query. The choice is kept in the
// browser, and index.html reads it again before the first paint.

export type ThemeChoice = "system" | "dark" | "light";

export const THEME_KEY = "nils-desk.theme";

/** What the switch says it is, and what a click makes it. */
export const THEME_WORDS: Record<ThemeChoice, string> = {
  system: "Theme: as the system (click for dark)",
  dark: "Theme: dark (click for light)",
  light: "Theme: light (click for system)",
};

/** The order a click goes round: the system, dark, light. */
export function nextTheme(c: ThemeChoice): ThemeChoice {
  return c === "system" ? "dark" : c === "dark" ? "light" : "system";
}

interface Kept {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function kept(): Kept | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The choice kept in the browser; a private window, or nothing kept, is the system. */
export function readTheme(store: Kept | null = kept()): ThemeChoice {
  try {
    const t = store?.getItem(THEME_KEY);
    return t === "dark" || t === "light" ? t : "system";
  } catch {
    return "system";
  }
}

/** Stamp a choice on the root and keep it. */
export function applyTheme(c: ThemeChoice, root: HTMLElement = document.documentElement, store: Kept | null = kept()): void {
  if (c === "system") delete root.dataset.theme;
  else root.dataset.theme = c;
  try {
    if (c === "system") store?.removeItem(THEME_KEY);
    else store?.setItem(THEME_KEY, c);
  } catch {
    // a private window keeps nothing; the choice holds until the page loads again
  }
}
