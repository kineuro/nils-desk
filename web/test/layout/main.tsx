// SPDX-License-Identifier: AGPL-3.0-only
// The layout check's page (record 48, one screen): the desk's shell as the
// app draws it (the top bar, the sections on the side, the page) with the
// rating workspace in it, against a fake engine serving a Phase 0 blind item.
// The viewer is a stand-in with the real viewer's boxes, so the planes are
// laid out as they are in the desk without a stack to load.
// `?mode=` takes `plain` (an engine before record 48's new doors) or `seen`
// (the item read in the open, with the suggestion and the evidence).

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/shell.css";
import "../../src/campaigns/campaigns.css";
import type { Capabilities } from "../../src/capabilities";
import { Workspace } from "../../src/campaigns/Workspace";
import { CAMPAIGN_ID, doorsOf, fakeEngine } from "./reader.fixture";

const mode = new URLSearchParams(location.search).get("mode");
const plain = mode === "plain";
window.fetch = fakeEngine({ derive: !plain, header: !plain, texts: !plain, seen: mode === "seen" });

const caps = {
  engine: {
    engine: { name: "nils", version: "1.0.0-alpha.43" },
    contracts: { openapi: "7" },
    doors: doorsOf({ derive: !plain, header: !plain }),
    policy: [],
    auth: "token",
    principal: "rater@site",
    roles: [],
    registry: { epoch: 4 },
    packs: [{ name: "mri", version: "0.9.0" }],
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
          <Workspace caps={caps} id={String(CAMPAIGN_ID)} role="rater" />
        </main>
      </div>
    </div>
  </StrictMode>,
);
