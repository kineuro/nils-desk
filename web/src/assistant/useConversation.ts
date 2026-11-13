// SPDX-License-Identifier: AGPL-3.0-only
// One conversation with a station, as a page holds it: its history read when
// it opens, the stream followed from an offset while a turn runs, a prompt sent
// with what the page contributes, a turn stopped, a proposal decided and a plan
// confirmed. The Assistant page holds one, and so does a Query card's
// discussion.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageContext } from "../ui/context";
import { type ChatContext, type ChatVersions, chats, chatsKept, type Rating } from "./chats";
import { assistant, ChangeRefused, StaleProposal, type Delegation, type Plan } from "./client";
import { after, asChangeSeen, positionOf, type Position } from "./events";
import { type Change, type Chunk, empty, fromHistory, reduce, type PaneState, type Proposal, withChange, withStored } from "./parts";
import { nothingYet, STARTING_AFTER_MS } from "./steps";

const TOKEN_PUSH_MS = 5 * 60_000;
/** The long poll's pause while a delegate still works, where the stream is not served as events. */
const DELEGATION_POLL_MS = 4_000;
const RECONNECT_MS = 1_000;
/** The longest pause before the stream is opened again after it failed. */
const RECONNECT_MOST_MS = 30_000;
/**
 * How long a turn the history alone would take for lost is followed first:
 * its answer is stamped when its first step began and keeps that stamp, so
 * a turn of forty minutes still running looks thirty minutes old. Lost only
 * once the stream, read and caught up, brought nothing of it for this long.
 */
export const PROBE_MS = 15_000;
/**
 * How soon an approved plan's steps are read again while one of them still waits, is queued or runs: after 3, 6
 * and 12 seconds, then every 15, as often as the assistant itself looks at a step's job.
 */
export const PLAN_AGAIN_MS = [3_000, 6_000, 12_000, 15_000];

/** Whether a plan is confirmed and has a step the assistant has yet to take or still follows. */
export function planGoing(p: Plan): boolean {
  return p.state === "confirmed" && p.steps.some((s) => s.rung === 2 && (s.state === "waiting" || s.state === "queued" || s.state === "running"));
}

/** A pause that ends early when the follow is stopped. */
function pauseFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((done) => {
    if (signal.aborted) return done();
    const t = setTimeout(done, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        done();
      },
      { once: true },
    );
  });
}

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
  /** The conversation's plans as the inbox lists them, the finished ones too: a change's card shows its plan to the end. */
  plans: Plan[];
  /** When the running turn started, for the wait's clock. */
  since: number;
  /** The running turn has said nothing for five seconds: its live line says the model is starting. */
  slow: boolean;
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
  /** Bumped when the page leaves a conversation or starts afresh: an answer to a POST sent before follows nothing then. */
  const generation = useRef(0);
  const [since, setSince] = useState(0);
  const [why, setWhy] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [context, setContext] = useState<ChatContext | null>(null);
  const [versions, setVersions] = useState<ChatVersions[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const queued = useRef<{ id: string; words: string; beside: Beside } | null>(null);
  // whether the assistant serves the stream as server-sent events; learned on the first try
  const streamed = useRef(true);
  // a turn that has said nothing for five seconds says the model is starting, until its first step or word (2026-10-09)
  const quiet = nothingYet(pane);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!quiet) return;
    const t = setTimeout(() => setSlow(true), STARTING_AFTER_MS);
    return () => clearTimeout(t);
  }, [quiet]);

  // the reducer's state is kept in a ref as well, so the reading loop decides on what it just applied
  const apply = useCallback((f: (s: PaneState) => PaneState) => {
    current.current = f(current.current);
    setPane(current.current);
  }, []);

  // the conversation's plans, the finished ones too; a read that fails leaves the plans the page has
  const readPlans = useCallback((id: string) => {
    const mine = generation.current;
    return assistant.inbox().then(
      (i) => {
        if (generation.current === mine) setPlans(i.plans.filter((p) => p.conversation === id));
      },
      () => undefined,
    );
  }, []);

  // where each change stands, as the assistant keeps it (2026-11-13): a card never says "waits for you" from this page's memory alone
  const readChanges = useCallback(
    (changes: Change[]) => {
      const mine = generation.current;
      for (const c of changes) {
        // a rule change is the engine's proposal, read on its own card
        if (c.change === "rule_change") continue;
        assistant.change(c.id).then(
          (seen) => {
            if (seen && generation.current === mine) apply((s) => withChange(s, c.id, seen));
          },
          () => undefined,
        );
      }
    },
    [apply],
  );

  // an approved plan is read again while a step of it waits, is queued or runs, so its card shows the step as it stands
  const going = plans.some(planGoing);
  const again = useRef(0);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!conv || !going) {
      again.current = 0;
      return;
    }
    const t = setTimeout(
      () => {
        again.current += 1;
        void readPlans(conv).then(() => setRound((n) => n + 1));
      },
      PLAN_AGAIN_MS[Math.min(again.current, PLAN_AGAIN_MS.length - 1)],
    );
    return () => clearTimeout(t);
  }, [conv, going, round, readPlans]);

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
    (id: string, from: string, lostIfSilent: PaneState | null = null) => {
      reader.current?.abort();
      const ctl = new AbortController();
      reader.current = ctl;
      let offset = from;
      let last: Position | null = null;
      // a turn the history alone would take for lost: lost only if the stream brings nothing of it for a while
      let heard = false;
      if (lostIfSilent) {
        const probe = setTimeout(() => {
          if (heard || ctl.signal.aborted) return;
          ctl.abort();
          apply(() => ({ ...lostIfSilent, offset }));
        }, PROBE_MS);
        ctl.signal.addEventListener("abort", () => clearTimeout(probe), { once: true });
      }
      // the chunks of one read: those not seen before applied, then whether the turn is over
      const take = async (chunks: Chunk[], next: string): Promise<"over" | "waiting" | "running"> => {
        const fresh = chunks.filter((c) => {
          const p = positionOf(c);
          if (!p) return true;
          if (!after(p, last)) return false;
          last = p;
          return true;
        });
        if (fresh.length > 0) heard = true;
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
        let failures = 0;
        while (!ctl.signal.aborted) {
          try {
            if (streamed.current) {
              const how = await assistant.stream(station, id, offset, ctl.signal, async (chunks, next) => (await take(chunks, next)) === "over");
              if (failures > 0) setWhy(null);
              failures = 0;
              if (how === "stopped") return;
              if (how === "unsupported") streamed.current = false;
              // a stream the network closed is opened again from where it was
              else await pauseFor(RECONNECT_MS, ctl.signal);
              continue;
            }
            const { chunks, next } = await assistant.updates(station, id, offset, ctl.signal);
            if (failures > 0) setWhy(null);
            failures = 0;
            const state = await take(chunks, next);
            if (state === "over") return;
            if (state === "waiting") await pauseFor(DELEGATION_POLL_MS, ctl.signal);
          } catch (e) {
            if ((e as Error).name === "AbortError" || ctl.signal.aborted) return;
            // a dropped connection, or an assistant that restarts: the stream is opened again from where it was, after a longer pause each time
            failures += 1;
            if (failures >= 3) {
              setWhy((e as Error).message);
              // a stream that cannot be read: the history's own guard decides whether the turn was lost (thirty minutes with nothing stored)
              const h = await assistant.history(station, id).catch(() => null);
              if (ctl.signal.aborted) return;
              if (h) {
                const s = fromHistory(h, current.current, Date.now());
                if (!s.busy) {
                  apply(() => s);
                  return;
                }
              }
            }
            await pauseFor(Math.min(RECONNECT_MS * 2 ** failures, RECONNECT_MOST_MS), ctl.signal);
          }
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
          // a turn with no settlement runs, whatever its stamps say; the history's thirty minutes only say what it is if the stream brings nothing of it
          const s = h ? fromHistory(h, empty()) : empty();
          const guard = h ? fromHistory(h, empty(), Date.now()) : null;
          apply(() => s);
          if (s.busy) {
            setSince(Date.now());
            follow(conv, s.offset, guard && !guard.busy ? guard : null);
          }
          void readPlans(conv);
          readChanges(s.changes);
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
      generation.current += 1;
      clearInterval(t);
      reader.current?.abort();
    };
  }, [conv, station, apply, follow, readPlans, readChanges]);

  const reset = useCallback(() => {
    generation.current += 1;
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
    const mine = generation.current;
    assistant
      .send(station, id, words, beside)
      // followed only while the page is still on this conversation: one left, or another opened, during the POST follows nothing
      .then(({ offset }) => generation.current === mine && follow(id, first ? "-1" : offset))
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
    const mine = generation.current;
    assistant
      .confirmPlan(p.id)
      .then((done) => {
        if (generation.current !== mine) return;
        // the plan as confirmed, in its conversation whatever the answer leaves out
        setPlans((all) => all.map((x) => (x.id === done.id ? { ...x, ...done } : x)));
        // the change whose card proposed it is settled with it, where the assistant says so
        const settled = done.change;
        const seen = asChangeSeen(settled);
        if (seen && typeof settled?.id === "string") apply((s) => withChange(s, settled.id as string, seen));
      })
      .catch((e: Error) => setWhy(e.message));
  };

  const decideChange = (c: Change, verdict: "approved" | "declined") => {
    const mine = generation.current;
    // the card says what the assistant answered, and the plan it stands for is read again: its steps are the card's from here
    const settled = () => {
      if (!conv || generation.current !== mine) return;
      again.current = 0;
      void readPlans(conv);
    };
    assistant
      .decideChange(c.id, verdict)
      .then((seen) => {
        apply((s) => withChange(s, c.id, seen, verdict));
        settled();
      })
      .catch((e: Error) => {
        // a refusal that says where the change stands is told on its card; its words are said beside unless the card's own sentence says them (approved and not applied, nothing left to approve)
        if (e instanceof ChangeRefused) {
          const { state, outcome } = e.change;
          apply((s) => withChange(s, c.id, e.change));
          if (!(outcome && (state === "failed" || state === "expired"))) setWhy(e.message);
          settled();
          return;
        }
        setWhy(e.message);
        // any other refusal: the change is read again, since it may have been decided elsewhere
        readChanges([c]);
      });
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
    const mine = generation.current;
    return chats.summarize(id).then(
      ({ offset }) => {
        if (generation.current === mine) follow(id, offset ?? current.current.offset);
      },
      (e: unknown) => {
        apply((s) => ({ ...s, busy: false }));
        throw e;
      },
    );
  };

  return { pane, plans, since, slow: quiet && slow, why, context, versions, ratings, reset, made, send, summarize, sendWhenOpen, stop, decide, confirm, decideChange, rate };
}
