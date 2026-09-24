// SPDX-License-Identifier: AGPL-3.0-only
// Custody and absence (record 45 S8): every page wave 45 adds, drawn against
// an engine without the doors it reads and a person without the grants,
// links to no section the side does not offer. "Ask people about these"
// leads to the Campaigns section's maker only once that section is built
// into this desk, whatever the engine serves.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Capabilities } from "../capabilities";
import type { Grant } from "../grants";
import { GRANTS } from "../grants";
import { PLACEHOLDERS } from "../home/placeholders";
import { ModelBody, ModelsBody } from "../models/ModelsPage";
import type { Model } from "../models/client";
import { CatalogBody } from "../ops/Catalog";
import { PipelinesPage } from "../ops/PipelinesPage";
import { parse } from "../routes";
import { sections } from "../sections";
import { ASKED_ITEM, ASKED_PACK } from "./asked.fixture";
import { askedOf } from "./asked";
import { askPeopleHref, asksPeople } from "./askPeople";
import { CandidateList } from "./CandidateList";
import { capsWith } from "./caps.fixture";
import { ModelFamily } from "./ModelFamily";
import { modelGroups } from "./modelFamily";
import { PickDialog } from "./PickDialog";
import { BORDER } from "./picks.fixture";

/** The sections an html links to that the side does not offer, leaving the page's own section aside. */
function dead(html: string, caps: Capabilities, own: string): string[] {
  const offered = new Set(sections(caps).map((s) => s.id));
  const linked = [...html.matchAll(/href="(#[^"]*)"/gu)].map((m) => parse(m[1].replace(/&amp;/gu, "&")).section);
  return [...new Set(linked.filter((s) => s !== own && !offered.has(s)))];
}

const MODEL: Model = { id: 4, name: "bodypart-head", version: "3", kind: "head", digest: `sha256:${"4".repeat(64)}`, task: "axis:body_part", slot: "site", state: "registered", card: {}, encoder_model_ids: [1], registered_by: "run 12", registered_at: "2026-09-24T09:00:00Z" };

describe("against an engine without the doors", () => {
  const bare = capsWith([], [...GRANTS] as Grant[]);
  it("the side offers neither Models nor anything wave 45 adds", () => {
    expect(sections(bare).map((s) => s.id)).toEqual(["home"]);
  });
  it("no page links anywhere the side does not offer", () => {
    const pages: [string, string][] = [
      ["models", renderToStaticMarkup(<ModelsBody caps={bare} list={[MODEL]} onChanged={() => undefined} />)],
      ["models", renderToStaticMarkup(<ModelBody caps={bare} m={MODEL} list={[MODEL]} onChanged={() => undefined} />)],
      ["pipelines", renderToStaticMarkup(<PipelinesPage caps={bare} page="catalog" />)],
      ["pipelines", renderToStaticMarkup(<CatalogBody caps={bare} pipelines={[]} capability={null} runs={[{ id: 1, pipeline_id: 1, pipeline: "x@1", job_id: null, status: "done", started_at: null, finished_at: null, summary: { proposals: { ingested: { members: 3, staged_members: 3 } } } }]} onRun={() => undefined} />)],
      ["review", renderToStaticMarkup(<ModelFamily caps={bare} groups={modelGroups([])} askHref={asksPeople(bare) ? (k) => askPeopleHref({ kind: k }) : null} onChanged={() => undefined} />)],
      ["review", renderToStaticMarkup(<PickDialog caps={bare} item={BORDER} onClose={() => undefined} onDone={() => undefined} pictures={false} />)],
      ["review", renderToStaticMarkup(<CandidateList asked={askedOf(ASKED_ITEM, ASKED_PACK)!} onChoose={null} onNone={null} />)],
    ];
    for (const [own, html] of pages) expect(dead(html, bare, own)).toEqual([]);
  });
  it("no act is offered where its door is missing", () => {
    const html = renderToStaticMarkup(<ModelBody caps={bare} m={MODEL} list={[MODEL]} onChanged={() => undefined} />);
    expect(html).not.toContain(">Admit</button>");
    expect(html).not.toContain(">Promote</button>");
    const pick = renderToStaticMarkup(<PickDialog caps={bare} item={BORDER} onClose={() => undefined} onDone={() => undefined} pictures={false} />);
    expect(pick).not.toContain(">Pick</button>");
  });
});

describe("ask people about these", () => {
  const all = capsWith(["POST /api/campaigns", "GET /api/campaigns"], [...GRANTS] as Grant[]);
  it("leads nowhere until the Campaigns section is built into this desk", () => {
    const built = PLACEHOLDERS.some((p) => p.id === "campaigns" && p.built === true);
    expect(asksPeople(all)).toBe(built);
    expect(asksPeople(capsWith([], [...GRANTS] as Grant[]))).toBe(false);
    expect(asksPeople(capsWith(["POST /api/campaigns"], ["review:work"]))).toBe(false);
  });
  it("carries the Review filter to the maker in the agreed shape", () => {
    expect(askPeopleHref({ kind: "body_part:model" })).toBe("#campaigns/new?from=review&kind=body_part%3Amodel");
    expect(askPeopleHref({ kind_prefix: "base:", job: 12, limit: 200, cohort: "north" })).toBe("#campaigns/new?from=review&kind_prefix=base%3A&job=12&limit=200&cohort=north");
    const r = parse(askPeopleHref({ kind: "pick.border", cohort: "north" }));
    expect([r.section, r.page, r.query]).toEqual(["campaigns", "new", { from: "review", kind: "pick.border", cohort: "north" }]);
  });
});
