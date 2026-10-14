// SPDX-License-Identifier: AGPL-3.0-only
// Plans waiting and Standing grants, the Assistant's two pages beside its
// conversations (spec 13.1 round 5, 14). Plans waiting is the inbox: a plan
// the assistant restated waits for one confirm; a step it holds says why; a
// proposal it made is decided in its conversation. Standing grants are the
// rung-two doors the assistant may take for the person without asking each
// time, each revocable, and a new one given from the doors the ladder offers.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { may } from "../grants";
import { jobLogHref, logsOffered } from "../ops/logs";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { assistant, type Grants, type Inbox, type Plan, type Step } from "./client";
import { goingPlans, grantable, standing, stepWords, waitingPlans } from "./ladder";

const iso = (v: string | number | null | undefined) => (v === null || v === undefined ? null : typeof v === "number" ? new Date(v).toISOString() : v);

export function PlansPage({ caps }: { caps: Capabilities }) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(0);
  const [since] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    assistant.inbox().then(
      (i) => alive && setInbox(i),
      (e: Error) => alive && setWhy(e.message),
    );
    return () => {
      alive = false;
    };
  }, [asked]);

  const confirm = (p: Plan) => {
    setBusy(true);
    setWhy(null);
    assistant
      .confirmPlan(p.id)
      .then(() => {
        setSaid(`Confirmed: ${p.instruction}`);
        setAsked((n) => n + 1);
      })
      .catch((e: Error) => setWhy(e.message))
      .finally(() => setBusy(false));
  };

  if (!inbox && !why) return <Wait phase="reading what waits on you" since={since} size="panel" />;
  const waiting = waitingPlans(inbox);
  const going = goingPlans(inbox);
  const held = inbox?.waiting ?? [];
  const proposals = inbox?.proposals ?? [];
  const failed = inbox?.jobs.failed ?? [];
  const logsHere = logsOffered(caps);

  return (
    <section className="chat-history ladder-page">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Assistant</span>
          <h1>Plans waiting</h1>
          <p className="lede">What the assistant planned for you and waits on you for.</p>
        </div>
      </div>
      {why && <p className="warn">{why}</p>}
      {said && <p className="ok-words">{said}</p>}

      <section className="chat-group">
        <h2 className="chat-group-label">To confirm · {waiting.length}</h2>
        {waiting.length === 0 ? (
          <p className="meta">Nothing to confirm. A plan the assistant restates in a conversation waits here until you confirm it.</p>
        ) : (
          <div className="panel chat-rows">
            {waiting.map((p) => (
              <div key={p.id} className="chat-row plan-row">
                <div className="grow plan-what">
                  <span className="chat-row-title">{p.instruction}</span>
                  <Steps steps={p.steps} />
                  <span className="meta">{[whenWords(iso(p.created_at)), p.conversation ? null : "from no conversation"].filter(Boolean).join(" · ")}</span>
                </div>
                <div className="row plan-acts">
                  {p.conversation && (
                    <a className="button secondary small" href={href("assistant", p.conversation)}>
                      Its conversation
                    </a>
                  )}
                  <button type="button" className="button small" disabled={busy} onClick={() => confirm(p)}>
                    Confirm
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="chat-group">
        <h2 className="chat-group-label">Held with a reason · {held.length}</h2>
        {held.length === 0 ? (
          <p className="meta">No step is held. A step the assistant may not take yet, for want of a standing grant or a part that is down, says why here.</p>
        ) : (
          <div className="panel chat-rows">
            {held.map((s) => (
              <StepRow key={`${(s as { plan?: string }).plan ?? ""}-${s.n}`} step={s} logs={logsHere} />
            ))}
          </div>
        )}
      </section>

      <section className="chat-group">
        <h2 className="chat-group-label">To decide · {proposals.length}</h2>
        {proposals.length === 0 ? (
          <p className="meta">No proposal waits. A change the assistant may only propose is decided in its conversation, and waits here until you do.</p>
        ) : (
          <div className="panel chat-rows">
            {proposals.map((s) => (
              <StepRow key={`${(s as { plan?: string }).plan ?? ""}-${s.n}`} step={s} logs={logsHere} plans={inbox?.plans ?? []} />
            ))}
          </div>
        )}
      </section>

      {(going.length > 0 || failed.length > 0) && (
        <section className="chat-group">
          <h2 className="chat-group-label">Going · {going.length}</h2>
          <div className="panel chat-rows">
            {going.map((p) => (
              <div key={p.id} className="chat-row plan-row">
                <div className="grow plan-what">
                  <span className="chat-row-title">{p.instruction}</span>
                  <Steps steps={p.steps} logs={logsHere} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function Steps({ steps, logs = false }: { steps: Step[]; logs?: boolean }) {
  if (steps.length === 0) return null;
  return (
    <ol className="plan-steps">
      {steps.map((s) => (
        <li key={s.n} className={`plan-step ${s.state}`}>
          {stepWords(s)}
          {logs && typeof s.job === "number" && (
            <>
              {" "}
              <a href={jobLogHref(s.job)}>job {s.job}</a>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

function StepRow({ step: s, logs, plans = [] }: { step: Step; logs: boolean; plans?: Plan[] }) {
  const plan = (s as { plan?: string }).plan;
  const conversation = plans.find((p) => p.id === plan)?.conversation ?? null;
  return (
    <div className="chat-row plan-row">
      <div className="grow plan-what">
        <span className="chat-row-title">{s.words}</span>
        {s.reason && <span className="warn">{s.reason}</span>}
        <span className="meta path">{s.door}</span>
      </div>
      <div className="row plan-acts">
        {logs && typeof s.job === "number" && (
          <a className="button secondary small" href={jobLogHref(s.job)}>
            Its log
          </a>
        )}
        {conversation && (
          <a className="button small" href={href("assistant", conversation)}>
            Decide in its conversation
          </a>
        )}
      </div>
    </div>
  );
}

export function GrantsPage({ caps }: { caps: Capabilities }) {
  const everyone = may(caps, "assistant-settings:work");
  const [all, setAll] = useState(false);
  const [g, setG] = useState<Grants | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [door, setDoor] = useState("");
  const [asked, setAsked] = useState(0);
  const [since] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    assistant.grants(all).then(
      (r) => alive && setG(r),
      (e: Error) => alive && setWhy(e.message),
    );
    return () => {
      alive = false;
    };
  }, [all, asked]);

  const act = (p: Promise<unknown>, words: string) => {
    setBusy(true);
    setWhy(null);
    p.then(() => {
      setSaid(words);
      setDoor("");
      setAsked((n) => n + 1);
    })
      .catch((e: Error) => setWhy(e.message))
      .finally(() => setBusy(false));
  };

  if (!g && !why) return <Wait phase="reading the standing grants" since={since} size="panel" />;
  const { now, revoked } = standing(g?.grants ?? []);
  const offer = grantable(g);
  const chosen = offer.some((o) => o.door === door) ? door : (offer[0]?.door ?? "");

  return (
    <section className="chat-history ladder-page">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Assistant</span>
          <h1>Standing grants</h1>
          <p className="lede">The doors the assistant may take for you without asking each time. Revoke one and it asks again.</p>
        </div>
        {everyone && (
          <div className="chips" role="group" aria-label="whose grants">
            <button type="button" className={all ? "opt" : "opt on"} aria-pressed={!all} onClick={() => setAll(false)}>
              Yours
            </button>
            <button type="button" className={all ? "opt on" : "opt"} aria-pressed={all} onClick={() => setAll(true)}>
              Everyone's
            </button>
          </div>
        )}
      </div>
      {why && <p className="warn">{why}</p>}
      {said && <p className="ok-words">{said}</p>}

      <section className="chat-group">
        <h2 className="chat-group-label">Standing · {now.length}</h2>
        {now.length === 0 ? (
          <p className="meta">None. The assistant asks before each step it takes for you.</p>
        ) : (
          <div className="panel chat-rows">
            {now.map((x) => (
              <div key={x.id} className="chat-row grant-row">
                <div className="grow plan-what">
                  <span className="chat-row-title path">{x.door}</span>
                  <span className="meta">{[all ? x.subject : null, `given ${whenWords(x.created_at)}`].filter(Boolean).join(" · ")}</span>
                </div>
                <button type="button" className="button secondary small" disabled={busy} aria-label={`Revoke ${x.door}`} onClick={() => act(assistant.revoke(x.id), `Revoked: ${x.door}`)}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {!all && (
        <section className="chat-group">
          <h2 className="chat-group-label">Give one</h2>
          {offer.length === 0 ? (
            <p className="meta">Every door the assistant may take for you stands already, or none is open to your grants.</p>
          ) : (
            <form
              className="row wrap grant-add"
              onSubmit={(e) => {
                e.preventDefault();
                if (chosen) act(assistant.grant(chosen), `Standing now: ${chosen}`);
              }}
            >
              <span className="input grow">
                <select value={chosen} aria-label="The door" onChange={(e) => setDoor(e.target.value)}>
                  {offer.map((o) => (
                    <option key={o.door} value={o.door}>
                      {o.door} · {o.role}
                    </option>
                  ))}
                </select>
              </span>
              <button type="submit" className="button small" disabled={busy || !chosen}>
                <Icon name="plus" />
                Give it
              </button>
            </form>
          )}
        </section>
      )}

      {revoked.length > 0 && (
        <section className="chat-group">
          <h2 className="chat-group-label">Revoked · {revoked.length}</h2>
          <div className="panel chat-rows">
            {revoked.map((x) => (
              <div key={x.id} className="chat-row grant-row revoked">
                <div className="grow plan-what">
                  <span className="chat-row-title path">{x.door}</span>
                  <span className="meta">{[all ? x.subject : null, `revoked ${whenWords(x.revoked_at ?? null)}`].filter(Boolean).join(" · ")}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
