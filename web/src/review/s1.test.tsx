// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// System 1 in the review rule (Wave 7a, record 55 D3, D6, D7; spec 11): both
// suggestions and both reasons beside a question, System 1 marked until a
// certificate confirms it; a blind-first question answered before any
// suggestion shows, the answer posted as provisional and the suggestions
// read only after; the rounds with what each accepted and sent to a person,
// the never-asked check and the audits with their bound; audit campaigns as
// a family of their own that never trains; the purpose a campaign is made
// with; the blind-first share; a dataset's damaged-header flag.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import listed from "../../test/fixtures/campaigns/list.json";
import { capsFor, DOORS } from "../campaigns/caps.fixture";
import { emptyDraft, makeBody, type Campaign } from "../campaigns/client";
import type { ReviewItem } from "../ops/client";
import { BothSides } from "./BothSides";
import { DecideDialog } from "./Decide";
import { RoundsBody } from "./RoundsPage";
import { HeadersView, shareOf } from "./S1Settings";
import { gradeWords, neverAskedHolds, owesBlind, pct, provisionalValue } from "./s1";
import { ROUND, SUGGESTIONS } from "./s1.fixture";
import { jobOf, workList } from "./work";
import { reviewPages } from "../home/placeholders";

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({ id: 41, kind: "base:missing", scope: "stack", status: "open", ref: { stack_id: 1207 }, evidence: {}, created_at: "", ...over });

describe("both suggestions and both reasons", () => {
  it("the rules' answer and rule beside System 1's value, probability, reliability, fields and similar scans", () => {
    const html = renderToStaticMarkup(<BothSides doc={SUGGESTIONS} />);
    expect(html).toContain("no rule answered");
    expect(html).toContain("FLAIR");
    expect(html).toContain("p 0.93");
    expect(html).toContain("rules reliable 0.41");
    expect(html).toContain("series description +0.52");
    expect(html).toContain("for display, not votes");
    expect(html).toContain("AX FLAIR fs");
    // the rule that decided technique, the field it read and the words it matched
    expect(html).toContain("technique/tse, clause 0");
    expect(html).toContain("sequence name *tse2d1");
    expect(html).toContain("matched “tse”");
    // until a certificate confirms it, System 1 says so
    expect(html).toContain("System 1, not confirmed");
    expect(html).toContain("no recorded certificate");
    expect(html).toContain('class="both-row differ"');
    expect(html).toContain('class="both-row agree"');
  });

  it("with no model, one line and no column of values", () => {
    const doc = { ...SUGGESTIONS, system1: { status: "no_model" as const, why: "no System 1 model is chosen for its task", model: null, certificate_id: null } };
    const html = renderToStaticMarkup(<BothSides doc={doc} axis="base" />);
    expect(html).toContain("System 1: no model");
    expect(html).not.toContain("p 0.93");
  });
});

describe("a blind-first question", () => {
  let root: Root;
  let host: HTMLElement;
  const calls: { method: string; url: string; body: unknown }[] = [];
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    calls.length = 0;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
      const reply = (doc: unknown) => new Response(JSON.stringify(doc), { status: 200 });
      if (url.endsWith("/provisional")) return reply({ item: 41, mode: "blind_first", answer: { value: "FLAIR" }, seconds: 12 });
      if (url.endsWith("/suggestions")) return reply({ ...SUGGESTIONS, mode: "blind_first", provisional: { answer: { value: "FLAIR" }, seconds: 12 } });
      if (url.endsWith("/apply")) return reply({ decision: 9, answer: { mode: "blind_first", blind: true, seconds: 30 } });
      return new Response("{}", { status: 404 });
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

  it("is answered from the scan first, posted as provisional, then the suggestions show and the person decides", async () => {
    const said: string[] = [];
    const blind = item({ mode: "blind_first", evidence: { blind_first: true, axes: ["base"] } });
    expect(owesBlind(blind)).toBe(true);
    await act(async () => root.render(<DecideDialog item={blind} pack={null} guess="T2w" onClose={() => undefined} onDone={(w) => said.push(w)} />));
    // nothing of NILS's shows, and the model's guess is not filled in
    expect(host.textContent).toContain("NILS's answers show after yours");
    expect(host.textContent).not.toContain("System 1");
    const input = host.querySelector<HTMLInputElement>('input[aria-label="The value of base"]')!;
    expect(input.value).toBe("");
    expect(calls.some((c) => c.url.includes("/suggestions"))).toBe(false);
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "FLAIR");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "Answer, then see the suggestions")!;
    await act(async () => button.click());
    await flush();
    expect(calls.find((c) => c.url.endsWith("/provisional"))?.body).toEqual({ value: "FLAIR" });
    // the suggestions are read only after the provisional answer
    const order = calls.map((c) => c.url.split("/").pop());
    expect(order.indexOf("suggestions")).toBeGreaterThan(order.indexOf("provisional"));
    expect(host.textContent).toContain("System 1, not confirmed");
    const decide = [...host.querySelectorAll("button")].find((b) => b.textContent === "Decide")!;
    await act(async () => decide.click());
    await flush();
    expect(calls.find((c) => c.url.endsWith("/apply"))?.body).toMatchObject({ value: "FLAIR" });
    expect(said[0]).toMatch(/^Given blind\. Decided base is FLAIR/u);
  });

  it("a routine question shows both sides at once", async () => {
    await act(async () => root.render(<DecideDialog item={item({ mode: "routine" })} pack={null} onClose={() => undefined} onDone={() => undefined} />));
    await flush();
    expect(calls[0].url).toBe("/api/review/41/suggestions");
    expect(host.textContent).toContain("rules reliable 0.41");
    expect(provisionalValue({ answer: { nothing: true } })).toEqual({ value: "", nothing: true });
  });
});

describe("the rounds", () => {
  const caps = capsFor({ doors: [...DOORS, "GET /api/review", "GET /api/review/rounds", "POST /api/audit/draws", "POST /api/audit/draws/{id}/grade"], grants: ["review:see", "review:work", "campaigns:see", "campaigns:work"] });

  it("each round's shares, by kind, the never-asked check, System 1's coverage, the blind answers and its audits", () => {
    const html = renderToStaticMarkup(
      <RoundsBody caps={caps} load={{ kind: "ready", value: { current: { pack: "mri", pack_version: "1.2.0", model: { id: 7, name: "s1c", version: "2026-10-09" }, confirmed: false }, rounds: [ROUND] } }} onDraw={() => undefined} onGrade={() => undefined} />,
    );
    expect(html).toContain("99 %");
    expect(html).toContain("0.7 %");
    expect(html).toContain("base:missing 7");
    expect(html).toContain("Nothing sent for a rule conflict, a low confidence, body part or post-contrast.");
    expect(html).toContain("not confirmed");
    expect(html).toContain("audit · never trains");
    expect(html).toContain("0 wrong of 10 read");
    expect(html).toContain("bound 26 %");
    expect(html).toContain("Draw the audit");
    expect(html).toContain("Grade");
    expect(neverAskedHolds(ROUND)).toBe(true);
    expect(neverAskedHolds({ ...ROUND, never_asked: { ...ROUND.never_asked, body_part: 2 } })).toBe(false);
    expect(gradeWords(null)).toBe("not graded");
    expect(pct(0.0123)).toBe("1.2 %");
  });

  it("a reader without review work sees no act, and the side lists Rounds where the engine serves it", () => {
    const reader = capsFor({ doors: [...DOORS, "GET /api/review", "GET /api/review/rounds"], grants: ["review:see"] });
    const html = renderToStaticMarkup(<RoundsBody caps={reader} load={{ kind: "ready", value: { current: { pack: null, pack_version: null, model: null, confirmed: false }, rounds: [ROUND] } }} onDraw={() => undefined} onGrade={() => undefined} />);
    expect(html).not.toContain("Draw the audit");
    expect(html).not.toContain(">Grade<");
    expect(reviewPages(reader).map((p) => p.title)).toContain("Rounds");
    const older = capsFor({ doors: [...DOORS, "GET /api/review"], grants: ["review:see"] });
    expect(reviewPages(older).map((p) => p.title)).not.toContain("Rounds");
  });
});

describe("audit campaigns and a campaign's purpose", () => {
  const list = (listed as { campaigns: Campaign[] }).campaigns;
  const caps = capsFor({ doors: [...DOORS, "GET /api/review", "GET /api/review/summary"] });
  it("an audit is a family of its own, said never to train, and absent while none is open", () => {
    const audit = { ...list[0], id: 99, name: "audit-round-3-draw-2", purpose: "audit", status: "open" } as Campaign;
    expect(jobOf(audit)).toBe("audit");
    const groups = workList(caps, null, [...list, audit]);
    const g = groups.find((x) => x.job === "audit")!;
    expect(g.title).toBe("Audit");
    expect(g.line).toContain("Never trains");
    expect(g.rows.map((r) => r.title)).toEqual(["audit-round-3-draw-2"]);
    expect(g.rows[0].what).toContain("audit, never trains");
    expect(workList(caps, null, list).some((x) => x.job === "audit")).toBe(false);
  });

  it("the purpose rides on the make door; an audit suggests nothing and closes into nothing", () => {
    const d = { ...emptyDraft(), name: "audit-a", from: "s@1", kind: "axes", axes: ["base"], suggest: "rules" as const, closesInto: "decision" };
    const audit = makeBody({ ...d, purpose: "audit" });
    expect(audit.ok && audit.body).toMatchObject({ purpose: "audit", suggest: "none", closes_into: "none" });
    const train = makeBody({ ...d, purpose: "train" });
    expect(train.ok && train.body).toMatchObject({ purpose: "train", suggest: "rules" });
    const plain = makeBody(d);
    expect(plain.ok && "purpose" in plain.body).toBe(false);
  });
});

describe("the site's share and a dataset's headers", () => {
  it("a share is typed as a percent", () => {
    expect(shareOf("20")).toBe(0.2);
    expect(shareOf("12.5%")).toBe(0.125);
    expect(shareOf("120")).toBeNull();
  });

  it("the flag says who set it, and asks why before it changes", () => {
    const flag = { dataset: "study-anon", damaged: true, by: "signs" as const, flag: null, signs: { scans: 40, no_names: 31, share: 0.775, damaged: true }, gate: "the full gate" };
    const html = renderToStaticMarkup(<HeadersView flag={flag} may asking={false} why="" said={null} onAsk={() => undefined} onWhy={() => undefined} onSet={() => undefined} />);
    expect(html).toContain("Headers damaged: sorting less reliable");
    expect(html).toContain("by its signs, 78 % of scans unnamed");
    expect(html).toContain("Mark as usual");
    const asking = renderToStaticMarkup(<HeadersView flag={{ ...flag, damaged: false }} may asking why="" said={null} onAsk={() => undefined} onWhy={() => undefined} onSet={() => undefined} />);
    expect(asking).toContain('placeholder="why, in a few words"');
    expect(asking).toMatch(/<button[^>]*disabled[^>]*>Flag<\/button>/u);
    const person = renderToStaticMarkup(<HeadersView flag={{ ...flag, by: "person", flag: { damaged: true, why: "anonymised export", by: "astrid", at: "" } }} may={false} asking={false} why="" said={null} onAsk={() => undefined} onWhy={() => undefined} onSet={() => undefined} />);
    expect(person).toContain("flagged by astrid");
    expect(person).not.toContain("<button");
  });
});
