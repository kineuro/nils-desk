// SPDX-License-Identifier: AGPL-3.0-only
// The ChatGPT subscription's card (record 23): on the Kvasir page for the
// install, on a desk that signs nobody in, and on a person's profile for
// their own. Signing in shows a code to enter at a link while the card
// follows the sign-in; signed in, it offers the subscription's models and
// signing out. Under it stands what the subscription may carry.

import { useEffect, useId, useState } from "react";
import { useCopy } from "../ui/clipboard";
import { Icon } from "../ui/Icon";
import { Acted, Health, useActing } from "./common";
import { kvasir, type Subscription } from "./kvasir";
import { cardTitle, expired, leadWords, leftWords, linkText, modelWords, POLL_MS, polling, servesWords, stateTag } from "./subscription";

/** `may` says whether this person acts on it: a person's own always, the install's for an admin. */
export function SubscriptionCard({ row, may = true }: { row: Subscription; may?: boolean }) {
  const id = useId();
  const [sub, setSub] = useState(row);
  const [now, setNow] = useState(() => Date.now());
  const acting = useActing();
  const [copied, copy] = useCopy();

  // the page read the row again
  useEffect(() => setSub(row), [row]);

  // the minutes left count down while a sign-in waits
  const waiting = sub.state === "waiting";
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [waiting]);

  // and Kvasir is asked every few seconds until the sign-in is done or failed
  const asking = polling(sub, now);
  useEffect(() => {
    if (!asking) return;
    let alive = true;
    const t = setInterval(() => {
      kvasir
        .subscriptions()
        .then((s) => {
          const fresh = s?.subscriptions.find((x) => x.provider === sub.provider);
          if (alive && fresh) setSub(fresh);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [asking, sub.provider]);

  const signIn = () =>
    acting.act(`asking ${sub.name} for a code`, async () => {
      const started = await kvasir.signIn(sub.provider);
      setSub((s) => ({ ...s, state: "waiting", user_code: started.user_code, verification_uri: started.verification_uri, expires_at: started.expires_at, error: null }));
      setNow(Date.now());
      return "";
    });

  const choose = (model: string) =>
    acting.act(`choosing ${model}`, async () => {
      const next = await kvasir.chooseModel(sub.provider, model);
      setSub((s) => (typeof next.state === "string" ? next : { ...s, model }));
      return `${sub.name} answers with ${model} now.`;
    });

  const signOut = () =>
    acting.act(`signing out of ${sub.name}`, async () => {
      await kvasir.signOut(sub.provider);
      setSub((s) => ({ ...s, state: "signed_out", user_code: null, verification_uri: null, expires_at: null, since: null, model: null, models: [], error: null }));
      return sub.for === "system" ? `The install is signed out of ${sub.name}.` : `You are signed out of ${sub.name}.`;
    });

  const tag = stateTag(sub, now);
  const left = leftWords(sub.expires_at, now);
  const gone = expired(sub.expires_at, now);
  const quiet = acting.acting.kind === "done" && acting.acting.words === "";
  const button = !may ? null : sub.state === "signed_out" ? (
    <button type="button" className="button small" disabled={acting.working} onClick={signIn}>
      {`Sign in with ${sub.name}`}
    </button>
  ) : sub.state === "failed" || (waiting && gone) ? (
    <button type="button" className="button small" disabled={acting.working} onClick={signIn}>
      Try again
    </button>
  ) : sub.state === "signed_in" ? (
    <button type="button" className="button secondary small" disabled={acting.working} onClick={signOut}>
      Sign out
    </button>
  ) : null;

  return (
    <div className="subscription">
      <div className="panel card">
        <div className="row card-head">
          <Icon name="cloud" size="lg" />
          <h2>{cardTitle(sub)}</h2>
          <Health tone={tag.tone} words={tag.words} />
        </div>
        <p>{leadWords(sub)}</p>
        {waiting && may && sub.user_code && (
          <div className="sign-in-code">
            <span className="meta">Your code</span>
            <span className="row code-row">
              <span className="code">{sub.user_code}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={copied === "copied" ? "Copied" : copied === "failed" ? "Could not copy" : "Copy the code"}
                onClick={() => copy(sub.user_code ?? "")}
              >
                <Icon name={copied === "copied" ? "check" : copied === "failed" ? "alert" : "copy"} />
              </button>
            </span>
            {sub.verification_uri && (
              <a className="sub-link" href={sub.verification_uri} target="_blank" rel="noopener noreferrer">
                <span>{`Enter it at ${linkText(sub.verification_uri)}`}</span>
                <Icon name="external" />
              </a>
            )}
            {left && <span className={gone ? "warn" : "meta"}>{left}</span>}
          </div>
        )}
        {sub.state === "signed_in" && sub.models.length > 0 && (
          <div className="field">
            <label className="label" htmlFor={`${id}-model`}>
              The model it answers with
            </label>
            <div className="input">
              <select id={`${id}-model`} value={sub.model ?? ""} disabled={!may || acting.working} onChange={(e) => choose(e.target.value)}>
                {sub.model === null && (
                  <option value="" disabled>
                    choose a model
                  </option>
                )}
                {sub.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {modelWords(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {button && <div className="row actions">{button}</div>}
        {!may && sub.state !== "signed_in" && <p className="meta">An admin signs the install in.</p>}
        {!quiet && <Acted acting={acting.acting} />}
      </div>
      <div className="note gated">
        <Icon name="lock" />
        <div className="note-body">
          <p className="note-detail">{servesWords(sub)}</p>
        </div>
      </div>
    </div>
  );
}
