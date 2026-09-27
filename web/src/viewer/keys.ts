// SPDX-License-Identifier: AGPL-3.0-only
// The pictures' own keys in the reader (after the first gold campaign, "use
// the space of a big screen"): Space enlarges one of the three planes to the
// whole picture side and gives the three back, Escape gives them back, the
// arrows page the stack or a plane a plane at a time and Page Up and Down
// ten. None of them is an answer's key (client.ts ROW_KEYS and the rest), so
// the reader's keys and these never meet. A key in a field, in a drawer or a
// dialog, or with a modifier is not the pictures'; Space on a button presses
// the button.

export type ViewerKey = { kind: "enlarge" } | { kind: "restore" } | { kind: "page"; delta: number };

/** An element as the handler reads it (the DOM's, or a test's stand-in). */
export interface ViewerKeyTarget {
  tagName: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

export function viewerKey(key: string, opts: { view: "stack" | "planes"; enlarged: boolean; target: ViewerKeyTarget | null; modifier?: boolean }): ViewerKey | null {
  const t = opts.target;
  if (opts.modifier) return null;
  if (t && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable || t.closest?.("dialog, .drawer, .mine-drawer"))) return null;
  if (key === " ") {
    if (opts.view !== "planes" || (t && ["BUTTON", "A", "SUMMARY"].includes(t.tagName))) return null;
    return opts.enlarged ? { kind: "restore" } : { kind: "enlarge" };
  }
  if (key === "Escape") return opts.enlarged && opts.view === "planes" ? { kind: "restore" } : null;
  if (key === "ArrowUp") return { kind: "page", delta: -1 };
  if (key === "ArrowDown") return { kind: "page", delta: 1 };
  if (key === "PageUp") return { kind: "page", delta: -10 };
  if (key === "PageDown") return { kind: "page", delta: 10 };
  return null;
}
