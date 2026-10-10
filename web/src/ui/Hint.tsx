// SPDX-License-Identifier: AGPL-3.0-only
// The one place an explanation lives on a page: a small "?" that says it on
// hover or focus, never a paragraph on the page itself.

export function Hint({ text }: { text: string }) {
  return (
    <span className="hint" tabIndex={0} role="note" title={text} aria-label={text}>
      ?
    </span>
  );
}
