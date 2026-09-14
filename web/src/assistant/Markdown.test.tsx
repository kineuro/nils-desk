// SPDX-License-Identifier: AGPL-3.0-only
// An answer's markdown as the page draws it: the shapes kept, nothing run.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, safeHref } from "./Markdown";
import { mend } from "./mend";

const draw = (text: string, streaming = false) => renderToStaticMarkup(<Markdown text={text} streaming={streaming} />);

describe("an answer's markdown", () => {
  it("keeps headings at six levels below the page's own, emphasis and code, and escapes what it quotes", () => {
    const html = draw("# Cohorts\n\nA < b & **bold** and *soft* `x<y`");
    expect(html).toContain('<h3 class="md-h1">Cohorts</h3>');
    expect(html).toContain("A &lt; b &amp; <strong>bold</strong> and <em>soft</em> <code>x&lt;y</code>");
    const levels = draw("# one\n\n## two\n\n### three\n\n#### four\n\n##### five\n\n###### six\n\nSetext\n===");
    expect(levels).toContain('<h4 class="md-h2">two</h4>');
    expect(levels).toContain('<h5 class="md-h3">three</h5>');
    expect(levels).toContain('<h6 class="md-h4">four</h6>');
    expect(levels).toContain('<h6 class="md-h5">five</h6>');
    expect(levels).toContain('<h6 class="md-h6">six</h6>');
    expect(levels).toContain('<h3 class="md-h1">Setext</h3>');
  });

  it("opens only links to the web or to mail, reads raw HTML as text, and never loads an image", () => {
    const html = draw('[site](https://example.org "The site") [bad](javascript:alert(1)) <b onclick="x">loud</b> ![a scan](https://example.org/a.png) ![](https://example.org/b.png)');
    expect(html).toContain('<a href="https://example.org" title="The site" target="_blank" rel="noreferrer noopener">site</a>');
    expect(html).not.toContain("javascript:");
    expect(html).toContain("bad");
    expect(html).toContain("&lt;b onclick=&quot;x&quot;&gt;loud&lt;/b&gt;");
    expect(html).not.toContain("<img");
    expect(html).toContain('<span class="md-image">a scan</span>');
    expect(html).toContain('<span class="md-image">image (example.org)</span>');
    expect(safeHref(" mailto:someone@example.org ")).toBe("mailto:someone@example.org");
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("/relative")).toBeNull();
    expect(draw("See https://example.org/docs and <https://example.org/x>.")).toContain('<a href="https://example.org/docs" target="_blank" rel="noreferrer noopener">https://example.org/docs</a>');
  });

  it("lets a few tags shape words, hides a comment, and keeps a details block", () => {
    const html = draw("H<sub>2</sub>O is <kbd>Ctrl</kbd>+<kbd>C</kbd>, a<br>b, <mark>seen</mark> <!-- not shown --> <script>x</script>");
    expect(html).toContain("H<sub>2</sub>O is <kbd>Ctrl</kbd>+<kbd>C</kbd>, a<br/>b, <mark>seen</mark>");
    expect(html).not.toContain("not shown");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(draw("<details>\n<summary>More</summary>\n\nInside **bold**\n\n</details>")).toContain("<details><summary>More</summary><p>Inside <strong>bold</strong></p></details>");
    expect(draw("<details open><summary>All</summary>kept</details>")).toContain('<details open=""><summary>All</summary><p>kept</p></details>');
    expect(draw("<div>\n  a block\n</div>")).toContain('<p class="md-html">&lt;div&gt;\n  a block\n&lt;/div&gt;</p>');
    expect(draw("<!-- a comment on its own -->")).toBe('<div class="md"></div>');
  });

  it("reads character references, keeps a single tilde as a tilde, and draws sub and superscripts", () => {
    expect(draw("&copy; 2026 &ndash; G&ouml;teborg &#8805; 3 &#x1F9E0; &amp; &bogus;")).toContain("© 2026 – Göteborg ≥ 3 🧠 &amp; &amp;bogus;");
    expect(draw("`&copy;`")).toContain("<code>&amp;copy;</code>");
    const html = draw("~5 subjects and ~10 sessions, H~2~O, x^2^, ~~gone~~");
    expect(html).toContain("~5 subjects and ~10 sessions, H<sub>2</sub>O, x<sup>2</sup>, <del>gone</del>");
    expect(draw("\\*not emphasis\\* and \\_this\\_")).toContain("*not emphasis* and _this_");
  });

  it("draws a table that scrolls inside itself, aligned as written, with shaped cells", () => {
    const html = draw("| cohort | subjects | note |\n|:--|--:|:-:|\n| A | 38 | a<br>b |");
    expect(html).toContain('<div class="md-table"><table class="thin">');
    expect(html).toContain('<th class="md-left">cohort</th><th class="md-right">subjects</th><th class="md-center">note</th>');
    expect(html).toContain('<td class="md-left">A</td><td class="md-right">38</td><td class="md-center">a<br/>b</td>');
  });

  it("keeps lists tight or loose, nested, numbered from where they start, and ticked without the brackets", () => {
    expect(draw("- one\n- two\n  1. deep")).toContain("<ul><li>one</li><li>two<ol><li>deep</li></ol></li></ul>");
    expect(draw("3. third\n4. fourth")).toContain('<ol start="3"><li>third</li><li>fourth</li></ol>');
    expect(draw("0. zero")).toContain('<ol start="0"><li>zero</li></ol>');
    expect(draw("- [x] counted")).toContain('<input type="checkbox" disabled="" aria-label="done" checked=""/>counted');
    const loose = draw("- [ ] open\n\n- [x] done");
    expect(loose).toContain('<li><input type="checkbox" disabled="" aria-label="not done"/><p>open</p></li>');
    expect(loose).not.toContain("[ ]");
    expect(loose).not.toContain("[x]");
  });

  it("draws code as code named by its language, even while the fence is still open, and keeps a line break", () => {
    const html = draw("```sql\nselect 1 < 2;\n```");
    expect(html).toContain('<span class="meta">sql</span>');
    expect(html).toContain("<pre><code>select 1 &lt; 2;</code></pre>");
    expect(draw("```python title=counts.py\nprint(1)\n```")).toContain('<span class="meta">python</span>');
    expect(draw("    indented\n    code")).toContain('<span class="meta">code</span>');
    expect(draw("Counting:\n```js\nlet n = 1")).toContain("<pre><code>let n = 1</code></pre>");
    expect(draw("Subjects: 38\nSessions: 122")).toContain("Subjects: 38<br/>Sessions: 122");
  });

  it("keeps quotes, rules and alerts", () => {
    expect(draw("> quoted\n>\n> > deeper\n\n---")).toContain("<blockquote><p>quoted</p><blockquote><p>deeper</p></blockquote></blockquote><hr/>");
    const note = draw("> [!WARNING]\n> Sessions after 2020 are not yet read.");
    expect(note).toContain('<div class="md-alert md-alert-warning" role="note"><p class="md-alert-title">');
    expect(note).toContain("Warning</p><p>Sessions after 2020 are not yet read.</p></div>");
    expect(note).not.toContain("[!WARNING]");
  });

  it("gathers footnotes at the end, numbered as they are called, and leaves an unknown one as written", () => {
    const html = draw("A claim[^src] and another[^2], then [^none].\n\n[^2]: The second.\n[^src]: The *source*.");
    expect(html).toMatch(/<sup class="md-fnref"><a href="#[^"]+-fn-src" id="[^"]+-ref-src" aria-label="Note 1">1<\/a><\/sup>/u);
    expect(html).toMatch(/aria-label="Note 2">2<\/a>/u);
    expect(html).toContain("then [^none].");
    expect(html).toMatch(/<section class="md-footnotes" aria-label="Notes"><ol><li id="[^"]+-fn-src">The <em>source<\/em>\.? /u);
    expect(html.indexOf("The <em>source</em>")).toBeLessThan(html.indexOf("The second."));
  });

  it("keeps formulas apart from prices, and reads a formula as its TeX until the formula library has loaded", () => {
    const prices = draw("It costs $5 and $10, or US$20, and \\$30.");
    expect(prices).toContain("It costs $5 and $10, or US$20, and $30.");
    expect(prices).not.toContain("md-math");
    expect(draw("The mean $\\bar{x}$ and \\(a_b\\).")).toContain('The mean <code class="md-math-source">\\bar{x}</code> and <code class="md-math-source">a_b</code>.');
    expect(draw("$$\n\\frac{a}{b} \\\\ c\n$$")).toContain('<pre class="md-math-source">\\frac{a}{b} \\\\ c</pre>');
    expect(draw("\\[\nx^2\n\\]")).toContain('<pre class="md-math-source">x^2</pre>');
    expect(draw("```math\ne = mc^2\n```")).toContain('<pre class="md-math-source">e = mc^2</pre>');
    expect(draw("`$x$` stays code")).toContain("<code>$x$</code> stays code");
  });

  it("draws a reply still arriving without its loose ends", () => {
    expect(draw("It is **bo", true)).toContain("<p>It is <strong>bo</strong></p>");
    expect(draw("See [the site](https://exa", true)).toContain("<p>See the site</p>");
    expect(draw("Counts:\n\n| cohort | subjects |", true)).toBe('<div class="md"><p>Counts:</p></div>');
    expect(draw("It is **bo")).toContain("It is **bo");
  });
});

describe("a reply made whole enough to draw", () => {
  it("closes bold, strikethrough and code spans, and drops a mark with nothing after it", () => {
    expect(mend("It is **bo")).toBe("It is **bo**");
    expect(mend("It is ~~go")).toBe("It is ~~go~~");
    expect(mend("Some **")).toBe("Some ");
    expect(mend("run `select")).toBe("run `select`");
    expect(mend("run `select` then **x")).toBe("run `select` then **x**");
    expect(mend("the `**kwargs")).toBe("the `**kwargs`");
  });

  it("reads a link still coming as its words, waits for a table's divider and a formula's close, and leaves open code alone", () => {
    expect(mend("see [the site](https://exa")).toBe("see the site");
    expect(mend("one\n\n| a | b |")).toBe("one\n\n");
    expect(mend("one\n\n| a | b |\n|---|--")).toBe("one\n\n");
    expect(mend("| a | b |\n|---|---|")).toBe("| a | b |\n|---|---|");
    expect(mend("| a | b |\n|---|---|\n| 1 |")).toBe("| a | b |\n|---|---|\n| 1 |");
    expect(mend("text\n\n$$\n\\frac{a}")).toBe("text\n\n");
    expect(mend("where \\[x^")).toBe("where ");
    expect(mend("```js\nlet **x")).toBe("```js\nlet **x");
  });
});
