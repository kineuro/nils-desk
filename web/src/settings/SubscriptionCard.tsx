// SPDX-License-Identifier: AGPL-3.0-only
// The ChatGPT subscription (records 23 and 25): its card among the Kvasir
// page's models, a person's own or, on a desk that signs nobody in, the
// install's; and Add a model's choice that signs it in. Signing in shows a
// code to enter at a link while the card or the dialog follows the sign-in;
// signed in, the card says the model it answers with and the stations it
// answers, offers another model and signing out.

import { useEffect, useId, useRef, useState } from "react";
import type React from "react";
import { useCopy } from "../ui/clipboard";
import { Icon } from "../ui/Icon";
import { Answers, MoreMenu, StateTag, Where } from "./cards";
import { Acted, useActing } from "./common";
import { countedStations, MARKS, plainly, subscribedModel } from "./gateway";
import { kvasir, type Subscription } from "./kvasir";
import {
  cardFacts,
  cardTitle,
  expired,
  howWords,
  leadWords,
  leftWords,
  linkText,
  modelWords,
  POLL_MS,
  polling,
  SIGNED_OUT,
  signedInWords,
  stateTag,
  stationsNote,
} from "./subscription";

/** A subscription followed: its minutes counted down and Kvasir asked again while a sign-in waits, and each change told to the page. */
export function useSubscription(row: Subscription, opts: { follow?: boolean; onChange?: (s: Subscription) => void } = {}) {
  const { follow = true, onChange } = opts;
  const [sub, setSub] = useState(row);
  const [now, setNow] = useState(() => Date.now());
  const acting = useActing();
  const told = useRef(onChange);
  useEffect(() => {
    told.current = onChange;
  });

  // the page read the row again
  useEffect(() => setSub(row), [row]);
  // and hears of a change made here, so the card and the dialog say the same
  useEffect(() => {
    if (sub !== row) told.current?.(sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- told only of what changed here
  }, [sub]);

  // the minutes left count down while a sign-in waits
  const waiting = sub.state === "waiting";
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [waiting]);

  // and Kvasir is asked every few seconds until the sign-in is done or failed
  const asking = follow && polling(sub, now);
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
      try {
        const started = await kvasir.signIn(sub.provider);
        setSub((s) => ({ ...s, state: "waiting", user_code: started.user_code, verification_uri: started.verification_uri, expires_at: started.expires_at, error: null }));
        setNow(Date.now());
        return "";
      } catch (e) {
        throw plainly(e);
      }
    });

  const choose = (model: string) =>
    acting.act(`choosing ${model}`, async () => {
      try {
        const next = await kvasir.chooseModel(sub.provider, model);
        setSub((s) => (typeof next.state === "string" ? next : { ...s, model }));
      } catch (e) {
        throw plainly(e);
      }
      return `${sub.name} answers with ${model} now.`;
    });

  const signOut = () =>
    acting.act(`signing out of ${sub.name}`, async () => {
      try {
        await kvasir.signOut(sub.provider);
      } catch (e) {
        throw plainly(e);
      }
      setSub((s) => ({ ...s, state: "signed_out", user_code: null, verification_uri: null, expires_at: null, since: null, model: null, models: [], error: null }));
      return sub.for === "system" ? `The install is signed out of ${sub.name}.` : `You are signed out of ${sub.name}.`;
    });

  return { sub, now, acting: acting.acting, working: acting.working, signIn, choose, signOut };
}

/** The code to enter with its copy button, the link that opens apart, and the minutes left. */
export function SignInCode({ sub, now }: { sub: Subscription; now: number }) {
  const [copied, copy] = useCopy();
  if (!sub.user_code) return null;
  const left = leftWords(sub.expires_at, now);
  return (
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
      {left && <span className={expired(sub.expires_at, now) ? "warn" : "meta"}>{left}</span>}
    </div>
  );
}

/**
 * The subscription's card. `may` says whether this person acts on it,
 * `stations` names those that go to ChatGPT, and `follow` is false while
 * another part of the page follows the sign-in. Not signed in, it is its
 * title, its tag and Sign in; signed in, its model with what is known of it as
 * a hover title, its tag and the stations it answers.
 */
export function SubscriptionCard(props: { row: Subscription; may?: boolean; stations?: string[] | null; follow?: boolean; onChange?: (s: Subscription) => void }) {
  const { row, may = true, stations = null, follow = true, onChange } = props;
  const id = useId();
  const { sub, now, acting, working, signIn, choose, signOut } = useSubscription(row, { follow, onChange });
  const [choosing, setChoosing] = useState(false);
  const tag = stateTag(sub, now);
  const waiting = sub.state === "waiting";
  const signed = sub.state === "signed_in";
  const quiet = acting.kind === "done" && acting.words === "";
  const picking = signed && sub.models.length > 0 && (sub.model === null || choosing);

  const button = !may ? null : sub.state === "signed_out" ? (
    <button type="button" className="button small" disabled={working} onClick={signIn}>
      Sign in
    </button>
  ) : sub.state === "failed" || (waiting && expired(sub.expires_at, now)) ? (
    <button type="button" className="button small" disabled={working} onClick={signIn}>
      Try again
    </button>
  ) : signed ? (
    <button type="button" className="button secondary small" disabled={working} onClick={signOut}>
      Sign out
    </button>
  ) : null;
  const more =
    may && signed && sub.model !== null && sub.models.length > 1 && !choosing ? (
      <MoreMenu label={`More for ${cardTitle(sub)}`}>
        <button type="button" disabled={working} onClick={() => setChoosing(true)}>
          Choose another model
        </button>
      </MoreMenu>
    ) : null;

  return (
    <div className={waiting && may ? "mcard mine wide" : "mcard mine"}>
      <b className="card-name">{cardTitle(sub)}</b>
      {signed && <Where mark={MARKS.subscription} words={subscribedModel(sub) ?? "no model chosen yet"} title={cardFacts(sub)} />}
      <div className="row">
        <StateTag tag={{ tone: tag.tone, words: tag.words, dot: true, title: sub.state === "failed" ? leadWords(sub) : null }} />
        {signed && stations && <Answers answers={countedStations(stations)} />}
      </div>
      {waiting && may && <SignInCode sub={sub} now={now} />}
      {picking && (
        <div className="field">
          <label className="label" htmlFor={`${id}-model`}>
            The model it answers with
          </label>
          <div className="input">
            <select
              id={`${id}-model`}
              value={sub.model ?? ""}
              disabled={!may || working}
              onChange={(e) => {
                setChoosing(false);
                choose(e.target.value);
              }}
            >
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
      {(button || more) && (
        <div className="row acts">
          {button}
          {more}
        </div>
      )}
      {!may && !signed && <p className="meta">Needs the assistant and Kvasir: See.</p>}
      {!quiet && <Acted acting={acting} />}
    </div>
  );
}

/**
 * Add a model's subscription choice: how signing in goes and what the
 * subscription carries, then the code while the dialog follows the sign-in,
 * and the words once it is done. `follow` is true while the choice is shown.
 */
export function useSignInPart(props: { row: Subscription | null; stations: string[]; follow: boolean; onChange?: (s: Subscription) => void; onClose: () => void }): {
  body: React.ReactNode;
  foot: React.ReactNode;
  busy: boolean;
} {
  const { row, stations, follow, onChange, onClose } = props;
  const { sub, now, acting, working, signIn } = useSubscription(row ?? SIGNED_OUT, { follow, onChange });
  const waiting = sub.state === "waiting";
  const gone = expired(sub.expires_at, now);
  const quiet = acting.kind === "done" && acting.words === "";

  const body =
    sub.state === "signed_in" ? (
      <p className="ok-words">{signedInWords(sub)}</p>
    ) : waiting ? (
      <>
        <p>{leadWords(sub, "dialog")}</p>
        <SignInCode sub={sub} now={now} />
      </>
    ) : (
      <>
        {sub.state === "failed" && <p className="warn">{leadWords(sub)}</p>}
        <div className="field">
          <span className="label">{sub.for === "system" ? "How the install signs in" : "How you sign in"}</span>
          <p className="meta">{howWords(sub)}</p>
        </div>
        <div className="note gated">
          <Icon name="lock" />
          <div className="note-body">
            <p className="note-detail">{stationsNote(sub, stations)}</p>
          </div>
        </div>
      </>
    );

  const foot = (
    <>
      {!quiet && <Acted acting={acting} />}
      <div className="row actions">
        {sub.state === "signed_in" ? (
          <button type="button" className="button" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            {(!waiting || gone) && (
              <button type="button" className="button" disabled={working} onClick={signIn}>
                {sub.state === "failed" || gone ? "Try again" : `Sign in to ${sub.name}`}
              </button>
            )}
            <button type="button" className="button secondary" onClick={onClose}>
              {waiting ? "Close" : "Cancel"}
            </button>
          </>
        )}
      </div>
    </>
  );

  return { body, foot, busy: working };
}
