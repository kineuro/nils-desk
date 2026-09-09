// SPDX-License-Identifier: AGPL-3.0-only
// A unified diff of two canonical texts, for a proposal (Wave 4c section
// 7.7). Lines only, three lines of context, no library.

export type Line = { tag: " " | "-" | "+"; text: string };

/** The edit script of a against b by longest common subsequence over lines. */
export function lineDiff(a: string, b: string): Line[] {
  const x = a.length ? a.split("\n") : [];
  const y = b.length ? b.split("\n") : [];
  const n = x.length;
  const m = y.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = x[i] === y[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const out: Line[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ tag: " ", text: x[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) out.push({ tag: "-", text: x[i++] });
    else out.push({ tag: "+", text: y[j++] });
  }
  while (i < n) out.push({ tag: "-", text: x[i++] });
  while (j < m) out.push({ tag: "+", text: y[j++] });
  return out;
}

/** The unified text: hunks of changed lines with three lines of context; empty when nothing changed. */
export function unified(a: string, b: string, context = 3): string {
  const lines = lineDiff(a, b);
  if (!lines.some((l) => l.tag !== " ")) return "";
  const keep = new Set<number>();
  lines.forEach((l, k) => {
    if (l.tag === " ") return;
    for (let d = -context; d <= context; d++) if (k + d >= 0 && k + d < lines.length) keep.add(k + d);
  });
  const out: string[] = [];
  let ia = 1;
  let ib = 1;
  let hunk: string[] = [];
  let ha = 0;
  let hb = 0;
  let ca = 0;
  let cb = 0;
  const flush = () => {
    if (hunk.length) out.push(`@@ -${ha},${ca} +${hb},${cb} @@`, ...hunk);
    hunk = [];
  };
  lines.forEach((l, k) => {
    if (keep.has(k)) {
      if (!hunk.length) {
        ha = ia;
        hb = ib;
        ca = 0;
        cb = 0;
      }
      hunk.push(`${l.tag}${l.text}`);
      if (l.tag !== "+") ca++;
      if (l.tag !== "-") cb++;
    } else flush();
    if (l.tag !== "+") ia++;
    if (l.tag !== "-") ib++;
  });
  flush();
  return out.join("\n");
}
