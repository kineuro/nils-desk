// SPDX-License-Identifier: AGPL-3.0-only
// The run panel as it first draws, before the assistant has answered: its
// head with the station and the person, every phase waiting, no act yet.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import { StationRun } from "./StationRun";

const caps = {
  engine: null,
  kvasir: { models: [{ id: "qwen-27b", locality: "local" }] },
  assistant: { stations: [{ id: "keyword-tune" }] },
  apps: [],
  person: { subject: "astrid", display_name: "Astrid", grants: ["review:work", "data:work", "assistant:use"], detail: "sensitive", groups: [] },
  desk: {},
} as unknown as Capabilities;

describe("a station run's panel", () => {
  it("draws its head and the waiting phases before the run has started", () => {
    const html = renderToStaticMarkup(<StationRun caps={caps} station="keyword-tune" message="Tune post_contrast for batch:12" title="Tune post_contrast for batch alpha" acts={() => <button type="button">Adopt</button>} />);
    expect(html).toContain("<h2>Tune post_contrast for batch alpha</h2>");
    expect(html).toContain("the keyword-tune station · qwen-27b · this machine · asked by Astrid");
    expect(html.match(/<li class="wait">/gu)).toHaveLength(5);
    expect(html).toContain("<b>Survey</b>");
    expect(html).toContain("<b>Proposal</b>");
    expect(html).not.toContain(">Adopt</button>");
    expect(html).toContain("waiting for the station");
  });
  it("says of an identity-check that it sees shapes and counts only", () => {
    const html = renderToStaticMarkup(<StationRun caps={caps} station="identity-check" message="Check the identity rule of alpha" title="Check the identity rule of alpha" acts={() => null} />);
    expect(html).toContain("shapes and counts only, never a value or a path");
    expect(html.match(/<li class="wait">/gu)).toHaveLength(4);
  });
});
