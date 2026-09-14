// SPDX-License-Identifier: AGPL-3.0-only
// The download dialog as it opens: the model's name, a revision that is main
// when left empty, the patterns with an example, and nothing to look up or
// download before a model is named.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DownloadModel } from "./DownloadModel";

describe("downloading a model", () => {
  it("opens on an empty name, main as the revision and the patterns with an example, with Look up and Download held back", () => {
    const html = renderToStaticMarkup(<DownloadModel token={false} free={null} onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toContain("Download a model");
    expect(html).toContain('placeholder="owner/name"');
    expect(html).toContain('placeholder="main"');
    expect(html).toContain('placeholder="*Q4_K_M.gguf"');
    expect(html).toContain("one a line or separated by commas");
    expect(html).toContain("a model is named as the hub names it, owner/name");
    expect(html).not.toContain('type="password"');
    expect(html).toMatch(/<button type="button" class="button secondary small" disabled="">Look up<\/button>/u);
    expect(html).toMatch(/<button type="button" class="button" disabled="">Download<\/button>/u);
  });
});
