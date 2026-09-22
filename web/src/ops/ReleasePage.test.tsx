// SPDX-License-Identifier: AGPL-3.0-only
// The Release page as it draws: the releases as a table with how each left
// and whether it was handed over or withdrawn; New release only for work on
// the Release page where the engine has the door; which kept cards a release
// may be of.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import releasesFixture from "../../test/fixtures/releases.json";
import type { DeskRecord, HandleRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import type { Release } from "../data/cohorts";
import { GRANTS, type Grant } from "../grants";
import { NewReleaseDialog, releasableCards, ReleasesBody, releasingRefusal } from "./ReleasePage";

const rows = (releasesFixture as { releases: Release[] }).releases;
const NOW = Date.parse("2026-09-15T12:00:00Z");
const none = () => undefined;

const caps = (grants: Grant[] = [...GRANTS], doors: string[] = ["POST /api/releases", "GET /api/releases"]) =>
  ({
    engine: { engine: { name: "nils", version: "1" }, contracts: {}, doors, policy: [], auth: "off", principal: "astrid", roles: [], registry: { epoch: 4 }, packs: [] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "astrid", display_name: "Astrid Berg", grants, detail: "sensitive", groups: [] },
    desk: { version: "1.0.0", mode: "off", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  }) as unknown as Capabilities;

const draw = (c: Capabilities, list: Release[] | null = rows, why: string | null = null) => renderToStaticMarkup(<ReleasesBody caps={c} list={list} why={why} now={NOW} onNew={none} />);

const handle = (over: Partial<HandleRow> = {}): HandleRow => ({
  id: 75, name: "north T1w and FLAIR", grain: "stack", row_count: 250, content_hash: "x", principal: "astrid", actor: {}, created_at: "", epoch: 4, pack_version: "0.1.1",
  disclosure: "local", truncated: false, limit: null, kept: true, last_read_at: null, withdrawn_at: null, ask_hash: "h", columns: ["_key"], ...over,
});
const record: DeskRecord = { results: [{ handle: 75, document: 41, subject: "astrid", made_at: "" }], lineage: [], export: null };

describe("the Release page", () => {
  const html = draw(caps());

  it("lists every release with its layout, how it left, its counts, who made it and whether it was handed over or withdrawn", () => {
    expect(html).toContain("<h1>Releases</h1>");
    expect(html).toContain("<th>Name</th><th>Version</th><th>Layout</th><th>Dates</th><th>UIDs</th>");
    expect(html).toContain('<b class="path">north-2026.08.21.1</b>');
    // rows from before every release kept the date still read as they were released, and do not break the table
    expect(html).toContain("<td>bids</td><td>shifted</td><td>remapped</td>");
    expect(html).toContain('<td class="num">174</td><td class="num">190<span class="meta">numbered in date order</span></td>');
    expect(html).toContain("<td>astrid</td><td>22 Aug</td><td></td>");
    expect(html).toContain('<tr class="withdrawn">');
    expect(html).toContain("<td>descriptive</td><td>cut to the year</td><td>remapped</td>");
    expect(html).toContain("<td>not yet</td><td>12 Sept · astrid · wrong scheme</td>");
    expect(html).toContain(">New release</button>");
  });

  it("offers no new release to a person who may only look, or where the engine has no door", () => {
    const look = draw(caps(["release:see"]));
    expect(look).toContain('<b class="path">north-2026.08.21.1</b>');
    expect(look).not.toContain(">New release</button>");
    expect(look).toContain("Releasing needs work on the Release page.");
    expect(releasingRefusal(caps([...GRANTS], ["GET /api/releases"]))).toBe("This engine has no release door.");
  });

  it("says it reads, why it could not, and that there is none yet", () => {
    expect(draw(caps(), null)).toContain("reading the releases");
    expect(draw(caps(), null, "refused")).toContain('<p class="warn">The releases could not be read: refused</p>');
    expect(draw(caps(), [])).toContain("No release yet.");
    expect(renderToStaticMarkup(<ReleasesBody caps={caps()} list={[]} why={null} lists={false} now={NOW} onNew={none} />)).toContain("does not list its releases");
  });

  it("says beside the sessions how each release named them, where its row or its policies say", () => {
    const rows = (releasesFixture as { releases: Release[] }).releases;
    // the pilot release cut its dates to the year, so its sessions could not be labelled by the date
    expect(html).toContain('<td class="num">88<span class="meta">numbered in date order</span></td>');
    // a release under a scheme of its own says what that scheme named them
    const months = draw(caps(), [{ ...rows[1], session_scheme: { naming: "months" } }]);
    expect(months).toContain('<span class="meta">labelled by months</span>');
    // and one whose dates never moved says nothing of the naming at all
    const kept = draw(caps(), [{ ...rows[1], policies: [{ dataset: "north-3t", dates: "keep", uids: "remap" }] }]);
    expect(kept).toContain('<td class="num">190</td>');
    expect(kept).not.toContain("numbered in date order");
  });

  it("sends no leaving policy of its own: each dataset's own applies until a person overrides it in the dialog", () => {
    const dialog = renderToStaticMarkup(<NewReleaseDialog caps={caps()} cohort="north" existing={rows} onClose={none} onDone={none} />);
    expect(dialog).toContain("Each dataset&#x27;s own leaving policy applies to its own files.");
    expect(dialog).toContain("Nothing is sent for the UIDs unless you override them here.");
    expect(dialog).toContain('aria-label="UIDs for every file"');
    expect(dialog).toContain("UIDs: each dataset&#x27;s own");
    // nothing is overridden as it opens, so the caution that an override brings is not there yet
    expect(dialog).not.toContain("An override sets the UID policy");
  });

  it("offers no date choice: the release keeps the real date, and months since baseline where a date must not show in a path", () => {
    const dialog = renderToStaticMarkup(<NewReleaseDialog caps={caps()} cohort="north" existing={rows} onClose={none} onDone={none} />);
    expect(dialog).not.toContain('aria-label="Dates for every file"');
    expect(dialog).not.toContain("shifted");
    expect(dialog).not.toContain("to the year");
    expect(dialog).toContain("Every release keeps the real date. Where a date must not show in a path, label the sessions by months since baseline (M00, M06) with a session scheme.");
  });

  it("offers as a card's answer only a complete stack answer the person may release", () => {
    const grants = ["release:work"];
    expect(releasableCards([handle()], record, 4, grants).map((c) => c.name)).toEqual(["north T1w and FLAIR"]);
    expect(releasableCards([handle({ grain: "session" })], record, 4, grants)).toEqual([]);
    expect(releasableCards([handle({ truncated: true })], record, 4, grants)).toEqual([]);
    expect(releasableCards([handle()], record, 5, grants)).toEqual([]);
    expect(releasableCards([handle({ name: null })], record, 4, grants)[0].name).toBe("handle 75");
    expect(releasableCards([handle()], record, 4, ["release:see"])).toEqual([]);
  });
});
