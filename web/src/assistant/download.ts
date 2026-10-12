// SPDX-License-Identifier: AGPL-3.0-only
// A conversation saved as a markdown file (the chat, slice 7): a name a file
// system keeps, and the text handed to the browser as a download. A chart or
// a file a turn wrote is handed over the same way.

/** The file's name: the conversation's title in plain lowercase words, and the day it was saved. */
export function exportName(title: string | null, at: Date = new Date()): string {
  const words = (title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60)
    .replace(/-+$/u, "");
  return `${words || "conversation"}-${at.toISOString().slice(0, 10)}.md`;
}

/** Hand a text to the browser as a file to save. */
export function saveText(name: string, text: string, type = "text/markdown"): void {
  save(name, new Blob([text], { type }));
}

/** Hand bytes written in base64 (a chart's PNG) to the browser as a file to save. */
export function saveBase64(name: string, data: string, type: string): void {
  save(name, new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type }));
}

function save(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
