// SPDX-License-Identifier: AGPL-3.0-only
// MathML read into React elements from an allowlist, and character references
// read as characters.

import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { decodeEntities } from "./entities";
import { mathElements, parseMathML } from "./mathml";

const drawn = (xml: string) => {
  const tree = parseMathML(xml);
  return tree ? renderToStaticMarkup(createElement(Fragment, null, mathElements(tree, "t"))) : null;
};

describe("MathML as React elements", () => {
  it("keeps the elements and attributes of a formula, and its text", () => {
    const html = drawn('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" class="tml-display" style="display:block math;"><mrow><mi>a</mi><mo form="infix">&lt;</mo><mn>2</mn></mrow></math>');
    expect(html).toBe('<math display="block" class="tml-display" style="display:block math"><mrow><mi>a</mi><mo form="infix">&lt;</mo><mn>2</mn></mrow></math>');
  });

  it("leaves out colours, images, handlers, links and unknown elements, keeping their children", () => {
    const html = drawn(
      '<math><mstyle mathcolor="red" style="color:red;padding-left:0.2em;background:url(x)"><mi onclick="x" href="javascript:1">x</mi></mstyle><span class="bad">y</span><semantics><annotation encoding="application/x-tex">x</annotation></semantics></math>',
    );
    expect(html).toBe('<math><mstyle style="padding-left:0.2em"><mi>x</mi></mstyle>y<semantics></semantics></math>');
  });

  it("reads self-closed elements, and nothing that is not a formula", () => {
    expect(drawn('<math><mspace width="1em"/><mi>x</mi></math>')).toBe('<math><mspace width="1em"></mspace><mi>x</mi></math>');
    expect(drawn("<div>no formula</div>")).toBeNull();
  });
});

describe("character references", () => {
  it("reads named and numbered references, and leaves unknown ones as written", () => {
    expect(decodeEntities("&nbsp;&copy;&times;&yuml;")).toBe(" ©×ÿ");
    expect(decodeEntities("&Alpha;&Omega;&alpha;&sigmaf;&omega;")).toBe("ΑΩαςω");
    expect(decodeEntities("&le; &ge; &ne; &hellip; &euro; &rarr;")).toBe("≤ ≥ ≠ … € →");
    expect(decodeEntities("&#8805; &#x2265; &#X1F600;")).toBe("≥ ≥ 😀");
    expect(decodeEntities("&bogus; &#0; &#xD800; & alone")).toBe("&bogus; &#0; &#xD800; & alone");
  });
});
