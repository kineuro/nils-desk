// SPDX-License-Identifier: AGPL-3.0-only
// What the assistant writes, as a person reads it (the chat, slice 4): markdown
// read by marked's lexer and drawn as React elements, never as HTML. Headings,
// lists, quotes, tables and code keep their shape, and a table or a code block
// scrolls inside itself on a narrow screen. Raw HTML reads as the text it is, a
// link opens only to the web or to mail, and an image is named, never loaded.
// A reply still arriving is drawn as far as it goes; an open fence reads as code.

import { Lexer, type Token, type Tokens } from "marked";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import { Icon } from "../ui/Icon";

/** A link's target when it is one a person may follow from an answer: the web or mail, nothing else. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  return /^(https?:|mailto:)/iu.test(h) ? h : null;
}

/** The tokens of a text; a text the lexer cannot read stays one paragraph of itself. */
export function lex(text: string): Token[] {
  try {
    return Lexer.lex(text, { gfm: true, breaks: true });
  } catch {
    return [{ type: "paragraph", raw: text, text, tokens: [{ type: "text", raw: text, text }] } as Tokens.Paragraph];
  }
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const plain = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/gu, (e) => ENTITIES[e] ?? e);

function inline(tokens: Token[] | undefined, key: string): ReactNode[] {
  return (tokens ?? []).map((t, n) => {
    const k = `${key}.${n}`;
    switch (t.type) {
      case "strong":
        return <strong key={k}>{inline((t as Tokens.Strong).tokens, k)}</strong>;
      case "em":
        return <em key={k}>{inline((t as Tokens.Em).tokens, k)}</em>;
      case "del":
        return <del key={k}>{inline((t as Tokens.Del).tokens, k)}</del>;
      case "codespan":
        return <code key={k}>{plain((t as Tokens.Codespan).text)}</code>;
      case "br":
        return <br key={k} />;
      case "link": {
        const l = t as Tokens.Link;
        const href = safeHref(l.href);
        return href ? (
          <a key={k} href={href} target="_blank" rel="noreferrer noopener">
            {inline(l.tokens, k)}
          </a>
        ) : (
          <Fragment key={k}>{inline(l.tokens, k)}</Fragment>
        );
      }
      case "image": {
        const i = t as Tokens.Image;
        return (
          <span key={k} className="md-image">
            {i.text || i.href}
          </span>
        );
      }
      case "text": {
        const x = t as Tokens.Text;
        return <Fragment key={k}>{x.tokens ? inline(x.tokens, k) : plain(x.text)}</Fragment>;
      }
      default:
        // escapes, raw HTML and anything newer read as the text they are
        return <Fragment key={k}>{plain(String((t as { text?: unknown }).text ?? t.raw ?? ""))}</Fragment>;
    }
  });
}

const ALIGN: Record<string, string> = { left: "md-left", right: "md-right", center: "md-center" };

function blocks(tokens: Token[] | undefined, key: string): ReactNode[] {
  return (tokens ?? []).map((t, n) => block(t, `${key}.${n}`));
}

/** A list item: a tight one keeps its words on the bullet's line, a loose one is paragraphs. */
function item(it: Tokens.ListItem, k: string): ReactNode {
  const body = it.loose
    ? blocks(it.tokens, k)
    : it.tokens.map((t, n) => (t.type === "text" ? <Fragment key={`${k}.${n}`}>{inline((t as Tokens.Text).tokens ?? [t], `${k}.${n}`)}</Fragment> : block(t, `${k}.${n}`)));
  return (
    <li key={k}>
      {it.task && <input type="checkbox" checked={Boolean(it.checked)} disabled aria-label={it.checked ? "done" : "not done"} />}
      {body}
    </li>
  );
}

function block(t: Token, k: string): ReactNode {
  switch (t.type) {
    case "space":
    case "def":
    case "checkbox":
      // a ticked item draws its own box
      return null;
    case "heading": {
      const h = t as Tokens.Heading;
      const words = inline(h.tokens, k);
      if (h.depth <= 2) return <h3 key={k}>{words}</h3>;
      if (h.depth === 3) return <h4 key={k}>{words}</h4>;
      return <h5 key={k}>{words}</h5>;
    }
    case "paragraph":
      return <p key={k}>{inline((t as Tokens.Paragraph).tokens, k)}</p>;
    case "text": {
      const x = t as Tokens.Text;
      return <p key={k}>{x.tokens ? inline(x.tokens, k) : plain(x.text)}</p>;
    }
    case "code": {
      const c = t as Tokens.Code;
      return <CodeBlock key={k} code={c.text} lang={c.lang} />;
    }
    case "blockquote":
      return <blockquote key={k}>{blocks((t as Tokens.Blockquote).tokens, k)}</blockquote>;
    case "hr":
      return <hr key={k} />;
    case "list": {
      const l = t as Tokens.List;
      const items = l.items.map((it, n) => item(it, `${k}.${n}`));
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
                    {inline(c.tokens, `${k}.h${n}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tb.rows.map((row, r) => (
                <tr key={`${k}.r${r}`}>
                  {row.map((c, n) => (
                    <td key={`${k}.r${r}.${n}`} className={cls(n)}>
                      {inline(c.tokens, `${k}.r${r}.${n}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      // raw HTML and anything newer read as the text they are
      return <p key={k}>{String((t as { text?: unknown }).text ?? t.raw ?? "")}</p>;
  }
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };
  return (
    <div className="md-code">
      <div className="md-code-head">
        <span className="meta">{(lang ?? "").trim().slice(0, 24) || "code"}</span>
        <button type="button" className="icon-button" aria-label={copied ? "Copied" : "Copy the code"} title={copied ? "Copied" : "Copy"} onClick={copy}>
          <Icon name={copied ? "check" : "copy"} />
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** An answer's words, drawn from its markdown. */
export function Markdown({ text }: { text: string }) {
  const tokens = useMemo(() => lex(text), [text]);
  return <div className="md">{blocks(tokens, "m")}</div>;
}
