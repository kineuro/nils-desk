// SPDX-License-Identifier: AGPL-3.0-only
// One conversation with a station, as a page holds it: its history read when
// it opens, the stream followed from an offset while a turn runs, a prompt sent
// with what the page contributes, a turn stopped, a proposal decided and a plan
// confirmed. The Assistant page holds one, and so does a Query card's
// discussion.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageContext } from "../ui/context";
import { type ChatContext, type ChatVersions, chats, chatsKept, type Rating } from "./chats";
import { assistant, StaleProposal, type Delegation, type Plan } from "./client";
import { after, positionOf, type Position } from "./events";
import { type Change, type Chunk, empty, fromHistory, reduce, type PaneState, type Proposal, withStored } from "./parts";

const TOKEN_PUSH_MS = 5 * 60_000;
/** The long poll's pause while a delegate still works, where the stream is not served as events. */
const DELEGATION_POLL_MS = 4_000;
const RECONNECT_MS = 1_000;

/** The conversations this tab asked the model to name as they opened, so a name that does not come is not asked for on every open. */
const namedOnOpen = new Set<string>();

/** What a prompt carries beside its words: the page's typed context, and the lineage and the document it is about. */
export interface Beside {
  context?: PageContext;
  lineage?: number | null;
  document?: number | null;
}

export interface Conversing {
  pane: PaneState;
  plans: Plan[];
  /** When the running turn started, for the wait's clock. */
  since: number;
  why: string | null;
  /** How full the conversation's context is, as the assistant last said (the chat, slice 3). */
  context: ChatContext | null;
  /** The places in this conversation sent more than one way, and the person's verdicts on its answers (the chat, slice 4). */
  versions: ChatVersions[];
  ratings: Rating[];
  /** Start again from nothing, as when another conversation opens. */
  reset: () => void;
  /** A conversation just made on this page: it has no history to read yet. */
  made: (id: string) => void;
  send: (id: string, words: string, beside?: Beside) => void;
  summarize: (id: string) => Promise<void>;
  /** Send once the conversation named has opened and its history is read: into a version just made. */
  sendWhenOpen: (id: string, words: string, beside?: Beside) => void;
  stop: () => void;
  /** A proposal's verdict, with the document the person is on; true once the assistant recorded it. */
  decide: (p: Proposal, verdict: "accepted" | "rejected", current?: number) => Promise<boolean>;
  confirm: (p: Plan) => void;
  /** One chat: a proposed change approved or declined; the assistant applies it. */
  decideChange: (c: Change, verdict: "approved" | "declined") => void;
  /** The person's verdict on an answer, up or down with a reason; null takes it back. */
  rate: (message: string, verdict: "up" | "down" | null, reason?: string) => void;
}

export function useConversation(station: string, conv: string | null): Conversing {
  const [pane, setPane] = useState<PaneState>(empty);
  const current = useRef<PaneState>(empty());
  const fresh = useRef<string | null>(null);
  const reader = useRef<AbortController | null>(null);
  const [since, setSince] = useState(0);
  const [why, setWhy] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [context, setContext] = useState<ChatContext | null>(null);
  const [versions, setVersions] = useState<ChatVersions[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const queued = useRef<{ id: string; words: string; beside: Beside } | null>(null);
  // whether the assistant serves the stream as server-sent events; learned on the first try
  const streamed = useRef(true);

  // the reducer's state is kept in a ref as well, so the reading loop decides on what it just applied
  const apply = useCallback((f: (s: PaneState) => PaneState) => {
    current.current = f(current.current);
    setPane(current.current);
  }, []);

  const readPlans = useCallback((id: string) => {
    assistant
      .inbox()
      .then((i) => setPlans(i.plans.filter((p) => p.conversation === id && p.state !== "done")))
      .catch(() => setPlans([]));
  }, []);

  // what follows the stream once a turn settled: the plans, the list's order, the context and the name
  const settledTurn = useCallback(
    (id: string) => {
      readPlans(id);
      // the list orders by the last use, so a settled turn moves this conversation up
      chatsKept.refresh().catch(() => undefined);
      // and the turn filled the context a little more
      chats.get(id).then(
        (c) => {
          setContext(c.context ?? null);
          setVersions(c.versions ?? []);
          setRatings(c.ratings ?? []);
          // a conversation still named by its first words is named by the model once an answer settles (the chat, slice 10)
          if (c.title_by === "words")
            chats
              .name(id)
              .then(() => chatsKept.refresh())
              .catch(() => undefined);
        },
        () => undefined,
      );
    },
    [readPlans],
  );

  // one chat: the stream followed as server-sent events where the assistant serves them, by long poll where not
  const follow = useCallback(
    (id: string, from: string) => {
      reader.current?.abort();
      const ctl = new AbortController();
      reader.current = ctl;
      let offset = from;
      let last: Position | null = null;
      // the chunks of one read: those not seen before applied, then whether the turn is over
      const take = async (chunks: Chunk[], next: string): Promise<"over" | "waiting" | "running"> => {
        const fresh = chunks.filter((c) => {
          const p = positionOf(c);
          if (!p) return true;
          if (!after(p, last)) return false;
          last = p;
          return true;
        });
        apply((s) => {
          let out = s;
          for (const c of fresh) out = reduce(out, c);
          return { ...out, offset: next };
        });
        offset = next;
        const s = current.current;
        if (fresh.length === 0 || s.settled === null || s.busy) return "running";
        // the concierge settles at once and is woken when its delegate settles (4c section 9.12)
        if (station === "concierge") {
          const tasks = await assistant.delegations(id).catch(() => [] as Delegation[]);
          if (tasks.some((t) => t.state === "queued" || t.state === "running")) {
            apply((x) => ({ ...x, busy: true }));
            return "waiting";
          }
        }
        settledTurn(id);
        return "over";
      };
      const loop = async () => {
        while (!ctl.signal.aborted) {
          if (streamed.current) {
            const how = await assistant.stream(station, id, offset, ctl.signal, async (chunks, next) => (await take(chunks, next)) === "over");
            if (how === "stopped") return;
            if (how === "unsupported") streamed.current = false;
            // a stream the network closed is opened again from where it was
            else await new Promise((r) => setTimeout(r, RECONNECT_MS));
            continue;
          }
          const { chunks, next } = await assistant.updates(station, id, offset, ctl.signal);
          const state = await take(chunks, next);
          if (state === "over") return;
          if (state === "waiting") await new Promise((r) => setTimeout(r, DELEGATION_POLL_MS));
        }
      };
      loop().catch((e: Error) => {
        if (e.name !== "AbortError") setWhy(e.message);
      });
    },
    [station, apply, settledTurn],
  );

  // opening a kept conversation: its history, the person's token, and a turn still running followed
  useEffect(() => {
    if (!conv) return;
    let alive = true;
    assistant.token(conv).catch(() => undefined);
    if (fresh.current !== conv) {
      assistant
        .history(station, conv)
        .then((h) => {
          if (!alive) return;
          const s = h ? fromHistory(h) : empty();
          apply(() => s);
          if (s.busy) {
            setSince(Date.now());
            follow(conv, s.offset);
          }
          readPlans(conv);
          // words waiting for this conversation to open: a version just made, sent into once its history is read
          const q = queued.current;
          if (q && q.id === conv && !s.busy) {
            queued.current = null;
            send(q.id, q.words, q.beside);
          }
          // the decisions the assistant keeps: a reload shows what was accepted or disregarded
          chats.get(conv).then(
            (c) => {
              if (!alive) return;
              apply((x) => withStored(x, c.proposals));
              setContext(c.context ?? null);
              setVersions(c.versions ?? []);
              setRatings(c.ratings ?? []);
              // a turn that settled while no page followed it left the conversation named by its first words: the model names it now, once (2026-10-09)
              if (c.title_by === "words" && !s.busy && (h?.settlements ?? []).length > 0 && !namedOnOpen.has(conv)) {
                namedOnOpen.add(conv);
                chats
                  .name(conv)
                  .then(() => chatsKept.refresh())
                  .catch(() => undefined);
              }
            },
            () => undefined,
          );
        })
        .catch((e: Error) => alive && setWhy(e.message));
    }
    const t = setInterval(() => assistant.token(conv).catch(() => undefined), TOKEN_PUSH_MS);
    return () => {
      alive = false;
      clearInterval(t);
      reader.current?.abort();
    };
  }, [conv, station, apply, follow, readPlans]);

  const reset = useCallback(() => {
    reader.current?.abort();
    // a conversation made on this page has a history by the time it is opened again
    fresh.current = null;
    apply(() => empty());
    setPlans([]);
    setWhy(null);
    setContext(null);
    setVersions([]);
    setRatings([]);
  }, [apply]);

  const made = useCallback((id: string) => {
    fresh.current = id;
  }, []);

  const send = (id: string, words: string, beside: Beside = {}) => {
    const first = current.current.offset === "-1";
    setWhy(null);
    setSince(Date.now());
    apply((s) => ({ ...s, busy: true, settled: null }));
    assistant
      .send(station, id, words, beside)
      .then(({ offset }) => follow(id, first ? "-1" : offset))
      .catch((e: Error) => {
        setWhy(e.message);
        apply((s) => ({ ...s, busy: false }));
      });
  };

  const stop = () => {
    if (conv) assistant.abort(station, conv).catch((e: Error) => setWhy(e.message));
  };

  const decide = (p: Proposal, verdict: "accepted" | "rejected", on?: number): Promise<boolean> => {
    if (!conv) return Promise.resolve(false);
    const row = { document: p.document, sentence: p.sentence, ...(typeof on === "number" ? { current: on } : {}) };
    return assistant
      .feedback(conv, verdict === "accepted" ? [row] : [], verdict === "rejected" ? [row] : [])
      .then(() => {
        apply((s) => ({ ...s, proposals: s.proposals.map((x) => (x.document === p.document ? { ...x, decided: verdict } : x)) }));
        return true;
      })
      .catch((e: Error) => {
        if (e instanceof StaleProposal) apply((s) => ({ ...s, proposals: s.proposals.map((x) => (x.document === p.document ? { ...x, stale: { moved_to: e.movedTo } } : x)) }));
        else setWhy(e.message);
        return false;
      });
  };

  const confirm = (p: Plan) => {
    assistant
      .confirmPlan(p.id)
      .then((done) => setPlans((all) => all.map((x) => (x.id === done.id ? done : x))))
      .catch((e: Error) => setWhy(e.message));
  };

  const decideChange = (c: Change, verdict: "approved" | "declined") => {
    assistant
      .decideChange(c.id, verdict)
      .then(() => apply((s) => ({ ...s, changes: s.changes.map((x) => (x.id === c.id ? { ...x, decided: verdict } : x)) })))
      .catch((e: Error) => setWhy(e.message));
  };

  const sendWhenOpen = (id: string, words: string, beside: Beside = {}) => {
    queued.current = { id, words, beside };
  };

  const rate = (message: string, verdict: "up" | "down" | null, reason?: string) => {
    if (!conv) return;
    const before = ratings;
    setRatings((all) => [
      ...all.filter((r) => r.message !== message),
      ...(verdict ? [{ message, verdict, reason: reason ?? null, at: new Date().toISOString() }] : []),
    ]);
    chats.rate(conv, message, verdict, reason).catch((e: Error) => {
      setRatings(before);
      setWhy(e.message);
    });
  };

  // the earlier conversation summarized on the person's word (the chat, slice 11): followed as a turn is, while the station answers in one line and the runtime summarizes
  const summarize = (id: string): Promise<void> => {
    setWhy(null);
    setSince(Date.now());
    apply((s) => ({ ...s, busy: true, settled: null }));
    return chats.summarize(id).then(
      ({ offset }) => follow(id, offset ?? current.current.offset),
      (e: unknown) => {
        apply((s) => ({ ...s, busy: false }));
        throw e;
      },
    );
  };

  return { pane, plans, since, why, context, versions, ratings, reset, made, send, summarize, sendWhenOpen, stop, decide, confirm, decideChange, rate };
}
