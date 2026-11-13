// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// One proposal, one card (2026-11-13). A job plan the agent proposes is a
// change with an approval card and a plan in the inbox. A person saw two
// cards for it, pressed the lower one, and the upper one went on saying
// "waits for you"; when the job finished nothing said so. Here: the two are
// one card; the card says what the assistant says of the change, after a
// reload and after a decision made elsewhere; an approved plan lists its
// steps as they stand and what a finished question made; a plan no approval
// card names keeps a card of its own; and an assistant that says nothing of
// a change's state leaves the card as the page had it. Against a fake
// assistant and engine that answer by door and keep every call. Every
// number is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import type { Capabilities } from "../capabilities";
import { AssistantPage } from "./AssistantPage";
import type { Plan, Step } from "./client";
import { asChangeSeen, cardOfChange, changeSeen, planOfChange } from "./events";
import { CHAT, INBOX, fakeDoors, text } from "./onechat.fixture";
import { acceptPart, type Change, empty, fromHistory, withChange } from "./parts";
import { ranOf } from "./PlanCard";
import { reads } from "./reads";
import { PLAN_AGAIN_MS, planGoing } from "./useConversation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  reads.forget();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const DOORS = ["GET /api/jobs", "GET /api/jobs/{id}", "GET /api/jobs/{id}/log", "GET /api/ask/handles"];
const caps = (doors: string[] = DOORS): Capabilities => ({
  ...caps7a(doors),
  kvasir: { models: [{ id: "qwen38-27b", locality: "local" }] },
  assistant: { stations: [{ id: "nils" }] },
});

/** The conversation: one answer that proposes to run a stored question as a job, its approval naming the plan. */
const history = (ref: Record<string, unknown> = { plan: "p1" }) => ({
  offset: "4",
  messages: [
    { id: "u1", role: "user", parts: [text("Which subjects have two alike sessions?")] },
    {
      id: "a1",
      role: "assistant",
      parts: [
        text("The question is too slow for the chat. It can run as a job."),
        { type: "data-approval", data: { kind: "approval", id: "chg-1", change: "job_plan", title: "Run question 30 as a job", sentence: "The answer is kept as a result.", lines: ["run question 30"], ref } },
      ],
    },
  ],
  settlements: [{ submissionId: "s1", outcome: "completed" }],
});

const step = (over: Partial<Step> = {}): Step => ({ n: 1, rung: 2, verb: "run", door: "POST /api/ask/jobs", words: "run question 30", state: "waiting", reason: null, job: null, ...over });
const plan = (over: Partial<Plan> = {}, steps: Step[] = [step()]): Plan => ({ id: "p1", conversation: "c1", instruction: "Run question 30 as a job", state: "proposed", created_at: "2026-11-13T10:00:00Z", confirmed_at: null, steps, ...over });
const confirmedPlan = (s: Partial<Step>, over: Partial<Plan> = {}) => plan({ state: "confirmed", confirmed_at: "2026-11-13T10:01:00Z", ...over }, [step(s)]);
const JOB = { id: 357, kind: "ask", name: null, state: "done", started_at: "2026-11-13T10:01:00Z", heartbeat_at: null, finished_at: "2026-11-13T10:02:00Z", progress: null, error: null, args: { argv: ["nils", "--registry", "r", "ask", "run", "--document", "30"] }, result: { handle: 45, row_count: 1204, grain: "subject", truncated: false, job: 357 } };

interface Fake {
  history?: unknown;
  /** The inbox's plans, by how many times the inbox was read before. */
  plans?: (nth: number) => Plan[];
  /** What the change's own door answers. */
  change?: { status: number; body: unknown };
  /** What the decide door answers. */
  decide?: { status: number; body: unknown };
  confirm?: { status: number; body: unknown };
  job?: { status: number; body: unknown };
}

async function mount(f: Fake = {}, c: Capabilities = caps()) {
  const doors = fakeDoors();
  const e = engine((call, nth) => {
    const u = new URL(call.url, "http://x");
    if (u.pathname === "/assistant/agents/nils/c1" && call.method === "GET" && u.searchParams.get("view") === "history") return { status: 200, body: f.history ?? history() };
    if (u.pathname === "/assistant/conversations/c1" && call.method === "GET") return { status: 200, body: { ...CHAT, title: "Two alike sessions", proposals: [] } };
    if (u.pathname === "/assistant/inbox") return { status: 200, body: { ...INBOX, plans: f.plans?.(nth) ?? [] } };
    if (u.pathname === "/assistant/changes/chg-1" && call.method === "GET") return f.change ?? { status: 200, body: {} };
    if (u.pathname === "/assistant/changes/chg-1/decide") return f.decide ?? { status: 200, body: {} };
    if (u.pathname === "/assistant/plans/p2/confirm") return f.confirm ?? { status: 200, body: {} };
    if (u.pathname === "/api/jobs/357") return f.job ?? { status: 200, body: JOB };
    return doors(call, nth);
  });
  act(() => root.render(<AssistantPage caps={c} conversation="c1" />));
  await settle(12);
  return e;
}

const cards = () => [...host.querySelectorAll<HTMLElement>('.approval-card[data-change="job_plan"]')];
/** An element's words, a space between the words of each part. */
const words = (el: Element | null): string => {
  if (!el) return "";
  const out: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  }
  return out.join(" ");
};
const kind = (card: Element) => words(card.querySelector(".approval-kind"));
const buttons = (card: Element) => [...card.querySelectorAll(".approval-foot button")].map(words);
const steps = (card: Element) => [...card.querySelectorAll("ol li")].map((li) => (li.textContent ?? "").replace(/\s+/g, " ").trim());

describe("a job plan and its change in a conversation", () => {
  it("are one card, which waits for the person with its three buttons while the change is open", async () => {
    const e = await mount({ plans: () => [plan({ change: { id: "chg-1", state: "open", outcome: null } })], change: { status: 200, body: { id: "chg-1", state: "open", decided: null, outcome: null } } });
    expect(cards()).toHaveLength(1);
    const card = cards()[0];
    expect(kind(card)).toBe("Plan waits for you");
    expect(words(card.querySelector(".approval-title"))).toBe("Run question 30 as a job");
    expect(steps(card)).toEqual(["run question 30"]);
    expect(buttons(card)).toEqual(["Approve", "Change it", "Not now"]);
    // where the change stands was asked of the assistant as the conversation opened
    expect(e.of("GET", "/assistant/changes/chg-1")).toHaveLength(1);
  });

  it("are one card by the plan's word alone, where the approval names no plan", async () => {
    await mount({ history: history({}), plans: () => [plan({ change: { id: "chg-1", state: "open", outcome: null } })] });
    expect(cards()).toHaveLength(1);
    expect(buttons(cards()[0])).toEqual(["Approve", "Change it", "Not now"]);
  });

  it("show no buttons and the plan's steps once the assistant says the change is approved, after a reload and after a confirm made elsewhere", async () => {
    await mount({
      plans: () => [confirmedPlan({ state: "waiting", reason: "the person's token is not held; open the desk and the step runs" }, { change: { id: "chg-1", state: "approved", outcome: "approved on the plan's own card; the plan is confirmed" } })],
      change: { status: 200, body: { id: "chg-1", state: "approved", decided: "approved", outcome: "approved on the plan's own card; the plan is confirmed" } },
    });
    expect(cards()).toHaveLength(1);
    const card = cards()[0];
    expect(kind(card)).toBe("Plan approved");
    expect(card.querySelector(".approval-foot")).toBeNull();
    expect(card.querySelectorAll("button")).toHaveLength(0);
    // a step that waits says why, in the assistant's own words
    expect(steps(card)).toEqual(["run question 30: waiting: the person's token is not held; open the desk and the step runs"]);
  });

  it("say a queued, a running and a failed step as they stand, each with its job", async () => {
    await mount({ plans: () => [confirmedPlan({ state: "queued", job: 357 })], change: { status: 200, body: { state: "approved" } } });
    expect(steps(cards()[0])).toEqual(["run question 30: queued, job 357"]);
    expect(cards()[0].querySelector("ol a")?.getAttribute("href")).toBe("#pipelines/logs/357");
    act(() => root.unmount());
    root = createRoot(host);
    await mount({ plans: () => [confirmedPlan({ state: "running", job: 357 })], change: { status: 200, body: { state: "approved" } } }, caps([]));
    expect(steps(cards()[0])).toEqual(["run question 30: running, job 357"]);
    // a person who reads no logs gets the job's number, and no link
    expect(cards()[0].querySelector("ol a")).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    await mount({ plans: () => [confirmedPlan({ state: "failed", job: 357, reason: "the job ended failed" }, { state: "done" })], change: { status: 200, body: { state: "approved" } } });
    expect(kind(cards()[0])).toBe("Plan failed");
    expect(steps(cards()[0])).toEqual(["run question 30: failed, job 357: the job ended failed"]);
    expect(cards()[0].querySelector(".approval-foot")).toBeNull();
  });

  it("say that the question ran and what it made, with one link to where its rows are saved, though the plan is done", async () => {
    const e = await mount({ plans: () => [confirmedPlan({ state: "done", job: 357 }, { state: "done" })], change: { status: 200, body: { state: "approved", outcome: "approved; the plan is confirmed" } } });
    expect(cards()).toHaveLength(1);
    const card = cards()[0];
    expect(kind(card)).toBe("Plan done");
    expect(steps(card)).toEqual(["run question 30: done, job 357"]);
    expect(e.of("GET", "/api/jobs/357")).toHaveLength(1);
    const made = card.querySelector("p.meta")!;
    expect(words(made)).toBe("Question 30 ran: 1,204 subject rows, kept as Result 45. Download it on Exports");
    expect(made.querySelector("a")?.getAttribute("href")).toBe("#query/exports");
    expect(card.querySelectorAll("button")).toHaveLength(0);
  });

  it("say a held back answer as held back, with no link to a file that is not made", async () => {
    await mount({
      plans: () => [confirmedPlan({ state: "done", job: 357 }, { state: "done" })],
      change: { status: 200, body: { state: "approved" } },
      job: { status: 200, body: { ...JOB, result: { ...JOB.result, row_count: null } } },
    });
    const made = cards()[0].querySelector("p.meta")!;
    expect(words(made)).toBe("Question 30 ran. The rows are held back.");
    expect(made.querySelector("a")).toBeNull();
  });

  it("still say the step is done, with its job, where the person may not read the job", async () => {
    await mount({ plans: () => [confirmedPlan({ state: "done", job: 357 }, { state: "done" })], change: { status: 200, body: { state: "approved" } }, job: { status: 403, body: { error: "needs pipelines:see" } } });
    expect(kind(cards()[0])).toBe("Plan done");
    expect(steps(cards()[0])).toEqual(["run question 30: done, job 357"]);
    expect(cards()[0].querySelector("p.meta")).toBeNull();
  });
});

describe("a decision on the one card", () => {
  it("uses the decide door's answer, then lists the plan's steps from the inbox", async () => {
    const e = await mount({
      // the plan waits until the change is approved; then it is confirmed and its step queued
      plans: (nth) => (nth === 1 ? [plan()] : [confirmedPlan({ state: "queued", job: 357 })]),
      change: { status: 200, body: { state: "open", decided: null, outcome: null } },
      decide: { status: 200, body: { id: "chg-1", state: "approved", decided: "approved", outcome: "approved; the plan is confirmed" } },
    });
    act(() => button(cards()[0], "Approve")!.click());
    await settle();
    expect(e.of("POST", "/assistant/changes/chg-1/decide")[0].body).toEqual({ verdict: "approved" });
    expect(cards()).toHaveLength(1);
    expect(kind(cards()[0])).toBe("Plan approved");
    expect(cards()[0].querySelector(".approval-foot")).toBeNull();
    expect(steps(cards()[0])).toEqual(["run question 30: queued, job 357"]);
  });

  it("says an approval the assistant could not apply as not applied, in the assistant's words, never as approved", async () => {
    await mount({
      plans: () => [plan()],
      change: { status: 200, body: { state: "open" } },
      decide: { status: 502, body: { error: "no plan p1", change: { id: "chg-1", state: "failed", decided: null, outcome: "approved, and not applied: no plan p1" } } },
    });
    act(() => button(cards()[0], "Approve")!.click());
    await settle();
    const card = cards()[0];
    expect(kind(card)).toBe("Plan not applied");
    expect(words(card.querySelector("p.warn"))).toBe("Approved, and not applied: no plan p1.");
    expect(card.querySelector(".approval-foot")).toBeNull();
    // the card's sentence says why, so the page does not say it a second time
    expect(host.querySelector(".one-chat-thread > p.warn")).toBeNull();
  });

  it("says why a decision was refused where the card's own words do not: a plan approved on its own card cannot be declined", async () => {
    await mount({
      plans: (nth) => (nth === 1 ? [plan()] : [confirmedPlan({ state: "queued", job: 357 })]),
      change: { status: 200, body: { state: "open" } },
      decide: { status: 409, body: { error: "the plan was approved on its own card already, so it cannot be declined here", change: { id: "chg-1", state: "approved", decided: "approved", outcome: "approved on the plan's own card; the plan is confirmed" } } },
    });
    act(() => button(cards()[0], "Not now")!.click());
    await settle();
    expect(kind(cards()[0])).toBe("Plan approved");
    expect(steps(cards()[0])).toEqual(["run question 30: queued, job 357"]);
    expect(words(host.querySelector(".one-chat-thread > p.warn"))).toBe("the plan was approved on its own card already, so it cannot be declined here");
  });

  it("reads a change approved somewhere else as approved, from the assistant alone, with nothing of it in the inbox", async () => {
    await mount({ history: history({}), change: { status: 200, body: { id: "chg-1", state: "approved", decided: "approved", outcome: "approved; the plan is confirmed" } } });
    expect(kind(cards()[0])).toBe("Plan approved");
    expect(cards()[0].querySelectorAll("button")).toHaveLength(0);
    expect(steps(cards()[0])).toEqual(["run question 30"]);
  });

  it("says a plan no longer kept as expired, with nothing to press", async () => {
    await mount({ change: { status: 200, body: { state: "expired", decided: null, outcome: "the plan is no longer kept, so there is nothing left to approve" } } });
    const card = cards()[0];
    expect(kind(card)).toBe("Plan expired");
    expect(words(card.querySelector("p.meta"))).toBe("The plan is no longer kept, so there is nothing left to approve.");
    expect(card.querySelectorAll("button")).toHaveLength(0);
  });

  it("reads the change again when a decision is refused with no word on where it stands", async () => {
    let read = 0;
    const doors = fakeDoors();
    const e = engine((call, nth) => {
      const u = new URL(call.url, "http://x");
      if (u.pathname === "/assistant/agents/nils/c1" && call.method === "GET" && u.searchParams.get("view") === "history") return { status: 200, body: history() };
      if (u.pathname === "/assistant/changes/chg-1" && call.method === "GET") return { status: 200, body: { state: ++read === 1 ? "open" : "declined", outcome: null } };
      if (u.pathname === "/assistant/changes/chg-1/decide") return { status: 409, body: { error: "the change was declined already" } };
      return doors(call, nth);
    });
    act(() => root.render(<AssistantPage caps={caps()} conversation="c1" />));
    await settle(12);
    act(() => button(cards()[0], "Approve")!.click());
    await settle();
    expect(e.of("GET", "/assistant/changes/chg-1")).toHaveLength(2);
    expect(kind(cards()[0])).toBe("Plan not now");
    expect(words(host.querySelector(".one-chat-thread > p.warn"))).toBe("the change was declined already");
  });

  it("follows an approved plan while a step of it is under way, and stops when the plan is done", async () => {
    const e = await mount({
      plans: (nth) => (nth === 1 ? [confirmedPlan({ state: "queued", job: 357 })] : [confirmedPlan({ state: "done", job: 357 }, { state: "done" })]),
      change: { status: 200, body: { state: "approved" } },
    });
    expect(steps(cards()[0])).toEqual(["run question 30: queued, job 357"]);
    // the first look again comes three seconds after the plan was read
    expect(e.of("GET", "/assistant/inbox")).toHaveLength(1);
    await act(async () => {
      await new Promise((done) => setTimeout(done, PLAN_AGAIN_MS[0] + 200));
    });
    await settle();
    expect(e.of("GET", "/assistant/inbox")).toHaveLength(2);
    expect(kind(cards()[0])).toBe("Plan done");
    expect(steps(cards()[0])).toEqual(["run question 30: done, job 357"]);
    expect(words(cards()[0].querySelector("p.meta"))).toBe("Question 30 ran: 1,204 subject rows, kept as Result 45. Download it on Exports");
    // a plan that is done is not asked after again
    await act(async () => {
      await new Promise((done) => setTimeout(done, 400));
    });
    expect(e.of("GET", "/assistant/inbox")).toHaveLength(2);
  }, 15_000);
});

describe("a plan no approval card names", () => {
  const own = plan({ id: "p2", instruction: "Digest what is new", change: null }, [step({ verb: "digest", door: "POST /api/jobs", words: "digest the source place incoming" })]);

  it("keeps a card of its own, beside the one card of the plan a change proposed", async () => {
    const e = await mount({ plans: () => [plan({ change: { id: "chg-1", state: "open", outcome: null } }), own], confirm: { status: 200, body: { ...own, state: "confirmed", confirmed_at: "2026-11-13T10:05:00Z", steps: [{ ...own.steps[0], state: "queued", job: 400 }], change: null } } });
    expect(cards()).toHaveLength(2);
    const [mine, theirs] = cards();
    expect(words(mine.querySelector(".approval-title"))).toBe("Run question 30 as a job");
    expect(words(theirs.querySelector(".approval-title"))).toBe("Digest what is new");
    expect(kind(theirs)).toBe("Plan waits for you");
    expect(buttons(theirs)).toEqual(["Approve", "Change it", "Not now"]);
    // approving it confirms the plan at the plan's door, as before, and the card says what the door answered
    act(() => button(theirs, "Approve")!.click());
    await settle();
    expect(e.of("POST", "/assistant/plans/p2/confirm")).toHaveLength(1);
    expect(e.of("POST", "/assistant/changes/chg-1/decide")).toHaveLength(0);
    expect(kind(cards()[1])).toBe("Plan approved");
    expect(steps(cards()[1])).toEqual(["digest the source place incoming: queued"]);
    expect(kind(cards()[0])).toBe("Plan waits for you");
  });

  it("is put aside with Not now and leaves once it is done, as before", async () => {
    await mount({ history: { offset: "0", messages: [], settlements: [] }, plans: () => [own, plan({ id: "p3", instruction: "Sorted last week", state: "done", confirmed_at: "2026-11-06T10:00:00Z", change: null })] });
    expect(cards()).toHaveLength(1);
    act(() => button(cards()[0], "Not now")!.click());
    expect(cards()).toHaveLength(0);
  });
});

describe("an assistant before 1.0.0-alpha.34", () => {
  it("that says nothing of where a change stands leaves the card as the page has it: open with its buttons, and approved once the person approves", async () => {
    // no state at the change's door, no change on the plan, nothing in the decide door's answer
    const e = await mount({ plans: (nth) => (nth === 1 ? [plan()] : [confirmedPlan({ state: "queued", job: 357 })]) });
    expect(cards()).toHaveLength(1);
    expect(kind(cards()[0])).toBe("Plan waits for you");
    expect(buttons(cards()[0])).toEqual(["Approve", "Change it", "Not now"]);
    act(() => button(cards()[0], "Approve")!.click());
    await settle();
    expect(e.of("POST", "/assistant/changes/chg-1/decide")[0].body).toEqual({ verdict: "approved" });
    expect(kind(cards()[0])).toBe("Plan approved");
    expect(steps(cards()[0])).toEqual(["run question 30: queued, job 357"]);
  });

  it("declines as before", async () => {
    await mount({ plans: () => [plan()] });
    act(() => button(cards()[0], "Not now")!.click());
    await settle();
    expect(kind(cards()[0])).toBe("Plan not now");
    expect(cards()[0].querySelector(".approval-foot")).toBeNull();
    expect(cards()).toHaveLength(1);
  });

  it("that says the state and no outcome is believed all the same: approved after a reload, with no buttons", async () => {
    // 1.0.0-alpha.33 answers a change's state and the verdict at its door, and nothing of the plan
    await mount({ change: { status: 200, body: { id: "chg-1", kind: "job_plan", change: "job_plan", state: "approved", decided: "approved", result: { applied: true } } } });
    expect(kind(cards()[0])).toBe("Plan approved");
    expect(cards()[0].querySelectorAll("button")).toHaveLength(0);
    // its plan is not among the inbox's: the lines stay as they were proposed
    expect(steps(cards()[0])).toEqual(["run question 30"]);
  });

  it("that says an approval failed, with no sentence, is told as not applied", async () => {
    await mount({ change: { status: 200, body: { id: "chg-1", state: "failed", decided: null, result: { applied: false, why: "no plan p1" } } } });
    expect(kind(cards()[0])).toBe("Plan not applied");
    expect(words(cards()[0].querySelector("p.warn"))).toBe("Approved, and not applied.");
    expect(cards()[0].querySelectorAll("button")).toHaveLength(0);
  });

  it("reads a plan confirmed on a card of its own as approved, though the change is still called open", async () => {
    await mount({ plans: () => [confirmedPlan({ state: "done", job: 357 }, { state: "done" })], change: { status: 200, body: { id: "chg-1", state: "open", decided: null } } });
    expect(cards()).toHaveLength(1);
    expect(kind(cards()[0])).toBe("Plan done");
    expect(cards()[0].querySelector(".approval-foot")).toBeNull();
  });

  it("keeps the card open where the change's door is not served at all", async () => {
    await mount({ plans: () => [plan()], change: { status: 404, body: { error: "no door" } } });
    expect(kind(cards()[0])).toBe("Plan waits for you");
    expect(host.querySelector(".one-chat-thread > p.warn")).toBeNull();
  });
});

describe("the shapes behind the card", () => {
  const change = (over: Partial<Change> = {}): Change => ({ id: "chg-1", change: "job_plan", title: "Run question 30 as a job", sentence: "", lines: ["run question 30"], turn: "a1", decided: null, plan: "p1", ...over });

  it("reads where a change stands from its state, else from the verdict, else says nothing", () => {
    expect(asChangeSeen({ state: "approved", outcome: " approved; the plan is confirmed " })).toEqual({ state: "approved", outcome: "approved; the plan is confirmed" });
    expect(asChangeSeen({ state: "expired", outcome: null })).toEqual({ state: "expired", outcome: null });
    expect(asChangeSeen({ decided: "declined" })).toEqual({ state: "declined", outcome: null });
    expect(asChangeSeen({ state: "odd" })).toBeNull();
    expect(asChangeSeen({})).toBeNull();
    expect(asChangeSeen(null)).toBeNull();
  });

  it("keeps the plan an approval names, and what the assistant said of a change across a history read again", () => {
    const s = acceptPart(empty(), "a1", { kind: "approval", id: "chg-1", change: "job_plan", sentence: "Run it", ref: { plan: "p1" } });
    expect(s.changes[0]).toMatchObject({ id: "chg-1", plan: "p1", decided: null });
    expect(s.changes[0].state).toBeUndefined();
    // the assistant's word wins over what was pressed; with no word, what was pressed stands
    expect(withChange(s, "chg-1", { state: "failed", outcome: "approved, and not applied: no plan" }, "approved").changes[0]).toMatchObject({ state: "failed", decided: "approved", outcome: "approved, and not applied: no plan" });
    expect(withChange(s, "chg-1", { state: "expired", outcome: null }, "approved").changes[0]).toMatchObject({ state: "expired", decided: null });
    const pressed = withChange(s, "chg-1", null, "declined").changes[0];
    expect(pressed.decided).toBe("declined");
    expect(pressed.state).toBeUndefined();
    const told = withChange(s, "chg-1", { state: "approved", outcome: "approved; the plan is confirmed" });
    const again = fromHistory({ messages: [{ id: "a1", role: "assistant", parts: [{ type: "data-approval", data: { kind: "approval", id: "chg-1", change: "job_plan", sentence: "Run it", ref: { plan: "p1" } } }] }] }, told);
    expect(again.changes[0]).toMatchObject({ state: "approved", decided: "approved", outcome: "approved; the plan is confirmed", plan: "p1" });
  });

  it("finds a change's plan by the approval's word or by the plan's own", () => {
    const plans = [plan({ id: "p0" }), plan({ id: "p1" }), plan({ id: "p9", change: { id: "chg-9", state: "open" } })];
    expect(planOfChange(change(), plans)?.id).toBe("p1");
    expect(planOfChange(change({ id: "chg-9", plan: undefined }), plans)?.id).toBe("p9");
    expect(planOfChange(change({ id: "chg-2", plan: undefined }), plans)).toBeNull();
    expect(planOfChange(change({ plan: "gone" }), plans)).toBeNull();
  });

  it("never takes a settled change back to open, and reads the inbox's word where the change's own was not read", () => {
    expect(changeSeen(change()).state).toBe("open");
    expect(changeSeen(change({ decided: "approved" })).state).toBe("approved");
    // the assistant's word, once read, is the card's: what the page remembers does not stand against it
    expect(changeSeen(change({ state: "open", decided: null })).state).toBe("open");
    expect(changeSeen(change({ state: "declined" })).state).toBe("declined");
    expect(changeSeen(change(), plan({ change: { id: "chg-1", state: "declined", outcome: "declined; the plan was taken back" } }))).toEqual({ state: "declined", outcome: "declined; the plan was taken back" });
    expect(changeSeen(change({ state: "open" }), plan({ change: { id: "chg-1", state: "approved", outcome: "approved; the plan is confirmed" } })).state).toBe("approved");
    // another change's word on the plan says nothing of this one
    expect(changeSeen(change({ id: "chg-2" }), plan({ change: { id: "chg-1", state: "declined" } })).state).toBe("open");
  });

  it("draws an open change's lines as proposed, and an approved plan's steps in their place", () => {
    const open = cardOfChange(change(), { plan: plan() });
    expect(open).toMatchObject({ state: "open", lines: ["run question 30"], numbered: true });
    expect(open.steps).toBeUndefined();
    const going = cardOfChange(change({ state: "approved" }), { plan: plan({ state: "confirmed", confirmed_at: "t" }, [step({ state: "waiting", reason: "waiting: until 2026-11-13T22:00:00Z" }), step({ n: 2, rung: 3, verb: "promote", words: "promote result 45 into a cohort", decided: null })]) });
    expect(going).toMatchObject({ state: "approved", done: "approved" });
    expect(going.steps).toEqual([
      { n: 1, words: "run question 30", state: "waiting", job: null, href: null, reason: "until 2026-11-13T22:00:00Z" },
      { n: 2, words: "promote result 45 into a cohort", state: "asks you", job: null, href: null, reason: null },
    ]);
    // a declined change keeps its lines, whatever became of its plan's steps
    expect(cardOfChange(change({ state: "declined" }), { plan: plan() })).toMatchObject({ state: "declined", lines: ["run question 30"] });
    // a change of another kind is drawn as before
    expect(cardOfChange({ id: "w", change: "sorting_words", title: null, sentence: "Add a word", lines: [], turn: "a", decided: null, state: "approved", outcome: "approved" })).toMatchObject({ state: "approved", done: "approved" });
  });

  it("reads what a question's job made from its row, and knows which plans are under way", () => {
    expect(ranOf(JOB)).toEqual({ document: 30, handle: 45, rows: 1204, grain: "subject", held: false });
    expect(ranOf({ args: {}, result: { handle: 45, row_count: null } })).toEqual({ document: null, handle: 45, rows: null, grain: null, held: true });
    expect(ranOf({ args: {}, result: null })).toEqual({ document: null, handle: null, rows: null, grain: null, held: false });
    expect(planGoing(plan())).toBe(false);
    expect(planGoing(confirmedPlan({ state: "queued" }))).toBe(true);
    expect(planGoing(confirmedPlan({ state: "done" }, { state: "done" }))).toBe(false);
    expect(planGoing(plan({ state: "confirmed" }, [step({ rung: 3 })]))).toBe(false);
  });
});
