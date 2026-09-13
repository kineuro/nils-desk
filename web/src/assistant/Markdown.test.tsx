// SPDX-License-Identifier: AGPL-3.0-only
// An answer's markdown as the page draws it: the shapes kept, nothing run.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, safeHref } from "./Markdown";

const draw = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

describe("an answer's markdown", () => {
  it("keeps headings, emphasis and code, and escapes what it quotes", () => {
    const html = draw("# Cohorts\n\nA < b & **bold** and *soft* `x<y`");
    expect(html).toContain("<h3>Cohorts</h3>");
    expect(html).toContain("A &lt; b &amp; <strong>bold</strong> and <em>soft</em> <code>x&lt;y</code>");
  });

  it("opens only links to the web or to mail, reads raw HTML as text, and never loads an image", () => {
    const html = draw("[site](https://example.org) [bad](javascript:alert(1)) <b>loud</b> ![a scan](https://example.org/a.png)");
    expect(html).toContain('<a href="https://example.org" target="_blank" rel="noreferrer noopener">site</a>');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("bad");
    expect(html).toContain("&lt;b&gt;loud&lt;/b&gt;");
    expect(html).not.toContain("<img");
    expect(html).toContain('<span class="md-image">a scan</span>');
    expect(safeHref(" mailto:someone@example.org ")).toBe("mailto:someone@example.org");
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("/relative")).toBeNull();
  });

  it("draws a table that scrolls inside itself, aligned as written", () => {
    const html = draw("| cohort | subjects |\n|:--|--:|\n| A | 38 |");
    expect(html).toContain('<div class="md-table"><table class="thin">');
    expect(html).toContain('<th class="md-left">cohort</th><th class="md-right">subjects</th>');
    expect(html).toContain('<td class="md-left">A</td><td class="md-right">38</td>');
  });

  it("keeps lists tight, nested, numbered from where they start, and ticked", () => {
    expect(draw("- one\n- two\n  1. deep")).toContain("<ul><li>one</li><li>two<ol><li>deep</li></ol></li></ul>");
    expect(draw("3. third\n4. fourth")).toContain('<ol start="3"><li>third</li><li>fourth</li></ol>');
    expect(draw("- [x] counted")).toContain('<input type="checkbox" disabled="" aria-label="done" checked=""/>counted');
  });

  it("draws code as code with its language, even while the fence is still open, and keeps a line break", () => {
    const html = draw("```sql\nselect 1 < 2;\n```");
    expect(html).toContain('<span class="meta">sql</span>');
    expect(html).toContain("<pre><code>select 1 &lt; 2;</code></pre>");
    expect(draw("Counting:\n```js\nlet n = 1")).toContain("<pre><code>let n = 1</code></pre>");
    expect(draw("Subjects: 38\nSessions: 122")).toContain("Subjects: 38<br/>Sessions: 122");
  });
});
