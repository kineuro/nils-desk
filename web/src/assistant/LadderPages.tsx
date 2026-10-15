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
import { assistant, type Grant, type Grants, type Inbox, type Plan, type Step } from "./client";
import { type ActionRow, grantPages, grantWords, pageTitle, plainReason, standing, stepWords, waitingPlans, goingPlans } from "./ladder";

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
        {s.reason && <span className="warn">{plainReason(s.reason)}</span>}
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
      setAsked((n) => n + 1);
    })
      .catch((e: Error) => setWhy(e.message))
      .finally(() => setBusy(false));
  };

  if (!g && !why) return <Wait phase="reading the standing grants" since={since} size="panel" />;
  // record 55, ruling 24: an admin holds everything, and the assistant acts with it; nothing to give
  const admin = g?.admin === true;
  const { everything, pages, scopes } = grantPages(g, caps.person.grants);
  const any = pages.some((p) => p.rows.some((r) => r.door !== null));
  const revoke = (id: number, words: string) => act(assistant.revoke(id), `Revoked: ${words}`);

  const actionRow = (r: ActionRow) => (
    <div key={r.key} className="chat-row grant-row">
      <div className="grow plan-what">
        <span className="chat-row-title">{r.words}</span>
        {r.grant && <span className="meta">given {whenWords(r.grant.created_at)}</span>}
      </div>
      {r.grant ? (
        <button type="button" className="button secondary small" disabled={busy} aria-label={`Revoke ${r.words}`} onClick={() => r.grant && revoke(r.grant.id, r.words)}>
          Revoke
        </button>
      ) : r.covered ? (
        <span className="tag">Standing</span>
      ) : r.door ? (
        <button type="button" className="button secondary small" disabled={busy} aria-label={`Give ${r.words}`} onClick={() => r.door && act(assistant.grant({ door: r.door }), `Standing now: ${r.words}`)}>
          Give
        </button>
      ) : null}
    </div>
  );

  return (
    <section className="chat-history ladder-page">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Assistant</span>
          <h1>Standing grants</h1>
          <p className="lede">What the assistant may do for you without asking each time.</p>
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

      {all ? (
        <EveryonesGrants grants={g?.grants ?? []} busy={busy} onRevoke={revoke} />
      ) : admin ? (
        <div className="note brand">
          <Icon name="shield" />
          <p>You are an admin. The assistant may do everything you may; nothing to give.</p>
        </div>
      ) : (
        <>
          {(scopes || everything || (!any && pages.length === 0)) && (
          <section className="chat-group">
            <div className="row grant-head">
              <h2 className="chat-group-label grow">Everything</h2>
              {everything ? (
                <button type="button" className="button secondary small" disabled={busy} aria-label="Revoke everything" onClick={() => revoke(everything.id, "everything")}>
                  Revoke
                </button>
              ) : (
                any &&
                scopes && (
                  <button type="button" className="button small" disabled={busy} onClick={() => act(assistant.grant({ all: true }), "Standing now: everything")}>
                    <Icon name="plus" />
                    Give everything
                  </button>
                )
              )}
            </div>
            {!any && pages.length === 0 && <p className="meta">Nothing the assistant may do for you here is open to your account.</p>}
          </section>
          )}
          {pages.map((p) => (
            <section key={p.page} className="chat-group">
              <div className="row grant-head">
                <h2 className="chat-group-label grow">{p.title}</h2>
                {p.whole ? (
                  <button type="button" className="button secondary small" disabled={busy} aria-label={`Revoke all of ${p.title}`} onClick={() => p.whole && revoke(p.whole.id, `all of ${p.title}`)}>
                    Revoke all
                  </button>
                ) : everything || !scopes ? null : (
                  p.rows.some((r) => r.door !== null) && (
                    <button type="button" className="button quiet small" disabled={busy} aria-label={`Give all of ${p.title}`} onClick={() => act(assistant.grant({ page: p.page }), `Standing now: all of ${p.title}`)}>
                      Give all
                    </button>
                  )
                )}
              </div>
              {p.rows.length > 0 && <div className="panel chat-rows">{p.rows.map(actionRow)}</div>}
            </section>
          ))}
        </>
      )}
    </section>
  );
}

/** Everyone's standing grants, for a person who holds the assistant's settings: each in words under its page, with whose it is. */
function EveryonesGrants({ grants, busy, onRevoke }: { grants: Grant[]; busy: boolean; onRevoke: (id: number, words: string) => void }) {
  const { now } = standing(grants);
  if (now.length === 0) return <p className="meta">Nobody has given the assistant a standing grant.</p>;
  return (
    <div className="panel chat-rows">
      {now.map((x) => {
        const words = grantWords(x);
        return (
          <div key={x.id} className="chat-row grant-row">
            <div className="grow plan-what">
              <span className="chat-row-title">{words}</span>
              <span className="meta">{[x.page ? pageTitle(x.page) : null, x.subject, `given ${whenWords(x.created_at)}`].filter(Boolean).join(" · ")}</span>
            </div>
            <button type="button" className="button secondary small" disabled={busy} aria-label={`Revoke ${words} for ${x.subject}`} onClick={() => onRevoke(x.id, words)}>
              Revoke
            </button>
          </div>
        );
      })}
    </div>
  );
}
