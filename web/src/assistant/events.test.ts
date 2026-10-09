// SPDX-License-Identifier: AGPL-3.0-only
// One chat: the agreed event and card shapes, the stream as server-sent
// events, and the fallback to today's concierge.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Capabilities } from "../capabilities";
import { assistant, type Plan } from "./client";
import { after, agentFor, asOneChatPart, cardOfChange, cardOfPlan, cardOfProposal, parseSse, planShown, positionOf } from "./events";
import { type Chunk, empty, fromHistory, reduce } from "./parts";

const caps = (stations: { id: string }[] | null): Capabilities =>
  ({ assistant: stations === null ? null : { stations }, kvasir: null, engine: null, apps: [], person: { subject: "a", display_name: "A", grants: [], detail: "plain", groups: [] }, desk: {} }) as unknown as Capabilities;

describe("the agent a new chat talks to", () => {
  it("is the one agent when served, else today's concierge, else ask-help", () => {
    expect(agentFor(caps([{ id: "concierge" }, { id: "nils" }]))).toBe("nils");
    expect(agentFor(caps([{ id: "ask-help" }, { id: "concierge" }]))).toBe("concierge");
    expect(agentFor(caps([{ id: "ask-help" }]))).toBe("ask-help");
    expect(agentFor(caps(null))).toBe("ask-help");
  });
});

describe("the one chat's parts", () => {
  it("admit the four shapes and drop the rest", () => {
    expect(asOneChatPart({ kind: "progress", call: "t1", text: " Reading 3 of 9 " })).toEqual({ kind: "progress", call: "t1", text: "Reading 3 of 9" });
    expect(asOneChatPart({ kind: "progress", text: "" })).toBeNull();
    expect(asOneChatPart({ kind: "plan_update", items: [{ text: "Find", status: "done" }, { text: "Count", status: "odd" }, { nope: 1 }] })).toEqual({
      kind: "plan_update",
      items: [
        { text: "Find", status: "done" },
        { text: "Count", status: "pending" },
      ],
    });
    expect(asOneChatPart({ kind: "approval", id: "c1", change: "sorting_words", sentence: "Add FLAIR3D", lines: ["flair3d to FLAIR", 4] })).toEqual({
      kind: "approval",
      id: "c1",
      change: "sorting_words",
      title: null,
      sentence: "Add FLAIR3D",
      lines: ["flair3d to FLAIR"],
      ref: {},
    });
    expect(asOneChatPart({ kind: "approval", id: "c2", change: "query_version", sentence: "x" })).toBeNull();
    expect(asOneChatPart({ kind: "approval", id: "c3", change: "drop_table", sentence: "x" })).toBeNull();
    expect(asOneChatPart({ kind: "clarification", question: "Which cohort?", options: [{ label: "A", count: 3 }, { label: "B" }] })).toEqual({
      kind: "clarification",
      question: "Which cohort?",
      options: [
        { label: "A", count: 3 },
        { label: "B", count: null },
      ],
    });
    expect(asOneChatPart({ kind: "move_proposal", document: 1, parent: null, sentence: "x" })).toBeNull();
  });

  it("feed the plan panel, the approval and clarification cards, live and from a history", () => {
    const chunks: Chunk[] = [
      { type: "message-started", messageId: "a1" },
      { type: "data-part", messageId: "a1", name: "plan_update", data: { kind: "plan_update", items: [{ text: "Find the scans", status: "running" }, { text: "Count them", status: "pending" }] } },
      { type: "data-part", messageId: "a1", name: "approval", data: { kind: "approval", id: "q", change: "query_version", sentence: "Only women", ref: { document: 12, parent: 11 } } },
      { type: "data-part", messageId: "a1", name: "approval", data: { kind: "approval", id: "m1", change: "identity_merge", sentence: "These two are one person", lines: ["sub-1", "sub-2"] } },
      { type: "data-part", messageId: "a1", name: "clarification", data: { kind: "clarification", question: "Which site?", options: [{ label: "Solna" }] } },
    ];
    const s = chunks.reduce(reduce, empty());
    expect(planShown(s.plan)).toBe(true);
    expect(s.proposals).toEqual([{ document: 12, parent: 11, sentence: "Only women", turn: "a1", decided: null }]);
    expect(s.changes).toEqual([{ id: "m1", change: "identity_merge", title: null, sentence: "These two are one person", lines: ["sub-1", "sub-2"], turn: "a1", decided: null }]);
    expect(s.choice).toEqual({ question: "Which site?", options: [{ label: "Solna", count: null }], turn: "a1" });
    const h = fromHistory({ messages: [{ id: "a1", role: "assistant", parts: chunks.filter((c) => c.type === "data-part").map((c) => ({ type: `data-${String(c.name)}`, data: c.data })) }] }, { ...s, changes: s.changes.map((c) => ({ ...c, decided: "approved" as const })) });
    expect(h.changes[0]?.decided).toBe("approved");
    expect(h.plan).toHaveLength(2);
  });

  it("show the plan panel only while a plan of several steps is under way", () => {
    expect(planShown(null)).toBe(false);
    expect(planShown([{ text: "One", status: "running" }])).toBe(false);
    expect(planShown([{ text: "One", status: "done" }, { text: "Two", status: "done" }])).toBe(false);
    expect(planShown([{ text: "One", status: "done" }, { text: "Two", status: "pending" }])).toBe(true);
  });
});

describe("the one approval card", () => {
  it("carries a query version, a job plan and every other change alike", () => {
    const q = cardOfProposal({ document: 5, parent: 4, sentence: "Only women", turn: "a", decided: null }, "It stands on the card above.");
    expect(q).toMatchObject({ change: "query_version", title: "A new version of the query", state: "open", approve: "Accept", decline: "Disregard", elsewhere: "It stands on the card above." });
    expect(cardOfProposal({ document: 5, parent: 4, sentence: "x", turn: "a", decided: null, stale: { moved_to: 7 } }).state).toBe("stale");
    expect(cardOfChange({ id: "w", change: "sorting_words", title: null, sentence: "Add a word", lines: [], turn: "a", decided: "declined" })).toMatchObject({ title: "New sorting words", state: "declined" });
    const plan: Plan = { id: "p", instruction: "Digest what is new", state: "proposed", steps: [{ n: 1, rung: 2, verb: "digest", door: "d", words: "Digest source A", state: "waiting" }, { n: 2, rung: 3, verb: "x", door: "d", words: "Digest source B", state: "waiting" }] };
    expect(cardOfPlan(plan)).toMatchObject({ change: "job_plan", title: "A plan to run, in 2 steps", sentence: "Digest what is new", lines: ["Digest source A", "Digest source B"], state: "open", approve: "Confirm", decline: "Change it" });
    expect(cardOfPlan({ ...plan, confirmed_at: "now" }).state).toBe("approved");
  });
});

describe("the stream as server-sent events", () => {
  it("splits events, drops heartbeats and keeps a partial event for later", () => {
    const { events, rest } = parseSse('event: data\ndata:[{"type":"a"}]\n\n: heartbeat\n\nevent: control\r\ndata:{"streamNextOffset":"7"}\r\n\r\nevent: da');
    expect(events).toEqual([
      { event: "data", data: '[{"type":"a"}]' },
      { event: "control", data: '{"streamNextOffset":"7"}' },
    ]);
    expect(rest).toBe("event: da");
  });

  it("orders positions so a reconnect's repeats are dropped", () => {
    expect(positionOf({ position: { batch: 2, index: 0 } })).toEqual({ batch: 2, index: 0 });
    expect(positionOf({})).toBeNull();
    expect(after({ batch: 2, index: 0 }, { batch: 1, index: 9 })).toBe(true);
    expect(after({ batch: 1, index: 9 }, { batch: 1, index: 9 })).toBe(false);
    expect(after({ batch: 1, index: 0 }, null)).toBe(true);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("hands each read cycle over with its offset, and stops when told", async () => {
    const body = [
      "event: data\ndata:" + JSON.stringify([{ type: "message-started", messageId: "a1" }]) + "\n\nevent: con",
      'trol\ndata:{"streamNextOffset":"o1"}\n\n: heartbeat\n\n',
      "event: data\ndata:" + JSON.stringify([{ type: "submission-settled", submissionId: "s", outcome: "completed" }]) + '\n\nevent: control\ndata:{"streamNextOffset":"o2","upToDate":true}\n\n',
    ];
    const fetched: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      fetched.push(url);
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          for (const b of body) c.enqueue(new TextEncoder().encode(b));
        },
      });
      return Promise.resolve(new Response(stream, { headers: { "content-type": "text/event-stream" } }));
    });
    const seen: [string[], string][] = [];
    const how = await assistant.stream("nils", "c1", "-1", new AbortController().signal, (chunks, next) => {
      seen.push([chunks.map((c) => c.type), next]);
      return chunks.some((c) => c.type === "submission-settled");
    });
    expect(how).toBe("stopped");
    expect(fetched[0]).toBe("/assistant/agents/nils/c1?view=updates&offset=-1&live=sse");
    expect(seen).toEqual([
      [["message-started"], "o1"],
      [["submission-settled"], "o2"],
    ]);
  });

  it("says when the assistant does not serve events, so the desk long-polls", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("[]", { headers: { "content-type": "application/json" } })));
    expect(await assistant.stream("concierge", "c1", "-1", new AbortController().signal, () => true)).toBe("unsupported");
  });
});
