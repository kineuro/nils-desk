// SPDX-License-Identifier: AGPL-3.0-only
// One conversation with a station, as a page holds it: its history read when
// it opens, the stream followed from an offset while a turn runs, a prompt sent
// with what the page contributes, a turn stopped, a proposal decided and a plan
// confirmed. The Assistant page holds one, and so does a Query card's
// discussion.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PageContext } from "../ui/context";
import { type ChatContext, chats, chatsKept } from "./chats";
import { assistant, StaleProposal, type Delegation, type Plan } from "./client";
import { empty, fromHistory, reduce, type PaneState, type Proposal, withStored } from "./parts";

const TOKEN_PUSH_MS = 5 * 60_000;
const DELEGATION_POLL_MS = 4_000;

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
  /** Start again from nothing, as when another conversation opens. */
  reset: () => void;
  /** A conversation just made on this page: it has no history to read yet. */
  made: (id: string) => void;
  send: (id: string, words: string, beside?: Beside) => void;
  stop: () => void;
  /** A proposal's verdict, with the document the person is on; true once the assistant recorded it. */
  decide: (p: Proposal, verdict: "accepted" | "rejected", current?: number) => Promise<boolean>;
  confirm: (p: Plan) => void;
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

  const follow = useCallback(
    (id: string, from: string) => {
      reader.current?.abort();
      const ctl = new AbortController();
      reader.current = ctl;
      let offset = from;
      const loop = async () => {
        while (!ctl.signal.aborted) {
          const { chunks, next } = await assistant.updates(station, id, offset, ctl.signal);
          apply((s) => {
            let out = s;
            for (const c of chunks) out = reduce(out, c);
            return { ...out, offset: next };
          });
          offset = next;
          const s = current.current;
          if (chunks.length > 0 && s.settled !== null && !s.busy) {
            // the concierge settles at once and is woken when its delegate settles (4c section 9.12)
            let pending = false;
            if (station === "concierge") {
              const tasks = await assistant.delegations(id).catch(() => [] as Delegation[]);
              pending = tasks.some((t) => t.state === "queued" || t.state === "running");
            }
            if (!pending) {
              readPlans(id);
              // the list orders by the last use, so a settled turn moves this conversation up
              chatsKept.refresh().catch(() => undefined);
              // and the turn filled the context a little more
              chats.get(id).then(
                (c) => setContext(c.context ?? null),
                () => undefined,
              );
              return;
            }
            apply((x) => ({ ...x, busy: true }));
            await new Promise((r) => setTimeout(r, DELEGATION_POLL_MS));
          }
        }
      };
      loop().catch((e: Error) => {
        if (e.name !== "AbortError") setWhy(e.message);
      });
    },
    [station, apply, readPlans],
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
          // the decisions the assistant keeps: a reload shows what was accepted or disregarded
          chats.get(conv).then(
            (c) => {
              if (!alive) return;
              apply((x) => withStored(x, c.proposals));
              setContext(c.context ?? null);
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
    apply(() => empty());
    setPlans([]);
    setWhy(null);
    setContext(null);
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

  return { pane, plans, since, why, context, reset, made, send, stop, decide, confirm };
}
