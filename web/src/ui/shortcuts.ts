// SPDX-License-Identifier: AGPL-3.0-only
// The keyboard shortcuts, declared in one registry with a page that lists
// them (Wave 5 section 6.6). No single-letter binding: a person typing a
// document must never trigger one. Every shortcut is a chord with a
// modifier, or a two-key sequence that starts with "g".

export interface Shortcut {
  keys: string;
  does: string;
  go?: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: "g h", does: "Go home", go: "#home" },
  { keys: "g a", does: "Go to Ask", go: "#ask" },
  { keys: "g d", does: "Go to Data", go: "#data" },
  { keys: "g r", does: "Go to Review", go: "#review" },
  { keys: "g l", does: "Go to Release", go: "#release" },
  { keys: "g p", does: "Go to Pipelines", go: "#pipelines" },
  { keys: "g s", does: "Go to Settings", go: "#settings" },
  { keys: "Ctrl+Shift+/", does: "List the shortcuts", go: "#settings/shortcuts" },
  { keys: "Ctrl+Enter", does: "Run the open question, or send the words in the rail" },
  { keys: "Escape", does: "Close what is open, or stop the station's turn" },
];

/** A single printable key on its own is not a shortcut; the registry's own rule, checked by the gate. */
export function wellFormed(s: Shortcut): boolean {
  const parts = s.keys.split(" ");
  if (parts.length === 2) return parts[0] === "g" && parts[1].length === 1;
  if (parts.length !== 1) return false;
  const k = parts[0];
  return k.includes("+") || k === "Escape";
}

function editing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** Listen on the window; the "g" sequence waits one second for its second key. */
export function install(go: (hash: string) => void): () => void {
  let pending: number | null = null;
  const onKey = (e: KeyboardEvent) => {
    if (editing(e.target)) return;
    if (e.ctrlKey && e.shiftKey && e.key === "?") {
      e.preventDefault();
      go("#settings/shortcuts");
      return;
    }
    if (pending !== null) {
      window.clearTimeout(pending);
      pending = null;
      const hit = SHORTCUTS.find((s) => s.keys === `g ${e.key}`);
      if (hit?.go) {
        e.preventDefault();
        go(hit.go);
      }
      return;
    }
    if (e.key === "g" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      pending = window.setTimeout(() => {
        pending = null;
      }, 1000);
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
