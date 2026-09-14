// SPDX-License-Identifier: AGPL-3.0-only
// Formulas in an answer (the chat, slice 8): TeX turned into MathML by temml,
// loaded the first time an answer holds a formula, and drawn as React elements
// from an allowlist of MathML elements and attributes, never injected as HTML.
// A colour a formula asks for is left out, so the theme keeps its colours.

import { createElement, type ReactNode } from "react";

type Temml = typeof import("temml").default;

let temml: Temml | null = null;
let loading: Promise<void> | null = null;
const waiting = new Set<() => void>();

/** Loads temml once; resolves when formulas can be drawn. */
export function loadMath(): Promise<void> {
  loading ??= import("temml").then((m) => {
    temml = m.default;
    for (const done of waiting) done();
    waiting.clear();
  });
  return loading;
}

/** Whether formulas can be drawn now. */
export function mathReady(): boolean {
  return temml !== null;
}

/** Calls back once formulas can be drawn, loading temml if need be; the returned function stops waiting. */
export function whenMath(done: () => void): () => void {
  if (temml) {
    done();
    return () => undefined;
  }
  waiting.add(done);
  loadMath().catch(() => undefined);
  return () => {
    waiting.delete(done);
  };
}

/** A formula longer than this reads as its TeX. */
export const MAX_TEX = 4000;

export type MathNode = { name: string; attrs: Record<string, string>; children: (MathNode | string)[] };

const ELEMENTS = new Set([
  "math",
  "semantics",
  "mrow",
  "mi",
  "mn",
  "mo",
  "ms",
  "mtext",
  "mspace",
  "msup",
  "msub",
  "msubsup",
  "mfrac",
  "msqrt",
  "mroot",
  "mover",
  "munder",
  "munderover",
  "mtable",
  "mtr",
  "mtd",
  "mlabeledtr",
  "mstyle",
  "mpadded",
  "mphantom",
  "menclose",
  "merror",
  "mprescripts",
  "mmultiscripts",
  "none",
]);

const DROPPED = new Set(["annotation", "annotation-xml"]);

const ATTRIBUTES = new Set([
  "display",
  "displaystyle",
  "scriptlevel",
  "mathvariant",
  "mathsize",
  "stretchy",
  "fence",
  "separator",
  "lspace",
  "rspace",
  "symmetric",
  "largeop",
  "movablelimits",
  "accent",
  "accentunder",
  "minsize",
  "maxsize",
  "width",
  "height",
  "depth",
  "voffset",
  "columnalign",
  "rowalign",
  "columnspacing",
  "rowspacing",
  "columnlines",
  "rowlines",
  "frame",
  "framespacing",
  "linethickness",
  "notation",
  "form",
  "columnspan",
  "rowspan",
  "dir",
]);

/** Style properties a formula keeps: its layout, never a colour, an image or a font. */
const STYLES = /^(display|padding(-(top|right|bottom|left))?|margin(-(top|right|bottom|left))?|width|height|min-width|max-width|text-align|vertical-align|border(-(top|right|bottom|left))?-(width|style)|transform|position|top|right|bottom|left|line-height)$/u;

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/giu, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : whole;
    }
    return XML_ENTITIES[name] ?? whole;
  });
}

/** temml's MathML read into a tree: tags, attributes and text. Its output is well-formed and escapes its text. */
export function parseMathML(xml: string): MathNode | null {
  const root: MathNode = { name: "#root", attrs: {}, children: [] };
  const stack: MathNode[] = [root];
  const tags = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/gu;
  for (const m of xml.matchAll(tags)) {
    const top = stack[stack.length - 1] as MathNode;
    if (m[5] !== undefined) {
      top.children.push(decode(m[5]));
      continue;
    }
    const name = m[2] as string;
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) {
        if ((stack[i] as MathNode).name === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of (m[3] ?? "").matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu)) attrs[a[1] as string] = decode(a[2] ?? a[3] ?? "");
    const node: MathNode = { name, attrs, children: [] };
    top.children.push(node);
    if (!m[4]) stack.push(node);
  }
  return root.children.find((c): c is MathNode => typeof c !== "string" && c.name === "math") ?? null;
}

function styleOf(css: string): Record<string, string> | undefined {
  const style: Record<string, string> = {};
  for (const part of css.split(";")) {
    const at = part.indexOf(":");
    if (at < 0) continue;
    const prop = part.slice(0, at).trim().toLowerCase();
    const value = part.slice(at + 1).trim();
    if (!STYLES.test(prop) || value === "" || /url\(|expression\(/iu.test(value)) continue;
    style[prop.replace(/-([a-z])/gu, (_, c: string) => c.toUpperCase())] = value;
  }
  return Object.keys(style).length > 0 ? style : undefined;
}

/** A MathML tree as React elements: allowed elements and attributes only; anything else keeps its children. */
export function mathElements(node: MathNode | string, key: string): ReactNode {
  if (typeof node === "string") return node;
  if (DROPPED.has(node.name)) return null;
  const children = node.children.map((c, i) => mathElements(c, `${key}.${i}`));
  if (!ELEMENTS.has(node.name)) return children;
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(node.attrs)) {
    if (name === "class") props.className = value.replace(/[^\w -]/gu, "");
    else if (name === "style") props.style = styleOf(value);
    else if (ATTRIBUTES.has(name)) props[name] = value;
  }
  return createElement(node.name, props, ...children);
}

const drawn = new Map<string, MathNode | Error>();

/** A formula's MathML tree, an Error when temml cannot read it, or null while temml is still loading. */
export function mathTree(tex: string, display: boolean): MathNode | Error | null {
  if (!temml) return null;
  const key = `${display ? "D" : "I"}${tex}`;
  const known = drawn.get(key);
  if (known) return known;
  let tree: MathNode | Error;
  if (tex.length > MAX_TEX) tree = new Error("a formula this long reads as its TeX");
  else {
    try {
      tree = parseMathML(temml.renderToString(tex, { displayMode: display, throwOnError: true, trust: false, strict: false, maxExpand: 500 })) ?? new Error("no MathML");
    } catch (e) {
      tree = e instanceof Error ? e : new Error(String(e));
    }
  }
  if (drawn.size > 500) drawn.clear();
  drawn.set(key, tree);
  return tree;
}
