// SPDX-License-Identifier: AGPL-3.0-only
// The gallery's layout check (record 50 R3): the desk's shell with the
// gallery of a body-part campaign in it, against a fake engine that serves a
// page of two hundred items (a hundred shown, a hundred ahead) and takes the
// accept. The pictures are answered by the check itself (gallery.pw.ts), so
// they load as the engine's would. What the accept was sent is kept on the
// window for the check to read.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/shell.css";
import "../../src/campaigns/campaigns.css";
import type { Capabilities } from "../../src/capabilities";
import { Gallery } from "../../src/campaigns/Gallery";

const VALUES = ["neck", "spine", "brain", "brain-neck", "chest", "other"];
const AUTHORS = ["v0-model", "v0-person", "bodypart@2"];

function items(n: number) {
  return Array.from({ length: n }, (_, k) => {
    const suggested = k % 17 === 5 ? null : VALUES[k % 7 === 0 ? 3 : k % 5 === 0 ? 1 : 2];
    const p = 0.35 + ((k * 37) % 65) / 100;
    return {
      item: 1000 + k,
      stack: 500 + k,
      position: k,
      suggested,
      by: suggested ? AUTHORS[k % 3] : null,
      confidence: suggested ? p : null,
      confidences: suggested ? { [suggested]: p, other: 1 - p } : null,
      others: k % 23 === 0 ? [{ by: "v0-person", value: "neck", confidence: null }] : [],
      disagree: k % 23 === 0,
      thumb: `/api/instances/${500 + k}/thumb`,
    };
  });
}

const w = window as unknown as { posted: unknown[] };
w.posted = [];
const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url, location.origin).pathname;
  if (path === "/api/campaigns/7") return json({ id: 7, name: "body parts, round 1", owner: "cleo@site", status: "open", question: { kind: "axis", axis: "body_part", values: VALUES }, grain: "stack", raters_per_item: 1, counts: { items: { open: 812 }, answers: 0 } });
  if (path === "/api/campaigns/7/gallery") {
    const all = items(200);
    const order = new URL(url, location.origin).searchParams.get("order") ?? "uncertain";
    return json({ campaign: 7, axis: "body_part", values: VALUES, order, open: 812, sealed: 40, held_back: 81, hold_back: 0.1, left: 691, count: all.length, items: all });
  }
  if (path === "/api/campaigns/7/gallery/accept") {
    const body = JSON.parse(String(init?.body)) as { answers: unknown[] };
    w.posted.push(body);
    return json({ accepted: body.answers.map((a, n) => ({ item: (a as { item: number }).item, answer: n + 1, state: "agreed", changed: false })), refused: [], held_back: 3 });
  }
  return json({});
}) as typeof fetch;

const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.45" },
    contracts: { openapi: "7" },
    doors: ["GET /api/campaigns/{id}/gallery", "POST /api/campaigns/{id}/gallery/accept"],
    policy: [],
    auth: "token",
    principal: "rater@site",
    roles: [],
    registry: { epoch: 4 },
    packs: [{ name: "mri", version: "0.7.0" }],
  },
  kvasir: null,
  assistant: null,
  apps: [],
  person: { subject: "rater@site", display_name: "rater", grants: ["campaigns:see", "campaigns:work"], detail: "quasi", groups: [] },
  desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
} as unknown as Capabilities;

const SECTIONS = ["Home", "Data", "Review", "Campaigns", "Pipelines", "Models", "Results", "Ask"];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="desk">
      <header className="top">
        <a className="brandmark" href="#home">
          NILS
        </a>
        <span className="grow" />
        <span className="person">rater</span>
      </header>
      <div className="body with-side">
        <nav className="side" id="side">
          {SECTIONS.map((s) => (
            <a key={s} className={s === "Campaigns" ? "side-link on" : "side-link"} href={`#${s.toLowerCase()}`}>
              {s}
            </a>
          ))}
        </nav>
        <main className="page">
          <Gallery caps={caps} id="7" />
        </main>
      </div>
    </div>
  </StrictMode>,
);
