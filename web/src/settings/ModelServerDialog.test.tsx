// SPDX-License-Identifier: AGPL-3.0-only
// A model server as the Kvasir page draws it (record 47), against what a
// throwaway Kvasir answered for a server listing two models: Add a model's
// "A model server" asks for an address and a key the desk never keeps; the
// list shows every model with its specs and whether it is loaded, ticked or
// held already, and each ticked model's result as Kvasir reported it; the
// server is one card whose models are each removable; and a station's drawer
// picks one of the server's models.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import admitted from "../../test/fixtures/kvasir_servers_admit.json";
import held from "../../test/fixtures/kvasir_backends_server.json";
import offered from "../../test/fixtures/kvasir_servers_models.json";
import { AddModel, ServerOffer } from "./AddModel";
import { ModelServerCard } from "./cards";
import { routes, type Viewer } from "./gateway";
import type { Backend, Offer, PurposeRow, ServerAdmitted } from "./kvasir";
import { serverCards } from "./models";
import { MoveDrawer } from "./Stations";

const offer = offered as unknown as Offer;
const done = admitted as unknown as ServerAdmitted;
const server = held.backends[0] as unknown as Backend;
const admin: Viewer = { work: true, subscribes: true, system: false };
const person: Viewer = { work: false, subscribes: true, system: false };
const purpose = (over: Partial<PurposeRow>): PurposeRow => ({
  purpose: "assistant.title",
  app: "nils-assistant",
  content: "catalog",
  kind: "background",
  backend: server.id,
  model: null,
  locality: "local",
  default: false,
  acknowledged: null,
  may_open_remote: "",
  ...over,
});
const purposes = [purpose({ model: "qwen3.8-flash-next" }), purpose({ purpose: "assistant.ask-help", content: "rows" })];
const card = (viewer: Viewer) => serverCards([server], { viewer, catalogue: [], admissions: null, purposes, now: Date.now(), checking: null })[0];

describe("Add a model: a model server", () => {
  it("asks for its address and a key the desk does not keep, with nothing to admit before its models are listed", () => {
    const html = renderToStaticMarkup(<AddModel choices={["modelserver", "server", "provider"]} onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toMatch(/<label class="pick on"><span class="sq">.*?<b>A model server<\/b>/u);
    expect(html).toContain("<b>A model server of yours</b>");
    expect(html).toContain("Its address");
    expect(html).toContain('type="password"');
    expect(html).toContain("Optional. Sealed in Kvasir; the desk keeps nothing.");
    expect(html).toMatch(/<button type="button" class="button secondary small" disabled="">List its models<\/button>/u);
    expect(html).toContain("a server has an address");
    expect(html).toMatch(/<button type="button" class="button" disabled="">Admit<\/button>/u);
    expect(html).not.toContain("Context window");
  });

  it("opens on a server Kvasir holds, its address fixed and its key sealed already", () => {
    const html = renderToStaticMarkup(<AddModel choices={["modelserver"]} server={{ url: "http://127.0.0.1:18741/v1", backend: server.id }} onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toContain('disabled="" value="http://127.0.0.1:18741/v1"');
    expect(html).toContain("Kvasir uses the key it holds. Type one to replace it.");
    expect(html).toMatch(/<button type="button" class="button secondary small">List its models<\/button>/u);
  });

  it("lists every model with its specs and whether it is loaded, the default said, ticks as given", () => {
    const html = renderToStaticMarkup(<ServerOffer offer={offer} ticked={["qwen38-27b"]} results={null} />);
    expect(html.match(/<label class="file-row/gu)).toHaveLength(2);
    expect(html).toContain('<label class="file-row on"><input type="checkbox" aria-label="Tick qwen38-27b" checked=""/>');
    expect(html).toContain('<input type="checkbox" aria-label="Tick qwen3.8-flash-next"/>');
    expect(html).toContain('<span class="meta">default · also flash-next · 262,144 context · 65,536 out · 4 at once · reasoning · tools · vision</span>');
    expect(html).toContain('<span class="meta">also qwen38-27b-fast · 262,144 context · 65,536 out · 8 at once · reasoning · tools</span>');
    expect(html).toContain('<span class="tag ok">loaded</span>');
    expect(html).toContain('<span class="tag">cold</span>');
  });

  it("shows a model held here already as held, not tickable", () => {
    const again: Offer = { ...offer, models: offer.models.map((m) => (m.id === "qwen38-27b" ? { ...m, held_by: server.id } : m)) };
    const html = renderToStaticMarkup(<ServerOffer offer={again} ticked={[]} results={null} />);
    expect(html).toContain(`<input type="checkbox" aria-label="Tick qwen38-27b" disabled="" checked=""/>`);
    expect(html).toContain(`<span class="tag">on ${server.id}</span>`);
  });

  it("shows each ticked model's result as Kvasir reported it", () => {
    const html = renderToStaticMarkup(<ServerOffer offer={offer} ticked={[]} results={[...done.results, { id: "qwen3.8-flash-next", answered: false, admitted: null, record: null, error: { kind: "unreachable", message: "fetch failed" } }]} />);
    expect(html).toContain(`<span class="tag ok" title="admission record ${done.results[0].record}">admitted</span>`);
    expect(html).toContain('<span class="tag blocked" title="fetch failed">nothing answered</span>');
    // an admitted model is not ticked again; one that did not answer may be
    expect(html).toContain('aria-label="Tick qwen38-27b" disabled=""');
    expect(html).toContain('<input type="checkbox" aria-label="Tick qwen3.8-flash-next"/>');
  });
});

describe("a model server Kvasir holds", () => {
  it("is one card listing its models, each loaded or cold with its admission and stations, and each removable", () => {
    const c = card(admin);
    expect(c.facts).toBe("http://127.0.0.1:18741/v1 · 8 streams");
    const html = renderToStaticMarkup(<ModelServerCard card={c} work />);
    expect(html.match(/class="mcard wide"/gu)).toHaveLength(1);
    expect(html).toContain(`<span class="card-name path" title="${server.id}">${server.id}</span>`);
    expect(html).toContain('<span class="meta" title="http://127.0.0.1:18741/v1 · 8 streams">Model server</span>');
    expect(html).toContain('<span class="path" title="also qwen38-27b-fast">qwen38-27b</span> <span class="tag ok">loaded</span>');
    expect(html).toContain('<span class="path" title="also flash-next">qwen3.8-flash-next</span> <span class="tag">cold</span>');
    expect(html.match(/<span class="dot ok"><\/span>admitted/gu)).toHaveLength(2);
    expect(html).toContain('<span class="meta" title="ask-help">answers 1 station</span>');
    expect(html).toContain('<span class="meta" title="title">answers 1 station</span>');
    expect(html).toContain('aria-label="Remove qwen38-27b"');
    expect(html).toContain('aria-label="Remove qwen3.8-flash-next"');
    expect(html).toContain(">More models</button>");
    expect(html).toContain(">Replace key</button>");
    expect(html).toContain(">Remove server</button>");
  });

  it("shows anyone else its models and states, with nothing to act on and no address", () => {
    const html = renderToStaticMarkup(<ModelServerCard card={card(person)} work={false} />);
    expect(html).toContain("qwen3.8-flash-next");
    expect(html).not.toContain("127.0.0.1");
    expect(html).not.toContain("<button");
  });

  it("sends a station's line to the model the table names", () => {
    const [title, askHelp] = routes(purposes, [server], { viewer: admin, admissions: null, subscription: null });
    expect(title.to).toMatchObject({ title: "qwen3.8-flash-next", meta: `model server · ${server.id}` });
    expect(askHelp.to.title).toBe("qwen38-27b");
    expect(title.movable).toBe(true);
  });

  it("lets a station's drawer pick one of the server's models", () => {
    const html = renderToStaticMarkup(<MoveDrawer purpose={purposes[0]} backends={[server]} system={false} now={null} onClose={() => undefined} onDone={() => undefined} />);
    expect(html.match(/type="radio"/gu)).toHaveLength(1);
    expect(html).toContain(`<span>qwen38-27b</span><span class="meta">${server.id} · stays in your systems</span>`);
    expect(html).not.toContain("<span>qwen3.8-flash-next</span>");
  });
});
