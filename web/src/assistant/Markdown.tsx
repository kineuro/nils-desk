// SPDX-License-Identifier: AGPL-3.0-only
// What the assistant writes, as a person reads it (the chat, slices 4 and 8):
// markdown read by marked's lexer and drawn as React elements, never as HTML.
// Headings keep their levels; lists, quotes, alerts, tables, footnotes and code
// keep their shape, and a table, a formula or a code block scrolls inside itself
// on a narrow screen. Code is coloured by its language and a formula is drawn
// as MathML, each loaded the first time an answer needs it. A link opens only to
// the web or to mail, an image is named and never loaded, and HTML reads as its
// text, except a details block and the few tags that only shape words (sub, sup,
// kbd, mark, br and the like). A single tilde is not a strikethrough, so "~5
// subjects" keeps its tilde. A reply still arriving is drawn as far as it goes,
// with its unfinished bold, link, table row or formula held back until whole.

import { Marked, type Token, type TokenizerExtension, type Tokens } from "marked";
import { createElement, Fragment, type MouseEvent, type ReactNode, useEffect, useId, useMemo, useState } from "react";
import { useCopy } from "../ui/clipboard";
import { Icon, type IconName } from "../ui/Icon";
import { decodeEntities } from "./entities";
import { highlighted, highlightReady, languageOf, whenHighlight } from "./highlight";
import { mathElements, mathReady, mathTree, whenMath } from "./mathml";
import { mend } from "./mend";

/** A link's target when it is one a person may follow from an answer: the web or mail, nothing else. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  return /^(https?:|mailto:)/iu.test(h) ? h : null;
}

type MathToken = { type: "math"; raw: string; tex: string; display: boolean };
type ShapedToken = { type: "sub" | "sup"; raw: string; text: string };
type NoteRef = { type: "footnoteRef"; raw: string; label: string };
type NoteDef = { type: "footnote"; raw: string; label: string; tokens: Token[] };
type AlertKind = "note" | "tip" | "important" | "warning" | "caution";
type AlertToken = { type: "alert"; raw: string; kind: AlertKind; tokens: Token[] };

/** A formula on lines of its own: $$ … $$ or \[ … \]. */
const mathBlock: TokenizerExtension = {
  name: "mathBlock",
  level: "block",
  start: (src) => /^ {0,3}(?:\$\$|\\\[)/mu.exec(src)?.index,
  tokenizer(src) {
    const m = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/u.exec(src) ?? /^ {0,3}\\\[([\s\S]+?)\\\][ \t]*(?:\n+|$)/u.exec(src);
    return m ? ({ type: "math", raw: m[0], tex: (m[1] as string).trim(), display: true } satisfies MathToken) : undefined;
  },
};

/**
 * A formula within a line: \( … \), \[ … \], $$ … $$, or $ … $ where the dollars
 * hug the formula (no space inside them, no digit after the closing one), so a
 * price such as "$5 and $10" stays words.
 */
const mathInline: TokenizerExtension = {
  name: "mathInline",
  level: "inline",
  start(src) {
    const m = /\\\(|\\\[|\$\$|(?:^|[^\w\\$])\$(?=[^\s$])/u.exec(src);
    if (!m) return undefined;
    return m[0].length > 1 && m[0].endsWith("$") && !m[0].startsWith("$") && !m[0].startsWith("\\") ? m.index + m[0].length - 1 : m.index;
  },
  tokenizer(src) {
    const forms: [RegExp, boolean][] = [
      [/^\\\(([\s\S]+?)\\\)/u, false],
      [/^\\\[([\s\S]+?)\\\]/u, true],
      [/^\$\$([^$]+?)\$\$/u, true],
      [/^\$(?=[^\s$])((?:\\\$|[^$\n])*?[^\s\\])\$(?!\d)/u, false],
    ];
    for (const [form, display] of forms) {
      const m = form.exec(src);
      if (m) return { type: "math", raw: m[0], tex: (m[1] as string).trim(), display } satisfies MathToken;
    }
    return undefined;
  },
};

/** H~2~O and x^2^: a subscript or superscript of one word. */
const shaped = (type: "sub" | "sup", mark: string): TokenizerExtension => {
  const form = mark === "~" ? /^~(?!~)([^~\s]{1,24})~(?!~)/u : /^\^([^^\s]{1,24})\^/u;
  return {
    name: type,
    level: "inline",
    start: (src) => {
      const at = src.indexOf(mark);
      return at < 0 ? undefined : at;
    },
    tokenizer: (src) => {
      const m = form.exec(src);
      return m ? ({ type, raw: m[0], text: m[1] as string } satisfies ShapedToken) : undefined;
    },
  };
};

/** [^1]: a footnote's words, kept for the end of the answer. */
const footnote: TokenizerExtension = {
  name: "footnote",
  level: "block",
  start: (src) => /^ {0,3}\[\^[^\]\s]+\]:/mu.exec(src)?.index,
  tokenizer(src) {
    const m = /^ {0,3}\[\^([^\]\s]{1,40})\]:[ \t]*([^\n]*(?:\n(?:[ \t]{2,}|\t)[^\n]*)*)(?:\n+|$)/u.exec(src);
    if (!m) return undefined;
    const token: NoteDef = { type: "footnote", raw: m[0], label: m[1] as string, tokens: [] };
    this.lexer.inline((m[2] as string).replace(/\n[ \t]+/gu, "\n").trim(), token.tokens);
    return token;
  },
};

/** [^1]: where a footnote is called. */
const footnoteRef: TokenizerExtension = {
  name: "footnoteRef",
  level: "inline",
  start: (src) => {
    const at = src.indexOf("[^");
    return at < 0 ? undefined : at;
  },
  tokenizer: (src) => {
    const m = /^\[\^([^\]\s]{1,40})\](?!:)/u.exec(src);
    return m ? ({ type: "footnoteRef", raw: m[0], label: m[1] as string } satisfies NoteRef) : undefined;
  },
};

/** > [!NOTE] and its kin: a quote that is a note, a tip, something important, a warning or a caution. */
const alert: TokenizerExtension = {
  name: "alert",
  level: "block",
  start: (src) => /^ {0,3}> ?\[!(?:note|tip|important|warning|caution)\]/imu.exec(src)?.index,
  tokenizer(src) {
    const m = /^ {0,3}> ?\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)((?: {0,3}>[^\n]*(?:\n|$))*)/iu.exec(src);
    if (!m) return undefined;
    const inner = (m[2] as string).replace(/^ {0,3}> ?/gmu, "");
    return { type: "alert", raw: m[0], kind: (m[1] as string).toLowerCase() as AlertKind, tokens: this.lexer.blockTokens(inner, []) } satisfies AlertToken;
  },
};

const reader = new Marked({
  gfm: true,
  breaks: true,
  extensions: [alert, footnote, mathBlock, mathInline, footnoteRef, shaped("sub", "~"), shaped("sup", "^")],
  // only a double tilde strikes words through; "~5 subjects and ~10" keeps its tildes
  tokenizer: { del: (src) => (src.startsWith("~~") ? false : undefined) },
});

/** The tokens of a text; a text the lexer cannot read stays one paragraph of itself. */
export function lex(text: string): Token[] {
  try {
    return reader.lexer(text);
  } catch {
    return [{ type: "paragraph", raw: text, text, tokens: [{ type: "text", raw: text, text }] } as Tokens.Paragraph];
  }
}

const XML: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
/** Code keeps its words as written: only the escapes marked put in are undone. */
const plain = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/gu, (e) => XML[e] ?? e);

/** The HTML tags an answer may use to shape its words; any other tag reads as text. */
const SHAPING = new Set(["sub", "sup", "kbd", "mark", "ins", "del", "s", "u", "small", "b", "i", "em", "strong"]);

function tagOf(html: string): { name: string; close: boolean } | null {
  const m = /^<(\/?)([a-z][a-z0-9]*)\s*\/?>$/iu.exec(html.trim());
  return m ? { name: (m[2] as string).toLowerCase(), close: m[1] === "/" } : null;
}

const isComment = (html: string) => /^<!--[\s\S]*-->$/u.test(html.trim());

type Page = { id: string; notes: Map<string, NoteDef>; order: Map<string, number> };

/** Moves to a footnote, or back to where it was called, without touching the page's address. */
function jump(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
  const target = event.currentTarget.getAttribute("href")?.slice(1);
  if (target) document.getElementById(target)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function hostOf(href: string): string | null {
  try {
    return new URL(href).host || null;
  } catch {
    return null;
  }
}

function inline(tokens: Token[] | undefined, key: string, page: Page): ReactNode[] {
  const list = tokens ?? [];
  const out: ReactNode[] = [];
  for (let n = 0; n < list.length; n++) {
    const t = list[n] as Token;
    const k = `${key}.${n}`;
    if (t.type !== "html") {
      out.push(word(t, k, page));
      continue;
    }
    const html = (t as Tokens.HTML).text;
    if (isComment(html)) continue;
    const tag = tagOf(html);
    if (tag?.name === "br" && !tag.close) {
      out.push(<br key={k} />);
      continue;
    }
    if (tag && !tag.close && SHAPING.has(tag.name)) {
      let depth = 0;
      let end = -1;
      for (let j = n + 1; j < list.length && end < 0; j++) {
        const other = list[j]?.type === "html" ? tagOf((list[j] as Tokens.HTML).text) : null;
        if (other?.name !== tag.name) continue;
        if (!other.close) depth++;
        else if (depth === 0) end = j;
        else depth--;
      }
      if (end > 0) {
        out.push(createElement(tag.name, { key: k }, ...inline(list.slice(n + 1, end), k, page)));
        n = end;
        continue;
      }
    }
    out.push(<Fragment key={k}>{html}</Fragment>);
  }
  return out;
}

function word(t: Token, k: string, page: Page): ReactNode {
  switch (t.type) {
    case "strong":
      return <strong key={k}>{inline((t as Tokens.Strong).tokens, k, page)}</strong>;
    case "em":
      return <em key={k}>{inline((t as Tokens.Em).tokens, k, page)}</em>;
    case "del":
      return <del key={k}>{inline((t as Tokens.Del).tokens, k, page)}</del>;
    case "codespan":
      return <code key={k}>{plain((t as Tokens.Codespan).text)}</code>;
    case "br":
      return <br key={k} />;
    case "checkbox":
      // the list item draws its own box
      return null;
    case "escape":
      return <Fragment key={k}>{(t as Tokens.Escape).text}</Fragment>;
    case "link": {
      const l = t as Tokens.Link;
      const href = safeHref(l.href);
      return href ? (
        <a key={k} href={href} title={l.title ?? undefined} target="_blank" rel="noreferrer noopener">
          {inline(l.tokens, k, page)}
        </a>
      ) : (
        <Fragment key={k}>{inline(l.tokens, k, page)}</Fragment>
      );
    }
    case "image": {
      const i = t as Tokens.Image;
      const host = hostOf(i.href);
      return (
        <span key={k} className="md-image">
          {decodeEntities(i.text) || (host ? `image (${host})` : "image")}
        </span>
      );
    }
    case "math": {
      const m = t as unknown as MathToken;
      return <Formula key={k} tex={m.tex} display={m.display} inline />;
    }
    case "sub":
    case "sup":
      return createElement(t.type, { key: k }, decodeEntities((t as unknown as ShapedToken).text));
    case "footnoteRef": {
      const label = (t as unknown as NoteRef).label;
      if (!page.notes.has(label)) return <Fragment key={k}>{t.raw}</Fragment>;
      const number = page.order.get(label) ?? page.order.size + 1;
      page.order.set(label, number);
      return (
        <sup key={k} className="md-fnref">
          <a href={`#${page.id}-fn-${label}`} id={`${page.id}-ref-${label}`} onClick={jump} aria-label={`Note ${number}`}>
            {number}
          </a>
        </sup>
      );
    }
    case "text": {
      const x = t as Tokens.Text;
      return <Fragment key={k}>{x.tokens ? inline(x.tokens, k, page) : decodeEntities(x.text)}</Fragment>;
    }
    default:
      // anything newer reads as the text it is
      return <Fragment key={k}>{decodeEntities(String((t as { text?: unknown }).text ?? t.raw ?? ""))}</Fragment>;
  }
}

const ALIGN: Record<string, string> = { left: "md-left", right: "md-right", center: "md-center" };

const ALERTS: Record<AlertKind, { title: string; icon: IconName }> = {
  note: { title: "Note", icon: "info" },
  tip: { title: "Tip", icon: "check" },
  important: { title: "Important", icon: "info" },
  warning: { title: "Warning", icon: "alert" },
  caution: { title: "Caution", icon: "alert" },
};

/** <details><summary>…</summary> … </details>, written on one block or around markdown of its own. */
const DETAILS_OPEN = /^<details(\s+open)?\s*>\s*(?:<summary>([\s\S]*?)<\/summary>)?\s*$/iu;
const DETAILS_WHOLE = /^<details(\s+open)?\s*>\s*(?:<summary>([\s\S]*?)<\/summary>)?([\s\S]*?)<\/details>\s*$/iu;
const DETAILS_CLOSE = /^<\/details>\s*$/iu;

const summaryOf = (html: string | undefined) => decodeEntities((html ?? "").replace(/<[^>]*>/gu, "").trim()) || "Details";

function blocks(tokens: Token[] | undefined, key: string, page: Page): ReactNode[] {
  const list = tokens ?? [];
  const out: ReactNode[] = [];
  for (let n = 0; n < list.length; n++) {
    const t = list[n] as Token;
    const k = `${key}.${n}`;
    if (t.type === "html") {
      const html = (t as Tokens.HTML).text.trim();
      const whole = DETAILS_WHOLE.exec(html);
      if (whole) {
        out.push(
          <details key={k} open={Boolean(whole[1]) || undefined}>
            <summary>{summaryOf(whole[2])}</summary>
            {blocks(lex((whole[3] ?? "").trim()), k, page)}
          </details>,
        );
        continue;
      }
      const open = DETAILS_OPEN.exec(html);
      const end = open ? list.findIndex((u, j) => j > n && u.type === "html" && DETAILS_CLOSE.test((u as Tokens.HTML).text.trim())) : -1;
      if (open && end > n) {
        out.push(
          <details key={k} open={Boolean(open[1]) || undefined}>
            <summary>{summaryOf(open[2])}</summary>
            {blocks(list.slice(n + 1, end), k, page)}
          </details>,
        );
        n = end;
        continue;
      }
    }
    out.push(block(t, k, page));
  }
  return out;
}

/** A list item: a tight one keeps its words on the bullet's line, a loose one is paragraphs. */
function item(it: Tokens.ListItem, k: string, page: Page): ReactNode {
  const body = it.loose
    ? blocks(it.tokens, k, page)
    : it.tokens.map((t, n) =>
        t.type === "text" ? <Fragment key={`${k}.${n}`}>{inline((t as Tokens.Text).tokens ?? [t], `${k}.${n}`, page)}</Fragment> : block(t, `${k}.${n}`, page),
      );
  return (
    <li key={k}>
      {it.task && <input type="checkbox" checked={Boolean(it.checked)} disabled aria-label={it.checked ? "done" : "not done"} />}
      {body}
    </li>
  );
}

/** Headings one to six, drawn below the page's own headings and each still a size of its own. */
const HEADINGS = ["h3", "h4", "h5", "h6", "h6", "h6"];

function block(t: Token, k: string, page: Page): ReactNode {
  switch (t.type) {
    case "space":
    case "def":
    case "checkbox":
    case "footnote":
      // a ticked item draws its own box, and footnotes gather at the end
      return null;
    case "heading": {
      const h = t as Tokens.Heading;
      const depth = Math.min(Math.max(h.depth, 1), 6);
      return createElement(HEADINGS[depth - 1] as string, { key: k, className: `md-h${depth}` }, ...inline(h.tokens, k, page));
    }
    case "paragraph":
      return <p key={k}>{inline((t as Tokens.Paragraph).tokens, k, page)}</p>;
    case "text": {
      const x = t as Tokens.Text;
      return <p key={k}>{x.tokens ? inline(x.tokens, k, page) : decodeEntities(x.text)}</p>;
    }
    case "code": {
      const c = t as Tokens.Code;
      const lang = languageOf(c.lang);
      return lang === "math" ? <Formula key={k} tex={c.text} display /> : <CodeBlock key={k} code={c.text} lang={lang} />;
    }
    case "math": {
      const m = t as unknown as MathToken;
      return <Formula key={k} tex={m.tex} display />;
    }
    case "alert": {
      const a = t as unknown as AlertToken;
      const look = ALERTS[a.kind];
      return (
        <div key={k} className={`md-alert md-alert-${a.kind}`} role="note">
          <p className="md-alert-title">
            <Icon name={look.icon} />
            {look.title}
          </p>
          {blocks(a.tokens, k, page)}
        </div>
      );
    }
    case "blockquote":
      return <blockquote key={k}>{blocks((t as Tokens.Blockquote).tokens, k, page)}</blockquote>;
    case "hr":
      return <hr key={k} />;
    case "list": {
      const l = t as Tokens.List;
      const items = l.items.map((it, n) => item(it, `${k}.${n}`, page));
      if (!l.ordered) return <ul key={k}>{items}</ul>;
      return (
        <ol key={k} start={typeof l.start === "number" && l.start !== 1 ? l.start : undefined}>
          {items}
        </ol>
      );
    }
    case "table": {
      const tb = t as Tokens.Table;
      const cls = (n: number) => (tb.align[n] ? ALIGN[tb.align[n] as string] : undefined);
      return (
        <div key={k} className="md-table">
          <table className="thin">
            <thead>
              <tr>
                {tb.header.map((c, n) => (
                  <th key={`${k}.h${n}`} className={cls(n)}>
                    {inline(c.tokens, `${k}.h${n}`, page)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((row, r) => (
                <tr key={`${k}.r${r}`}>
                  {row.map((c, n) => (
                    <td key={`${k}.r${r}.${n}`} className={cls(n)}>
                      {inline(c.tokens, `${k}.r${r}.${n}`, page)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "html": {
      const html = (t as Tokens.HTML).text;
      if (isComment(html)) return null;
      return (
        <p key={k} className="md-html">
          {html.trim()}
        </p>
      );
    }
    default:
      // anything newer reads as the text it is
      return <p key={k}>{String((t as { text?: unknown }).text ?? t.raw ?? "")}</p>;
  }
}

/** Draws again once a library an answer needs has loaded. */
function useLoaded(when: (done: () => void) => () => void, ready: () => boolean, wanted = true): void {
  const [, bump] = useState(0);
  useEffect(() => (wanted && !ready() ? when(() => bump((n) => n + 1)) : undefined), [wanted, when, ready]);
}

function Formula({ tex, display, inline: within = false }: { tex: string; display: boolean; inline?: boolean }) {
  useLoaded(whenMath, mathReady);
  const tree = mathTree(tex, display);
  if (tree === null || tree instanceof Error) {
    // while the formula library loads, and when it cannot read a formula, the TeX reads as written
    const title = tree instanceof Error ? "This formula could not be drawn, so it reads as written" : undefined;
    return display && !within ? (
      <pre className="md-math-source" title={title}>
        {tex}
      </pre>
    ) : (
      <code className="md-math-source" title={title}>
        {tex}
      </code>
    );
  }
  return display && !within ? <div className="md-math">{mathElements(tree, "f")}</div> : <span className="md-math-inline">{mathElements(tree, "f")}</span>;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [state, copy] = useCopy();
  useLoaded(whenHighlight, highlightReady, lang !== "");
  const coloured = highlighted(code, lang);
  const label = state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : "Copy the code";
  return (
    <div className="md-code">
      <div className="md-code-head">
        <span className="meta">{lang || "code"}</span>
        <button type="button" className="icon-button" aria-label={label} title={label} onClick={() => copy(code)}>
          <Icon name={state === "copied" ? "check" : state === "failed" ? "alert" : "copy"} />
        </button>
      </div>
      <pre>
        <code>{coloured ?? code}</code>
      </pre>
    </div>
  );
}

/** An answer's words, drawn from its markdown; `streaming` while the reply is still arriving. */
export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const id = useId();
  const tokens = useMemo(() => lex(streaming ? mend(text) : text), [text, streaming]);
  const notes = useMemo(() => new Map(tokens.filter((t) => t.type === "footnote").map((t) => [(t as unknown as NoteDef).label, t as unknown as NoteDef])), [tokens]);
  const page: Page = { id, notes, order: new Map() };
  const body = blocks(tokens, "m", page);
  const called = [...page.order.keys()];
  return (
    <div className="md">
      {body}
      {called.length > 0 && (
        <section className="md-footnotes" aria-label="Notes">
          <ol>
            {called.map((label) => (
              <li key={label} id={`${id}-fn-${label}`}>
                {inline(notes.get(label)?.tokens, `fn.${label}`, page)}{" "}
                <a href={`#${id}-ref-${label}`} className="md-fnback" onClick={jump} aria-label="Back to where the note is called">
                  ↩
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
