// SPDX-License-Identifier: AGPL-3.0-only
// The stations a provider just added does not answer (record 24): each with
// what moving it there needs, a Change beside each that may move, and nothing
// drawn once every station goes there.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClosedStations } from "./ClosedStations";
import type { Backend, PurposeRow } from "./kvasir";

const minimax: Backend = { id: "minimax", kind: "openai-completions", locality: "remote", provider: "minimax", credential: true, models: ["MiniMax-M3"], health: {} };
const purpose = (over: Partial<PurposeRow>): PurposeRow => ({
  purpose: "assistant.concierge",
  app: "nils-assistant",
  content: "rows",
  kind: "foreground",
  backend: null,
  locality: null,
  default: true,
  acknowledged: null,
  may_open_remote: "",
  ...over,
});

describe("the stations a provider does not answer", () => {
  it("names each with what a move needs, and offers Change for those that may move", () => {
    const purposes = [purpose({}), purpose({ purpose: "assistant.operator", content: "catalog" }), purpose({ purpose: "desk.identity", content: "identifiers" })];
    const html = renderToStaticMarkup(<ClosedStations provider={minimax} purposes={purposes} onChange={() => undefined} />);
    expect(html).toContain("MiniMax-M3 answers no station yet");
    expect(html).toContain("concierge carries rows of the archive, which go there only once you write down why.");
    expect(html).toContain("operator reads no rows, and goes there once you move it.");
    expect(html).toContain("desk.identity carries identifiers, which never leave your systems.");
    expect(html.match(/>Change<\/button>/gu)).toHaveLength(2);
    expect(html).toContain('aria-label="Change where concierge goes"');
  });

  it("draws nothing once every station goes to it", () => {
    const html = renderToStaticMarkup(<ClosedStations provider={minimax} purposes={[purpose({ backend: "minimax", locality: "remote" })]} onChange={() => undefined} />);
    expect(html).toBe("");
  });
});
