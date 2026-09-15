// SPDX-License-Identifier: AGPL-3.0-only
// The Kvasir page as it opens (record 25), before Kvasir answered: what it
// says it is, the way back to the parts, and Add a model, by what the person
// may do there.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import { SETS, type Grant } from "../grants";
import { GatewayPage } from "./GatewayPage";

const caps = (grants: Grant[]) =>
  ({
    engine: null,
    kvasir: { models: [], kvasir: { version: "1.0.0-alpha.7" } },
    assistant: null,
    apps: [],
    person: { subject: "someone", display_name: "Someone", grants, detail: "plain", groups: [] },
    desk: { version: "1", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  }) as Capabilities;

const page = (grants: Grant[]) => renderToStaticMarkup(<GatewayPage caps={caps(grants)} install={null} />);

describe("the Kvasir page", () => {
  it("tells an admin what it is in a few words, leads back to the parts, and offers Add a model", () => {
    const html = page([...SETS.admin.grants, "assistant:use"]);
    expect(html).toContain('href="#settings/parts"');
    expect(html).toContain('<p class="lede">Which model each station goes to.</p>');
    expect(html).toContain("version 1.0.0-alpha.7");
    expect(html).not.toContain("what the stations can go to");
    expect(html).toContain("Add a model</button>");
  });

  it("says nothing to a person who may use the assistant and see Kvasir about who adds what", () => {
    const html = page(["kvasir:see", "assistant:use"]);
    expect(html).not.toContain('href="#settings/parts"');
    expect(html).toContain('<p class="lede">Which model each station goes to.</p>');
    expect(html).not.toContain("version 1.0.0-alpha.7");
    expect(html).not.toContain("Kvasir: Work");
    expect(html).not.toContain("admin");
    // Add a model waits for Kvasir to answer with the subscription it offers
    expect(html).not.toContain("Add a model</button>");
  });

  it("offers a person who may only see Kvasir nothing to add", () => {
    expect(page(["kvasir:see"])).not.toContain("Add a model</button>");
  });
});
