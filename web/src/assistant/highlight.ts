// SPDX-License-Identifier: AGPL-3.0-only
// Code in an answer coloured by its language (the chat, slice 8): highlight.js
// grammars through lowlight, loaded the first time an answer holds code, and
// lowlight's tree turned into React elements. The colours come from the theme.

import type { RootContent } from "hast";
import { createElement, type ReactNode } from "react";

type Lowlight = ReturnType<typeof import("lowlight").createLowlight>;

let lowlight: Lowlight | null = null;
let loading: Promise<void> | null = null;
const waiting = new Set<() => void>();

/** Loads the grammars once; resolves when code can be coloured. */
export function loadHighlight(): Promise<void> {
  loading ??= import("./grammars").then((m) => {
    lowlight = m.grammars();
    for (const done of waiting) done();
    waiting.clear();
  });
  return loading;
}

/** Whether code can be coloured now. */
export function highlightReady(): boolean {
  return lowlight !== null;
}

/** Calls back once code can be coloured, loading the grammars if need be; the returned function stops waiting. */
export function whenHighlight(done: () => void): () => void {
  if (lowlight) {
    done();
    return () => undefined;
  }
  waiting.add(done);
  loadHighlight().catch(() => undefined);
  return () => {
    waiting.delete(done);
  };
}

/** Code longer than this stays plain, so a long listing never stalls the page. */
export const MAX_CODE = 60_000;

/** A code block's language as written: the first word of its info string. */
export function languageOf(info: string | undefined): string {
  return (info ?? "").trim().split(/\s+/u)[0]?.toLowerCase().slice(0, 24) ?? "";
}

/** Whether a language is one the grammars know (once loaded). */
export function knownLanguage(lang: string): boolean {
  return lowlight !== null && lang !== "" && lowlight.registered(lang);
}

function element(node: RootContent, key: string): ReactNode {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return null;
  const names = node.properties?.className;
  const className = Array.isArray(names) ? names.filter((n): n is string => typeof n === "string" && /^hljs-[\w-]+$/u.test(n)).join(" ") : "";
  return createElement("span", { key, className: className || undefined }, ...node.children.map((c, i) => element(c, `${key}.${i}`)));
}

/** The code as coloured spans, or null when its language is unknown, the grammars are not loaded, or it is too long. */
export function highlighted(code: string, lang: string): ReactNode[] | null {
  if (!lowlight || code.length > MAX_CODE || !knownLanguage(lang)) return null;
  try {
    return lowlight.highlight(lang, code).children.map((c, i) => element(c, `h${i}`));
  } catch {
    return null;
  }
}
