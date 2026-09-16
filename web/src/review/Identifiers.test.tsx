// SPDX-License-Identifier: AGPL-3.0-only
// The identity questions by kind: collisions, files held until mapped,
// subjects coded without a map, and whatever else the engine raised; each
// the costliest first, and decided items left out.

import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../ops/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { Capabilities } from "../capabilities";
import { GRANTS } from "../grants";
import { byKind, IdentifiersPage } from "./Identifiers";

function item(id: number, kind: string, over: Partial<ReviewItem> = {}): ReviewItem {
  return { id, kind, scope: "subject", status: "open", created_at: `2026-09-0${(id % 9) + 1}T10:00:00Z`, ...over };
}

describe("the identity questions by kind", () => {
  it("group the three kinds, and the rest apart, open ones only", () => {
    const groups = byKind([
      item(1, "identity.unmapped", { scope: "batch", evidence: { files: 18, shape: "AAA999", place: "alpha" } }),
      item(2, "identity.collision", { evidence: { sessions: 6 } }),
      item(3, "identity.collision", { status: "accepted" }),
      item(4, "identity.provisional"),
      item(5, "linkage.conflict"),
      item(6, "base:vote", { scope: "stack" }),
    ]);
    expect(groups.map((g) => [g.what, g.items.map((i) => i.id)])).toEqual([
      ["collision", [2]],
      ["unmapped", [1]],
      ["provisional", [4]],
      ["other", [5]],
    ]);
  });
  it("names no other group when every question is one of the three", () => {
    expect(byKind([item(1, "identity.collision")]).map((g) => g.what)).toEqual(["collision", "unmapped", "provisional"]);
  });
});

describe("the identity questions as they draw", () => {
  it("offer Map them on held files and never Decide, Merge on a provisional subject, Merge and Decide on a collision", () => {
    const caps: Capabilities = {
      engine: { engine: { name: "nils", version: "1.0.0-alpha.29" }, contracts: { openapi: "5", suite: "2" }, doors: ["GET /api/review", "POST /api/linkage/merge"], policy: [], auth: "off", principal: "astrid", roles: ["reader", "reviewer", "operator", "admin"], registry: { epoch: 1 }, packs: [] },
      kvasir: null,
      assistant: null,
      apps: [],
      person: { subject: "astrid", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
      desk: { version: "1", mode: "off", contracts: { openapi: "5", suite: "2" }, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
    };
    const html = renderToStaticMarkup(
      <IdentifiersPage
        caps={caps}
        items={[
          item(1, "identity.unmapped", { scope: "batch", evidence: { files: 160, shape: "AA9999", place: "north" } }),
          item(2, "identity.collision", { evidence: { sessions: 6, codes: ["S-0007", "S-0412"] } }),
          item(4, "identity.provisional", { evidence: { place: "north" } }),
        ]}
        onDecide={() => undefined}
        onChanged={() => undefined}
      />,
    );
    const rows = html.split("<tr>").slice(1);
    const heldRow = rows.find((r) => r.includes("held until the map names"))!;
    expect(heldRow).toContain("Map them</a>");
    expect(heldRow).not.toContain(">Decide</button>");
    expect(heldRow).not.toContain(">Merge</button>");
    const codedRow = rows.find((r) => r.includes("coded from an identifier"))!;
    expect(codedRow).toContain(">Merge</button>");
    expect(codedRow).not.toContain(">Decide</button>");
    const twiceRow = rows.find((r) => r.includes("two codes share one identifier"))!;
    expect(twiceRow).toContain(">Merge</button>");
    expect(twiceRow).toContain(">Decide</button>");
    expect(html).toContain("Nothing is decided here");
  });
});
