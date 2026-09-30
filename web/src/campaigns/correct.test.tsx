// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Correcting one's own answer in the anchored and the pair reader (the
// post-contrast study): `b` opens the last answer again and then the one
// before, `m` lists one's answers by item, the answer opened shows the same
// blind view with that answer marked, and another choice and Enter send it
// through the amend door, which keeps the earlier answer. The item leased
// stays leased; `s` leaves a correction as it was. My answers opens an
// anchored or a pair answer in its own reader, listed by place and words
// alone. No stack's number, key or time is shown anywhere on the way.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANCHORED_CAMPAIGN, anchoredDoorsOf, anchoredEngine, CAND, CAND2, POST, POST2, PRE, PRE2, type Kept } from "../../test/layout/anchored.fixture";
import { LEFT, LEFT2, PAIR_CAMPAIGN, pairDoorsOf, pairEngine, RIGHT, RIGHT2 } from "../../test/layout/pair.fixture";
import { CAMPAIGN_ID, type Asked } from "../../test/layout/reader.fixture";
import type { Capabilities } from "../capabilities";
import type { ViewerProps } from "../viewer/Viewer";
import { anchoredKey } from "./anchored";
import { AnchoredReader } from "./AnchoredReader";
import type { MyAnswer } from "./client";
import { answerOf, backTarget } from "./correct";
import { amendHref, amendPageOf, amendRefusal, MyAnswers, ownWords, placeWords } from "./MyAnswers";
import { pairKey } from "./pair";
import { PairReader } from "./PairReader";

const drawn = new Set<number>();
vi.mock("../viewer/Viewer", () => ({
  Viewer: (p: ViewerProps) => {
    drawn.add(p.stack);
    return null;
  },
}));
vi.mock("../viewer/reference", async (orig) => {
  const real = await orig<typeof import("../viewer/reference")>();
  return { ...real, reference: () => Promise.reject(new Error("no sample")) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function capsWith(doors: string[]): Capabilities {
  return {
    engine: { engine: { name: "nils", version: "1.0.0-alpha.62" }, contracts: { openapi: "7" }, doors, policy: [], auth: "token", principal: "rater@site", roles: [], registry: { epoch: 4 }, packs: [{ name: "mri", version: "0.15.0" }] },
    kvasir: null,
    assistant: null,
    apps: [],
    person: { subject: "rater@site", display_name: "rater", grants: ["campaigns:see", "campaigns:work"], detail: "quasi", groups: [] },
    desk: { version: "1.0.0", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}

const mine = (answer: number, position: number, value: string, role = "rater"): MyAnswer => ({ answer, item: 100 + position, stack: null, position, value, answered_at: "2026-09-30T08:00:00Z", via: "claim", unsure: false, supersedes: null, role, round: 1, thumb: null, sealed: false });

describe("which answer `b` opens, and the words", () => {
  it("opens the latest, then each one before it, and none past the first", () => {
    const list = [mine(9, 3, "like_pre"), mine(7, 2, "like_post"), mine(5, 1, "cant_tell", "adjudicator"), mine(4, 0, "like_post")];
    expect(backTarget(list, null)?.answer).toBe(9);
    expect(backTarget(list, 9)?.answer).toBe(7);
    // an adjudicator's answer is not the reader's to walk back to
    expect(backTarget(list, 7)?.answer).toBe(4);
    expect(backTarget(list, 4)).toBeNull();
    // the one open was corrected meanwhile: from the latest again
    expect(backTarget(list, 99)?.answer).toBe(9);
    expect(backTarget([], null)).toBeNull();
  });

  it("reads an answer as one of the kind's words, and nothing else", () => {
    expect(answerOf(["like_pre", "like_post", "cant_tell"] as const, "like_post")).toBe("like_post");
    expect(answerOf(["like_pre", "like_post", "cant_tell"] as const, "given")).toBeNull();
    expect(answerOf(["left_post", "right_post"] as const, null)).toBeNull();
  });

  it("maps b and m on both pages, and nothing from a text field", () => {
    expect(anchoredKey("b", { inField: false })).toEqual({ kind: "back" });
    expect(anchoredKey("m", { inField: false })).toEqual({ kind: "mine" });
    expect(pairKey("b", { inField: false })).toEqual({ kind: "back" });
    expect(pairKey("m", { inField: false })).toEqual({ kind: "mine" });
    expect(anchoredKey("b", { inField: true })).toBeNull();
    expect(pairKey("m", { inField: true })).toBeNull();
  });

  it("corrects an anchored or a pair answer in its own reader, and never a closed campaign's", () => {
    const caps = capsWith([...anchoredDoorsOf()]);
    expect(amendRefusal(caps, ANCHORED_CAMPAIGN, null)).toBeNull();
    expect(amendRefusal(caps, PAIR_CAMPAIGN, null)).toBeNull();
    expect(amendRefusal(caps, { ...ANCHORED_CAMPAIGN, status: "closed" }, null)).toContain("closed");
    expect(amendRefusal(capsWith(anchoredDoorsOf().filter((d) => !d.includes("amend"))), ANCHORED_CAMPAIGN, null)).toContain("does not take corrections");
    expect(amendPageOf(ANCHORED_CAMPAIGN)).toBe("anchored");
    expect(amendPageOf(PAIR_CAMPAIGN)).toBe("pairs");
    expect(amendPageOf({ question: { kind: "axis", axis: "x", values: [] } } as never)).toBe("rate");
    expect(amendHref(7, 91, "rate", "anchored")).toBe("#campaigns/7/anchored?amend=91");
    expect(amendHref(7, 91, "rate", "pairs")).toBe("#campaigns/7/pairs?amend=91");
    expect(amendHref(7, 91, "gallery")).toBe("#campaigns/7/rate?amend=91&back=gallery");
    expect(ownWords(ANCHORED_CAMPAIGN, "like_pre")).toBe("like the pre");
    expect(ownWords(PAIR_CAMPAIGN, "both_post")).toBe("both post");
    expect(placeWords(ANCHORED_CAMPAIGN, 12)).toBe("item 13");
    expect(placeWords(PAIR_CAMPAIGN, 12)).toBe("pair 13");
  });
});

describe("in the reader", () => {
  let host: HTMLDivElement;
  let root: Root;
  let log: Asked[];
  let kept: Kept[];
  beforeEach(() => {
    log = [];
    kept = [];
    drawn.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    host.remove();
    vi.unstubAllGlobals();
    location.hash = "";
  });

  async function until<T>(what: () => T | null | undefined | false, ms = 3000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = what();
      if (v) return v;
      if (Date.now() > end) throw new Error("waited in vain");
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }
  }
  async function press(key: string) {
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
  }
  const text = () => host.textContent ?? "";
  const itemShown = () => host.querySelector(".rate-item > b")?.textContent;
  /** Nothing of a stack, and no time: the page names items by their place alone. */
  function blind(stacks: number[]) {
    for (const n of [...stacks.map(String), "anchored:12", "anchored:13", "pair:12", "pair:13", "2026-09-30", "ago"]) expect(text()).not.toContain(n);
  }

  it("anchored: answers two, then b opens the last and the one before, marked, and Enter corrects it through the amend door", async () => {
    vi.stubGlobal("fetch", anchoredEngine({ log, kept }));
    root = createRoot(host);
    await act(async () => root.render(<AnchoredReader caps={capsWith(anchoredDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => itemShown() === "item 13" && host.querySelector(".pair-answers"));
    await press("2");
    await press("Enter");
    await until(() => itemShown() === "item 14" && drawn.has(CAND2));
    await press("3");
    await press("Enter");
    await until(() => text().includes("Nothing left for you"));
    expect(kept.map((k) => [k.position, k.value])).toEqual([
      [12, "like_post"],
      [13, "cant_tell"],
    ]);

    // b: the last answer, item 14, marked
    await press("b");
    await until(() => itemShown() === "item 14" && host.querySelector(".pair-answer.yours"));
    expect(host.querySelector(".pair-answer.yours")?.textContent).toContain("can't tell");
    expect(host.querySelector(".pair-answer.on")?.textContent).toContain("can't tell");
    expect(host.querySelector(".correcting-tag")).not.toBeNull();
    expect(host.querySelector(".act-answer")?.textContent).toContain("Correct");
    // b again: the one before, item 13, on its own three panels
    drawn.clear();
    await press("b");
    await until(() => itemShown() === "item 13" && host.querySelector(".pair-answer.yours")?.textContent?.includes("like the post"));
    await until(() => drawn.has(CAND) && drawn.has(PRE) && drawn.has(POST));
    expect([...host.querySelectorAll(".anchored-panel")].map((p) => p.getAttribute("data-role"))).toEqual(["reference_post", "candidate", "reference_pre"]);
    blind([CAND, PRE, POST, CAND2, PRE2, POST2]);
    // another choice and Enter: the correction, sent to the answer given
    await press("1");
    expect(host.querySelector(".pair-answer.on")?.textContent).toContain("like the pre");
    expect(host.querySelector(".pair-answer.yours")?.textContent).toContain("like the post");
    await press("Enter");
    await until(() => log.some((a) => a.path.endsWith("/amend")));
    const sent = log.find((a) => a.path.endsWith("/amend"))!;
    expect(sent.path).toBe(`/api/campaigns/${CAMPAIGN_ID}/answers/${kept[0].answer}/amend`);
    expect(sent.body).toEqual({ value: "like_pre" });
    await until(() => host.querySelector(".said")?.textContent?.includes("Corrected item 13: like the post is now like the pre; the earlier answer is kept."));
    // the earlier answer kept, the correction standing; nothing released and no new answer
    expect(kept.map((k) => [k.position, k.value, k.via, k.superseded_by === null])).toEqual([
      [12, "like_post", "claim", false],
      [13, "cant_tell", "claim", true],
      [12, "like_pre", "amend", true],
    ]);
    expect(log.filter((a) => a.path.endsWith("/answer"))).toHaveLength(2);
    expect(log.some((a) => a.path.endsWith("/release"))).toBe(false);
    // back where it was: nothing left
    await until(() => text().includes("Nothing left for you"));
    blind([CAND, PRE, POST, CAND2, PRE2, POST2]);
  });

  it("anchored: m lists one's answers by item and opens one; s leaves it as it was and the item leased stays", async () => {
    vi.stubGlobal("fetch", anchoredEngine({ log, kept }));
    root = createRoot(host);
    await act(async () => root.render(<AnchoredReader caps={capsWith(anchoredDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => itemShown() === "item 13" && host.querySelector(".pair-answers"));
    await press("2");
    await press("Enter");
    await until(() => itemShown() === "item 14");
    const leased = log.filter((a) => a.path.endsWith("/claim")).length;
    await press("m");
    const row = await until(() => host.querySelector<HTMLElement>(".mine-drawer .mine-row"));
    expect(row.querySelector("img")).toBeNull();
    expect(row.textContent).toContain("item 13");
    expect(row.textContent).toContain("like the post");
    blind([CAND, PRE, POST, CAND2, PRE2, POST2]);
    await act(async () => row.querySelector<HTMLButtonElement>("button")!.click());
    await until(() => itemShown() === "item 13" && host.querySelector(".pair-answer.yours"));
    expect(host.querySelector(".mine-drawer")).toBeNull();
    // s: left as it was, back to the item leased, no new claim and no release
    await press("s");
    await until(() => itemShown() === "item 14" && !host.querySelector(".pair-answer.yours"));
    expect(host.querySelector(".said")?.textContent).toContain("item 13 left as it was");
    expect(log.some((a) => a.path.endsWith("/amend") || a.path.endsWith("/release"))).toBe(false);
    expect(log.filter((a) => a.path.endsWith("/claim")).length).toBe(leased);
    // the lease tag is back
    expect(host.querySelector(".correcting-tag")).toBeNull();
  });

  it("anchored: a link's answer opens in the reader, and the same answer again writes nothing new", async () => {
    vi.stubGlobal("fetch", anchoredEngine({ log, kept }));
    root = createRoot(host);
    await act(async () => root.render(<AnchoredReader caps={capsWith(anchoredDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => itemShown() === "item 13" && host.querySelector(".pair-answers"));
    await press("1");
    await press("Enter");
    await until(() => itemShown() === "item 14");
    await act(async () => root.unmount());
    location.hash = `#campaigns/${CAMPAIGN_ID}/anchored?amend=${kept[0].answer}`;
    root = createRoot(host);
    await act(async () => root.render(<AnchoredReader caps={capsWith(anchoredDoorsOf())} id={String(CAMPAIGN_ID)} query={{ amend: String(kept[0].answer) }} />));
    await until(() => itemShown() === "item 13" && host.querySelector(".pair-answer.yours")?.textContent?.includes("like the pre"));
    await press("Enter");
    await until(() => host.querySelector(".said")?.textContent?.includes("item 13 kept as it was: like the pre."));
    expect(kept).toHaveLength(1);
    // the address is the reader's own again
    expect(location.hash).toBe(`#campaigns/${CAMPAIGN_ID}/anchored`);
    await until(() => itemShown() === "item 14");
  });

  it("anchored: a closed campaign's answers stand as given", async () => {
    kept.push({ answer: 700, item: 9001, position: 12, value: "like_post", via: "claim", supersedes: null, superseded_by: null, answered_at: "2026-09-30T08:00:00Z" });
    vi.stubGlobal("fetch", anchoredEngine({ log, kept, status: "closed" }));
    root = createRoot(host);
    await act(async () => root.render(<AnchoredReader caps={capsWith(anchoredDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => itemShown() === "item 14");
    await press("b");
    await until(() => host.querySelector(".said")?.textContent?.includes("closed"));
    expect(itemShown()).toBe("item 14");
    expect(log.some((a) => a.path.endsWith("/mine") || a.path.endsWith("/amend"))).toBe(false);
  });

  it("pair: answers, b opens it marked, and Enter sends the pair's own word as the correction", async () => {
    vi.stubGlobal("fetch", pairEngine({ log, kept }));
    root = createRoot(host);
    await act(async () => root.render(<PairReader caps={capsWith(pairDoorsOf())} id={String(CAMPAIGN_ID)} />));
    await until(() => itemShown() === "pair 13" && host.querySelector(".pair-answers"));
    await press("1");
    await press("Enter");
    await until(() => itemShown() === "pair 14" && drawn.has(LEFT2));
    drawn.clear();
    await press("b");
    await until(() => itemShown() === "pair 13" && host.querySelector(".pair-answer.yours")?.textContent?.includes("left is post"));
    await until(() => drawn.has(LEFT) && drawn.has(RIGHT));
    expect(host.querySelector('[data-side="left"] .pair-says')?.textContent).toBe("post");
    blind([LEFT, RIGHT, LEFT2, RIGHT2]);
    await press("4");
    await press("Enter");
    await until(() => host.querySelector(".said")?.textContent?.includes("Corrected pair 13: left is post is now both post; the earlier answer is kept."));
    expect(log.find((a) => a.path.endsWith("/amend"))?.body).toEqual({ value: "both_post" });
    expect(kept.filter((k) => k.superseded_by === null).map((k) => [k.position, k.value])).toEqual([[12, "both_post"]]);
    expect(kept.find((k) => k.via === "claim")?.value).toBe("left_post");
    // back to the pair leased
    await until(() => itemShown() === "pair 14" && !host.querySelector(".pair-answer.yours"));
    await press("m");
    const row = await until(() => host.querySelector<HTMLElement>(".mine-drawer .mine-row"));
    expect(row.textContent).toContain("pair 13");
    expect(row.textContent).toContain("both post");
    expect(row.textContent).toContain("corrected");
    blind([LEFT, RIGHT, LEFT2, RIGHT2]);
  });

  it("My answers elsewhere opens an anchored or a pair answer in its own reader, by place and words alone", async () => {
    kept.push({ answer: 700, item: 9001, position: 12, value: "like_post", via: "claim", supersedes: null, superseded_by: null, answered_at: "2026-09-30T08:00:00Z" });
    vi.stubGlobal("fetch", anchoredEngine({ log, kept }));
    root = createRoot(host);
    await act(async () => root.render(<MyAnswers caps={capsWith(anchoredDoorsOf())} campaign={ANCHORED_CAMPAIGN} values={[]} back="rate" onClose={() => undefined} />));
    const link = await until(() => host.querySelector<HTMLAnchorElement>(".mine-row a"));
    expect(link.getAttribute("href")).toBe(`#campaigns/${CAMPAIGN_ID}/anchored?amend=700`);
    expect(host.querySelector(".mine-row")?.textContent).toContain("item 13");
    expect(host.querySelector(".mine-row")?.textContent).toContain("like the post");
    expect(host.querySelector(".mine-row")?.textContent).not.toContain("ago");
    expect(host.querySelector(".mine-drawer")?.textContent).not.toContain("axis answer is corrected");
  });
});
