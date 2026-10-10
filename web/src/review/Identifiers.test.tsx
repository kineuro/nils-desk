// SPDX-License-Identifier: AGPL-3.0-only
// The identity questions by kind: collisions, files held until mapped,
// subjects coded without a map, and whatever else the engine raised; each
// the costliest first, and decided items left out.

import { describe, expect, it, vi } from "vitest";
import type { ReviewItem } from "../ops/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { Capabilities } from "../capabilities";
import { GRANTS } from "../grants";
import { identityActs, itemWords, review } from "./client";
import { byKind, IdentifiersPage, LetGoDialog } from "./Identifiers";

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
      ["same_instance", []],
      ["other", [5]],
    ]);
  });
  it("names no other group when every question is one of the three", () => {
    expect(byKind([item(1, "identity.collision")]).map((g) => g.what)).toEqual(["collision", "unmapped", "provisional", "same_instance"]);
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

describe("the same scan filed twice (the duplicate policy, 2026-10-10)", () => {
  // a dataset's files whose scan the registry files already: under another subject, or under another series of the same one
  const twoSubjects = item(7, "identity.same_instance", {
    ref: { subject_id: 41, code: "c-0041", holder_id: 12, holder_code: "c-0012" },
    evidence: { files: 3, differs: { subject: 3 }, place: "study-identified" },
  });
  const oneSubject = item(8, "identity.same_instance", {
    ref: { subject_id: 12, code: "c-0012", holder_id: 12, holder_code: "c-0012" },
    evidence: { files: 1, differs: { series: 1 }, place: "study-identified" },
  });

  it("says which subject holds the scan, and settles two subjects by a merge and one by a let-go", () => {
    expect(itemWords(twoSubjects)).toBe("3 files of a scan filed already under subject c-0012, read as subject c-0041");
    expect(itemWords(oneSubject)).toBe("1 file of a scan filed already, read under another series of subject c-0012");
    expect(identityActs(twoSubjects)).toEqual({ decide: false, merge: true, map: false, letGo: false });
    expect(identityActs(oneSubject)).toEqual({ decide: false, merge: false, map: false, letGo: true });
  });

  it("draws the let-go's two acts on one subject's row and Merge on two subjects', where the doors are served", () => {
    const caps: Capabilities = {
      engine: { engine: { name: "nils", version: "1.0.0-alpha.79" }, contracts: { openapi: "7", suite: "3" }, doors: ["GET /api/review", "POST /api/linkage/merge", "POST /api/review/{id}/let-go"], policy: [], auth: "off", principal: "astrid", roles: ["reader", "reviewer", "operator", "admin"], registry: { epoch: 1 }, packs: [] },
      kvasir: null,
      assistant: null,
      apps: [],
      person: { subject: "astrid", display_name: "Astrid", grants: [...GRANTS], detail: "sensitive", groups: [] },
      desk: { version: "1", mode: "off", contracts: { openapi: "7", suite: "3" }, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
    };
    const html = renderToStaticMarkup(<IdentifiersPage caps={caps} items={[twoSubjects, oneSubject]} onDecide={() => undefined} onChanged={() => undefined} />);
    expect(html).toContain("the same scan filed twice");
    const rows = html.split("<tr>").slice(1);
    const two = rows.find((r) => r.includes("read as subject c-0041"))!;
    expect(two).toContain(">Merge</button>");
    expect(two).not.toContain("Keep as another copy");
    const one = rows.find((r) => r.includes("another series of subject"))!;
    expect(one).toContain(">Keep as another copy</button>");
    expect(one).toContain(">Leave out of the read</button>");
    expect(one).not.toContain(">Merge</button>");
    expect(one).not.toContain(">Decide</button>");
  });

  it("asks why before it lets go, and says what keeping does", () => {
    const html = renderToStaticMarkup(<LetGoDialog item={oneSubject} keep onClose={() => undefined} onDone={() => undefined} />);
    expect(html).toContain("Keep as another copy");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Keep them<\/button>/);
    expect(html).toContain("The next read files them.");
  });

  it("lets go through the item's own door, with the choice and the why", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ item: 8, keep: false, files: 1 }));
    });
    try {
      const done = await review.letGo(8, false, "a test series, not for analysis");
      expect(done.files).toBe(1);
      expect(calls).toEqual([{ url: "/api/review/8/let-go", body: { keep: false, why: "a test series, not for analysis" } }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
