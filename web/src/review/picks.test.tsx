// SPDX-License-Identifier: AGPL-3.0-only
// Picks in Review (record 45 S5): a `pick.border` item as a pick run writes
// it (the shape copied from a synthetic engine's answer), read as its
// occasion with the run's pick marked first; the board with a main toggle
// and a required why; the pick question as the rating workspace draws it;
// and the acts each grant and door leaves open.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../ops/client";
import { capsWith } from "./caps.fixture";
import { BORDER } from "./picks.fixture";
import { familyOf, itemWords, kindTag } from "./client";
import { PickDialog, pickActs } from "./PickDialog";
import { BordersTable, PicksFamily, RoleChips } from "./Families";
import { answeredIndex, answeredWords, borderOf, borderWords, keepWords, occasionWords, pickBody, rolesOffered } from "./picks";
import { packDoc, packRoles } from "./client";
import { PickQuestion, SessionBoard } from "./SessionBoard";

const ANSWERED: ReviewItem = { ...BORDER, status: "accepted", decision: { pick_id: 97, stacks: [409], author_kind: "person", actor: "astrid", why: "sharper, no motion" } };

const WORK = ["review:see", "review:work"] as const;
const DOORS = ["GET /api/review", "POST /api/picks", "POST /api/picks/{id}/withdraw", "POST /api/review/{id}/accept"];

describe("a pick.border item", () => {
  it("reads as its occasion, the run's pick first and marked, and belongs to the picks family", () => {
    const b = borderOf(BORDER)!;
    expect(occasionWords(b)).toBe("t1w of subject 21 on 2010-11-27");
    expect(borderWords(b)).toBe("the two best too close");
    expect(b.candidates.map((c) => [c.stacks, c.chosen])).toEqual([
      [[406], true],
      [[409], false],
      [[405], false],
    ]);
    expect(b.runPick).toBe(81);
    expect(familyOf(BORDER.kind)).toBe("picks");
    expect(kindTag(BORDER.kind).words).toBe("pick");
    expect(itemWords(BORDER)).toBe("t1w of subject 21 on 2010-11-27: the pick run doubts it");
    // nothing eligible: the run picked nothing, so no candidate is its pick
    const none = borderOf({ ...BORDER, evidence: { ...(BORDER.evidence as object), borders: ["nothing_eligible"] } })!;
    expect(none.candidates.some((c) => c.chosen)).toBe(false);
  });
  it("names a person's pick that answered it, and which candidate that was", () => {
    const b = borderOf(ANSWERED)!;
    expect(b.answered).toEqual({ pick: 97, stacks: [409], why: "sharper, no motion" });
    expect(answeredIndex(b)).toBe(1);
  });
  it("writes a pick as the door takes it: the role, the stacks, the why and the pick that declares the role", () => {
    expect(pickBody(borderOf(BORDER)!, [409], "  sharper  ")).toEqual({ role: "t1w", stacks: [409], why: "sharper", pick: "main" });
  });
});

describe("the session board", () => {
  it("draws each candidate with its score, the run's pick marked, a main toggle and a why", () => {
    const b = borderOf(BORDER)!;
    const html = renderToStaticMarkup(<SessionBoard candidates={b.candidates} main={1} onMain={() => undefined} why="" onWhy={() => undefined} pictures={false} />);
    expect(html.match(/type="radio"/gu)).toHaveLength(3);
    expect(html).toContain("the run&#x27;s pick");
    expect(html).toContain('class="bundle on"');
    expect(html).toContain("score 0.66");
    expect(html).toContain("stack 409");
    expect(html).toMatch(/<input required=""[^>]*aria-label="Why"/u);
  });
  it("draws read only with the main marked when no one may choose", () => {
    const b = borderOf(ANSWERED)!;
    const html = renderToStaticMarkup(<SessionBoard candidates={b.candidates} main={1} onMain={null} why="" onWhy={null} pictures={false} />);
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('aria-label="Why"');
    expect(html).toContain('<span class="tag brand">main</span>');
  });
  it("renders the pick question with the chosen acquisition marked main and the why left to the workspace", () => {
    const html = renderToStaticMarkup(<PickQuestion role="t1w" candidates={borderOf(BORDER)!.candidates} stacks={[409]} onStacks={() => undefined} pictures={false} />);
    expect(html).toContain("Which acquisition stands for t1w on this occasion?");
    expect(html).toContain('class="bundle on"');
    expect(html).not.toContain('aria-label="Why"');
    expect(html).not.toContain(">Answer</button>");
  });
});

describe("the acts on a border", () => {
  it("offer Pick and Keep on an open item to a person with review work, and Withdraw once a person picked", () => {
    const caps = capsWith(DOORS, [...WORK]);
    expect(pickActs(caps, borderOf(BORDER)!)).toEqual({ pick: true, keep: true, withdraw: false });
    expect(pickActs(caps, borderOf(ANSWERED)!)).toEqual({ pick: false, keep: false, withdraw: true });
  });
  it("offer nothing to a person who may only see, nor where the engine has no picks door", () => {
    expect(pickActs(capsWith(DOORS, ["review:see"]), borderOf(BORDER)!)).toEqual({ pick: false, keep: false, withdraw: false });
    expect(pickActs(capsWith(["GET /api/review", "POST /api/review/{id}/accept"], [...WORK]), borderOf(BORDER)!)).toEqual({ pick: false, keep: true, withdraw: false });
  });
  it("draw the dialog with the doubt, the board and only the buttons the acts allow", () => {
    const html = renderToStaticMarkup(<PickDialog caps={capsWith(DOORS, [...WORK])} item={BORDER} onClose={() => undefined} onDone={() => undefined} pictures={false} />);
    expect(html).toContain("t1w of subject 21 on 2010-11-27: the two best too close · margin 0.00");
    expect(html).toContain(">Pick</button>");
    expect(html).toContain("Keep the run&#x27;s pick");
    expect(html).not.toContain("Withdraw my pick");
    const seen = renderToStaticMarkup(<PickDialog caps={capsWith(DOORS, ["review:see"])} item={BORDER} onClose={() => undefined} onDone={() => undefined} pictures={false} />);
    expect(seen).not.toContain(">Pick</button>");
    expect(seen).not.toContain('type="radio"');
  });
});

// record 51 slice C: Keep is a decision (R1, R2), D's six reasons in words, the pack's roles
describe("keep, the nine reasons and the pack's roles", () => {
  const nothing: ReviewItem = { ...BORDER, evidence: { ...(BORDER.evidence as object), borders: ["nothing_eligible"], pick_id: null, considered: [] } };
  it("says on Keep what it writes: the run's pick as the person's, or no stack for the role", () => {
    const caps = capsWith(DOORS, [...WORK]);
    const html = renderToStaticMarkup(<PickDialog caps={caps} item={BORDER} onClose={() => undefined} onDone={() => undefined} pictures={false} />);
    expect(keepWords(borderOf(BORDER)!)).toBe("Keep the run's pick as yours");
    expect(html).toContain(">Keep the run&#x27;s pick as yours</button>");
    expect(html).toContain("Keeping the run&#x27;s pick makes it yours in the same way");
    // nothing eligible: no run's pick, and keeping says no stack stands (R2)
    const b = borderOf(nothing)!;
    expect(b.runPick).toBeNull();
    expect(pickActs(caps, b)).toEqual({ pick: false, keep: true, withdraw: false });
    expect(keepWords(b)).toBe("Keep: no stack stands for this role here");
    expect(renderToStaticMarkup(<PickDialog caps={caps} item={nothing} onClose={() => undefined} onDone={() => undefined} pictures={false} />)).toContain(">Keep: no stack stands for this role here</button>");
    // a kept border reads as a person's pick, of the run's stacks or of none
    expect(answeredWords({ pick: 98, stacks: [406], why: "kept the run's pick (too_close)" })).toBe("A person picked stacks 406: kept the run's pick (too_close).");
    expect(answeredWords({ pick: 99, stacks: [], why: null })).toBe("A person said no stack stands for this role here.");
  });
  it("names each of v0's nine reasons in words", () => {
    const all = ["too_close", "rare", "nothing_eligible", "retake", "unknown_dim", "slice_count_outlier", "pre_post_twin", "epimix_fallback", "dixon_vs_plain"];
    const words = all.map((r) => borderWords({ borders: [r] }));
    expect(words).toEqual([
      "the two best too close",
      "a winner rare here",
      "nothing eligible",
      "a retake: the winner is more than one stack",
      "the winner's dimension unknown",
      "an odd number of slices for its dimension",
      "a twin before or after contrast close behind",
      "an EPIMix stands in",
      "a plain stack close behind the Dixon",
    ]);
    for (const w of words) expect(w).not.toContain("_");
    const html = renderToStaticMarkup(<BordersTable borders={[borderOf({ ...BORDER, evidence: { ...(BORDER.evidence as object), borders: ["retake", "dixon_vs_plain"] } })!]} onOpen={() => undefined} />);
    expect(html).toContain("a retake: the winner is more than one stack, a plain stack close behind the Dixon");
  });
  it("offers the served pack's roles, not a list of the desk's own", () => {
    const pack = packDoc({ pack: "mri", version: "0.16.0", axes: [], picks: [{ name: "main", roles: ["t1w", "flair", "t2w"] }] });
    expect(packRoles(pack)).toEqual(["t1w", "flair", "t2w"]);
    expect(packRoles(packDoc({ pack: "mri", axes: [] }))).toEqual([]);
    const borders = [borderOf(BORDER)!, borderOf({ ...BORDER, id: 5, ref: { ...(BORDER.ref as object), role: "t2w" } })!, borderOf({ ...BORDER, id: 6, ref: { ...(BORDER.ref as object), role: "dwi" } })!];
    expect(rolesOffered(packRoles(pack), borders)).toEqual([
      { role: "t1w", open: 1 },
      { role: "flair", open: 0 },
      { role: "t2w", open: 1 },
      { role: "dwi", open: 1 },
    ]);
    const html = renderToStaticMarkup(<RoleChips roles={rolesOffered(packRoles(pack), borders)} role="t2w" onRole={() => undefined} />);
    expect(html).toContain('aria-pressed="true">t2w<b>1</b></button>');
    expect(html).toContain(">flair<b>0</b></button>");
    expect(renderToStaticMarkup(<PicksFamily caps={capsWith(DOORS, [...WORK])} packName="mri" onChanged={() => undefined} />)).toContain("reading the picks");
  });
});
