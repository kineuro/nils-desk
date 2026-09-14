// SPDX-License-Identifier: AGPL-3.0-only
// The add dialog as it opens: the three places a model can be, a server on
// this machine at its address, and nothing to test or add before its models
// are found.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddModel } from "./AddModel";

describe("adding a model", () => {
  it("opens on a server on this machine at its address, with Test and Add held back", () => {
    const html = renderToStaticMarkup(<AddModel onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toContain("A model server on this machine");
    expect(html).toContain("A model server on another machine of yours");
    expect(html).toContain("A provider");
    expect(html).toContain('value="http://127.0.0.1:30000/v1"');
    expect(html).toContain("Find its models");
    expect(html).toContain("It needs a key");
    expect(html).not.toContain('type="password"');
    expect(html).toContain("admission suite");
    expect(html).toMatch(/<button type="button" class="button secondary" disabled="">Test<\/button>/u);
    expect(html).toMatch(/<button type="button" class="button" disabled="">Add<\/button>/u);
  });
});
