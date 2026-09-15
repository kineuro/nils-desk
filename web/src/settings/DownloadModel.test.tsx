// SPDX-License-Identifier: AGPL-3.0-only
// Downloading a model to this machine, as Add a model draws it (record 25):
// the model's name with Look it up, a revision that is main when left empty
// and the patterns with an example folded under it, and nothing to look up or
// download before a model is named.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AddModel } from "./AddModel";
import type { LocalStatus } from "./kvasir";

const local: LocalStatus = { location: "/srv/models", free_bytes: null, token: false, models: [], runtime: { build: "b10964", variant: "ubuntu-vulkan-x64", reachable: true, serving: null } };

describe("downloading a model", () => {
  it("opens on an empty name, main as the revision and the patterns with an example, with Look it up and Download held back", () => {
    const html = renderToStaticMarkup(<AddModel choices={["download"]} local={local} onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toContain("Add a model");
    expect(html).toContain("A GGUF model from the Hugging Face Hub, started by Kvasir on llama.cpp here. Prompts stay in your systems.");
    expect(html).toContain('placeholder="owner/name"');
    expect(html).toContain("<summary>Another revision, or only some files</summary>");
    expect(html).toContain('placeholder="main"');
    expect(html).toContain('placeholder="*Q4_K_M.gguf"');
    expect(html).toContain("one a line or separated by commas");
    expect(html).toContain("a model is named as the hub names it, owner/name");
    expect(html).not.toContain('type="password"');
    expect(html).toMatch(/<button type="button" class="button secondary" disabled="">Look it up<\/button>/u);
    expect(html).toMatch(/<button type="button" class="button" disabled="">Download<\/button>/u);
  });

  it("says whether a Hugging Face token is set, and offers to set or replace it there", () => {
    const unset = renderToStaticMarkup(<AddModel choices={["download"]} local={local} onClose={() => undefined} onDone={() => undefined} />);
    expect(unset).toContain('<span class="label">Hugging Face token</span>');
    expect(unset).toContain('<span class="tag">not set</span>');
    expect(unset).toContain(">Set</button>");
    expect(unset).toContain("Gated models need one.");
    const set = renderToStaticMarkup(<AddModel choices={["download"]} local={{ ...local, token: true }} onClose={() => undefined} onDone={() => undefined} />);
    expect(set).toContain('<span class="tag ok">set</span>');
    expect(set).toContain(">Replace</button>");
    expect(set).not.toContain('type="password"');
  });
});
