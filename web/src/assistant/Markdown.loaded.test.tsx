// SPDX-License-Identifier: AGPL-3.0-only
// An answer's formulas and code once their libraries have loaded: formulas as
// MathML with the theme's colours kept, code coloured by its language.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { loadHighlight } from "./highlight";
import { Markdown } from "./Markdown";
import { loadMath } from "./mathml";

const draw = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

beforeAll(async () => {
  await Promise.all([loadMath(), loadHighlight()]);
});

describe("formulas and code, drawn", () => {
  it("draws an inline formula and a display formula as MathML", () => {
    const inline = draw("The mean is $\\bar{x} = \\frac{1}{n}\\sum_i x_i$ here.");
    expect(inline).toContain('<span class="md-math-inline"><math');
    expect(inline).toContain("<mfrac>");
    expect(inline).toContain("</math></span> here.");
    const display = draw("$$\n\\sqrt{a^2 + b^2}\n$$");
    expect(display).toContain('<div class="md-math"><math');
    expect(display).toContain('display="block"');
    expect(display).toContain("<msqrt>");
    expect(draw("\\(a_b\\) and \\[x^2\\]")).toContain("<msub>");
    expect(draw("```math\n\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}\n```")).toContain("<mtable");
  });

  it("leaves out a colour a formula asks for, and reads a formula it cannot draw as its TeX", () => {
    const coloured = draw("$\\color{red}{x}$ and $\\textcolor{blue}{y}$");
    expect(coloured).toContain("<math");
    expect(coloured).not.toMatch(/red|blue|mathcolor|color:/iu);
    const broken = draw("$\\frac{a}{$");
    expect(broken).toContain('title="This formula could not be drawn, so it reads as written"');
    // a link a formula asks for is never made: at most its TeX reads as words
    expect(draw("$\\href{javascript:alert(1)}{x}$")).not.toMatch(/href=|<a /u);
  });

  it("colours code in a language it knows, and leaves an unknown language plain", () => {
    const py = draw('```python\ndef count(cohort):\n    return len(cohort)  # subjects\n```');
    expect(py).toContain('<span class="hljs-keyword">def</span>');
    expect(py).toContain('<span class="hljs-comment"># subjects</span>');
    expect(draw("```sql\nselect 1;\n```")).toContain('<span class="hljs-keyword">select</span>');
    expect(draw("```nonesuch\nplain words\n```")).toContain("<pre><code>plain words</code></pre>");
    expect(draw("```\nno language\n```")).toContain("<pre><code>no language</code></pre>");
  });
});
