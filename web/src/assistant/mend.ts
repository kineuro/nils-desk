// SPDX-License-Identifier: AGPL-3.0-only
// A reply still arriving, made whole enough to draw (the chat, slice 8). Only
// the last block is touched: its unfinished bold, strikethrough or code span is
// closed, a link whose address is still coming reads as its words, a table waits
// until the line under its first row is whole, and a display formula waits for
// its closing mark. A reply inside an open code fence is left alone: it already
// reads as code.

const DIVIDER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/u;

const cells = (line: string) => line.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|").length;

export function mend(text: string): string {
  if ((text.match(/^ {0,3}(?:```|~~~)/gmu)?.length ?? 0) % 2 === 1) return text;
  const cut = text.lastIndexOf("\n\n");
  const head = cut < 0 ? "" : text.slice(0, cut + 2);
  let tail = cut < 0 ? text : text.slice(cut + 2);

  // a display formula still open waits for its closing mark
  const dollars = tail.split("$$").length - 1;
  if (dollars % 2 === 1) tail = tail.slice(0, tail.lastIndexOf("$$"));
  const bracket = tail.lastIndexOf("\\[");
  if (bracket >= 0 && tail.indexOf("\\]", bracket) < 0) tail = tail.slice(0, bracket);

  // a table waits until the line under its first row is whole
  const lines = tail.split("\n");
  const first = lines.findIndex((l) => /^\s*\|/u.test(l));
  if (first >= 0) {
    const header = lines[first] as string;
    const under = lines[first + 1];
    const whole = under !== undefined && under.includes("-") && DIVIDER.test(under) && cells(under) >= cells(header) && (first + 2 < lines.length || /\|\s*$/u.test(under));
    if (!whole) tail = lines.slice(0, first).join("\n");
  }

  // a link whose address is still coming reads as its words
  tail = tail.replace(/!?\[([^\]\n]*)\]\([^)\n]*$/u, "$1");

  // an unfinished code span, then an unfinished bold or strikethrough, closes
  if ((tail.replace(/`[^`\n]*`/gu, "").match(/`/gu)?.length ?? 0) % 2 === 1) tail = /`\s*$/u.test(tail) ? tail.replace(/`\s*$/u, "") : `${tail}\``;
  for (const mark of ["**", "~~"]) {
    const outside = tail.replace(/`[^`\n]*`/gu, "");
    if ((outside.split(mark).length - 1) % 2 === 1) {
      const trimmed = tail.trimEnd();
      tail = trimmed.endsWith(mark) ? trimmed.slice(0, -mark.length) : `${tail}${mark}`;
    }
  }
  return head + tail;
}
