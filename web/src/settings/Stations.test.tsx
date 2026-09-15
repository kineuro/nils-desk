// SPDX-License-Identifier: AGPL-3.0-only
// Where each station goes as it draws (record 25): a box that opens the drawer
// for a person with Kvasir: Work, a plain box for anyone else and for a
// station that may not move, who allowed it beside, and the drawer itself.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { routes, type Viewer } from "./gateway";
import type { Backend, PurposeRow } from "./kvasir";
import { MoveDrawer, StationRoutes } from "./Stations";

const runtime: Backend = { id: "llama-cpp", kind: "openai-completions", locality: "local", provider: null, credential: null, models: ["Qwen3.6-27B-Q4_K_M"], health: {} };
const minimax: Backend = { id: "minimax", kind: "openai-completions", locality: "remote", provider: "minimax", credential: true, models: ["MiniMax-M3"], health: {} };
const purpose = (over: Partial<PurposeRow>): PurposeRow => ({
  purpose: "assistant.concierge",
  app: "nils-assistant",
  content: "rows",
  kind: "foreground",
  backend: "llama-cpp",
  locality: "local",
  default: true,
  acknowledged: null,
  may_open_remote: "",
  ...over,
});

const admin: Viewer = { work: true, subscribes: true, system: false };
const person: Viewer = { work: false, subscribes: true, system: false };
const purposes = [purpose({ purpose: "assistant.ask-help" }), purpose({ purpose: "assistant.operator", content: "catalog", backend: "minimax", locality: "remote" })];
const lines = (viewer: Viewer, backends = [runtime, minimax], rows = purposes) => routes(rows, backends, { viewer, admissions: null, subscription: null });

describe("where each station goes", () => {
  it("opens a station's box for a person with Kvasir: Work, with the chevron that says so", () => {
    const html = renderToStaticMarkup(<StationRoutes routes={lines(admin)} onChange={() => undefined} />);
    expect(html.match(/<button type="button" class="dest">/gu)).toHaveLength(2);
    expect(html).toContain("Change where ask-help goes, now ");
    expect(html).toContain('<span class="station">ask-help</span><span class="tag">carries rows</span>');
    expect(html).toContain("<b>Qwen3.6-27B-Q4_K_M</b>");
    expect(html).toContain('<span class="meta">this machine, llama.cpp</span>');
    expect(html).toContain('<span class="tag ok">stays in your systems</span>');
    expect(html).toContain('<span class="sq brand">');
    expect(html).toContain('<span class="chev">');
    expect(html).toContain('<span class="tag">carries the catalogue</span>');
    expect(html).toContain('<span class="tag caution">leaves your systems</span>');
    expect(html).toContain('<span class="meta side">no rows, so no reason needed</span>');
  });

  it("draws a plain box for a person who may not move a station", () => {
    const html = renderToStaticMarkup(<StationRoutes routes={lines(person)} onChange={() => undefined} />);
    expect(html).not.toContain("<button");
    expect(html.match(/class="dest plain"/gu)).toHaveLength(2);
    expect(html).not.toContain("chev");
  });

  it("keeps a station plain where it has nowhere else to go", () => {
    const html = renderToStaticMarkup(<StationRoutes routes={lines(admin, [runtime], [purpose({ content: "identifiers" })])} onChange={() => undefined} />);
    expect(html).not.toContain("<button");
    expect(html).toContain('class="dest plain"');
  });
});

describe("the drawer", () => {
  it("says where the station goes now, the backends it may move to, and asks why rows would leave", () => {
    const row = purpose({});
    const [now] = lines(admin, [runtime, minimax], [row]);
    const html = renderToStaticMarkup(<MoveDrawer purpose={row} backends={[runtime, minimax]} system={false} now={now.to} toward="minimax" onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toContain("Where concierge goes");
    expect(html).toContain("Qwen3.6-27B-Q4_K_M, this machine, llama.cpp");
    expect(html).toContain("MiniMax-M3");
    expect(html).toContain("Why rows of the archive may leave, for this purpose");
    expect(html).toContain("Move concierge");
  });
});
