// SPDX-License-Identifier: AGPL-3.0-only
// The rail (Wave 5 section 6.4): the right-hand part of every page is the
// assistant's conversation, present when the assistant is and the person
// holds assist, and absent otherwise without a gap. On Home it plans: the
// operator station turns what a person asks for into a plan of jobs that runs
// only once they confirm it (section 9.3). It shows the plan as the assistant
// stored it and adds nothing of its own.

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type { Capabilities } from "./capabilities";
import { assistant, newConversation, type Delegation, type Plan } from "./assistant/client";
import { empty, fromHistory, reduce, type PaneState } from "./assistant/parts";
import { railModel, railStation } from "./sections";
import { admit, type PageContext } from "./ui/context";
import { Icon } from "./ui/Icon";
import { Wait } from "./ui/Wait";

const TOKEN_PUSH_MS = 5 * 60_000;
const DELEGATION_POLL_MS = 4_000;
const KEY = "nils-desk.rail";

function kept(station: string): string | null {
  try {
    return localStorage.getItem(`${KEY}.${station}`);
  } catch {
    return null;
  }
}

function keep(station: string, id: string): void {
  try {
    localStorage.setItem(`${KEY}.${station}`, id);
  } catch {
    // a private window keeps nothing
  }
}

/** What the rail says before anything is asked, by station. */
function hint(station: string): string {
  return station === "operator"
    ? "Say what should come in, and when. The assistant plans it, and nothing runs until you confirm."
    : "Ask about what the registry holds, or say what you want to find.";
}

/** The sentence for a turn that ended some other way than answering. */
function ending(settled: PaneState["settled"]): string | null {
  if (!settled || settled.outcome === "completed") return null;
  if (settled.outcome === "aborted") return "Stopped.";
  return settled.error ?? "The assistant did not finish this turn.";
}

export function Rail({ caps, section }: { caps: Capabilities; section: string }) {
  const station = railStation(caps, section);
  const [conv, setConv] = useState<string | null>(() => kept(station));
  const [pane, setPane] = useState<PaneState>(empty);
  const current = useRef<PaneState>(empty());
  const [since, setSince] = useState(0);
  const [text, setText] = useState("");
  const [why, setWhy] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const reader = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const warming = (caps.kvasir?.["health"] as { warming?: boolean } | undefined)?.warming === true;
  const model = railModel(caps);
  const context: PageContext = admit({ page: { kind: section, id: null }, epoch: caps.engine?.registry.epoch });

  // a page may hand the rail a sentence to start from; the person sends it
  useEffect(() => {
    const say = (e: Event) => {
      const words = (e as CustomEvent<unknown>).detail;
      if (typeof words === "string") {
        setText(words);
        input.current?.focus();
      }
    };
    window.addEventListener("nils:rail-say", say);
    return () => window.removeEventListener("nils:rail-say", say);
  }, []);

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
      })
      .catch((e: Error) => alive && setWhy(e.message));
    const t = setInterval(() => assistant.token(conv).catch(() => undefined), TOKEN_PUSH_MS);
    return () => {
      alive = false;
      clearInterval(t);
      reader.current?.abort();
    };
  }, [conv, station, apply, follow, readPlans]);

  const send = (words: string) => {
    let id = conv;
    if (!id) {
      id = newConversation(null, null).id;
      keep(station, id);
      setConv(id);
    }
    const fresh = current.current.offset === "-1";
    setWhy(null);
    setText("");
    setSince(Date.now());
    apply((s) => ({ ...s, busy: true, settled: null }));
    const opened = id;
    assistant
      .send(station, opened, words, { context })
      .then(({ offset }) => follow(opened, fresh ? "-1" : offset))
      .catch((e: Error) => {
        setWhy(e.message);
        apply((s) => ({ ...s, busy: false }));
      });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length === 0 || pane.busy || warming) return;
    send(text.trim());
  };

  const confirm = (p: Plan) => {
    assistant
      .confirmPlan(p.id)
      .then((done) => setPlans((all) => all.map((x) => (x.id === done.id ? done : x))))
      .catch((e: Error) => setWhy(e.message));
  };

  const said = ending(pane.settled);
  return (
    <aside className="rail" aria-label="assistant">
      <div className="head">
        <Icon name="assistant" />
        <span className="rail-title">Assistant</span>
        <span className="grow" />
        {model && <span className="tag">{model}</span>}
      </div>
      <div className="talk" aria-live="polite">
        {pane.turns.length === 0 && <p className="meta">{hint(station)}</p>}
        {pane.turns.map((t) =>
          t.role === "user" ? (
            <div key={t.id} className="msg you">
              <span className="who">You</span>
              <p className="text">{t.text}</p>
            </div>
          ) : (
            <div key={t.id} className="msg">
              <span className="who">Assistant</span>
              {t.text && <p>{t.text}</p>}
            </div>
          ),
        )}
        {pane.busy && <Wait phase={pane.status?.text ?? "thinking"} since={since || Date.now()} />}
        {plans.map((p) => (
          <PlanCard key={p.id} plan={p} onConfirm={() => confirm(p)} onChange={() => input.current?.focus()} />
        ))}
        {said && <p className={pane.settled?.outcome === "aborted" ? "meta" : "warn"}>{said}</p>}
        {why && <p className="warn">{why}</p>}
      </div>
      <form className="composer" onSubmit={submit}>
        <div className="input composer-input">
          <textarea
            ref={input}
            value={text}
            rows={2}
            placeholder={warming ? "The model is warming" : "Ask, or tell NILS what to do"}
            aria-label="Ask the assistant"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) submit(e);
            }}
          />
          <button type="submit" className="icon-button" aria-label="Send" disabled={pane.busy || warming || text.trim().length === 0}>
            <Icon name="arrow" />
          </button>
        </div>
        <p className="meta">
          {station === "operator" ? "It plans jobs for you to confirm; nothing runs before that." : "It reads what you may read, and proposes; you decide."}
        </p>
      </form>
    </aside>
  );
}

function PlanCard({ plan, onConfirm, onChange }: { plan: Plan; onConfirm: () => void; onChange: () => void }) {
  const open = !plan.confirmed_at;
  return (
    <div className="plan">
      <div className="plan-head">
        <span className="plan-title">
          A plan in {plan.steps.length} {plan.steps.length === 1 ? "step" : "steps"}
        </span>
        <span className="grow" />
        <span className="meta">{open ? "nothing runs until you confirm" : plan.state}</span>
      </div>
      {plan.steps.map((s) => (
        <div key={s.n} className="line">
          <Icon name={s.rung === 3 ? "branch" : "play"} />
          <div>
            <p>{s.words}</p>
            <p className="meta">
              {s.state}
              {s.reason ? `: ${s.reason}` : ""}
            </p>
          </div>
        </div>
      ))}
      {open && (
        <div className="plan-foot">
          <button type="button" className="button small" onClick={onConfirm}>
            Confirm the plan
          </button>
          <button type="button" className="button secondary small" onClick={onChange}>
            Change it
          </button>
        </div>
      )}
    </div>
  );
}
