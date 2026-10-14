// SPDX-License-Identifier: AGPL-3.0-only
// A person's own page (records 23 and 25), kept terse: how they sign in, with
// the subject the desk knows them by on hover, their groups, and what they may
// open in the Identity page's few words, the pages hidden from them together
// and how much of a record they see as one tag. A line points to the
// Language models page for a ChatGPT subscription of their own, or the
// install's when nobody signs in. Where the desk keeps the people, a person
// changes their own password here (record 55 H2, round 5).

import { useId, useState } from "react";
import type { Capabilities } from "../capabilities";
import { may, type Detail } from "../grants";
import { href } from "../routes";
import { PAGE_ICONS } from "../settings/AccessForm";
import { Acted, Head, useActing } from "../settings/common";
import { RecordsTag } from "../settings/GroupCards";
import { PAGE_LINES, SIGN_IN, andWords, identity, levelOf, passwordRefusal, personRefusal, yourWords, type PageLine } from "../settings/identity";
import { settingsPages } from "../settings/pages";
import { Icon } from "../ui/Icon";

export function ProfilePage({ caps }: { caps: Capabilities }) {
  const { person, desk } = caps;
  const who = person.display_name || person.subject;
  const off = desk.mode === "off";
  const kvasirPage = settingsPages(caps).some((p) => p.id === "language-models");
  // a subscription of one's own serves the assistant, so it is a person's who may use it and see Kvasir (record 25)
  const subscription = caps.kvasir === null ? null : off ? "install" : may(caps, "assistant:use") && may(caps, "kvasir:see") ? "own" : null;

  return (
    <div className="settings">
      <Head title={who} lede={off ? "Nobody signs in, so every page is open." : "How you sign in and what you may open."} />
      <div className="signin-row">
        <span className="signin-item" title={person.subject}>
          <Icon name="users" />
          {SIGN_IN[desk.mode]}
          <span className="sr-only">, as {person.subject}</span>
        </span>
        {!off && (
          <span className="amarks">
            {person.groups.length === 0 ? (
              <span className="meta">No groups</span>
            ) : (
              person.groups.map((g) => (
                <span key={g} className="tag">
                  {g}
                </span>
              ))
            )}
          </span>
        )}
      </div>
      <section className="stack roomy">
        <div className="section-head rule-top">
          <h2>Access</h2>
        </div>
        <YourAccess grants={person.grants} detail={person.detail} />
      </section>
      {desk.mode === "local" && desk.signed_in && <YourPassword username={person.subject} />}
      {subscription && (
        <p className="signin-item subscription-line">
          <Icon name="cloud" />
          {subscription === "own" ? "Your ChatGPT subscription:" : "The install's ChatGPT subscription:"} {kvasirPage ? <a href={href("settings", "language-models")}>Language models page</a> : "Language models page"}
        </p>
      )}
    </div>
  );
}

/** The Identity page's lines, read: each page a person holds and how far, the pages hidden from them together, and how much of a record they see. */
export function YourAccess({ grants, detail }: { grants: readonly string[]; detail: Detail }) {
  const shown = (settings: boolean) => PAGE_LINES.filter((l) => l.settings === settings && levelOf(grants, l) !== "hidden");
  const pages = shown(false);
  const settings = shown(true);
  const hidden = [...PAGE_LINES.filter((l) => !l.settings && !l.soon && levelOf(grants, l) === "hidden").map((l) => l.title), ...(settings.length === 0 ? ["Settings"] : [])];

  const row = (line: PageLine) => {
    const level = levelOf(grants, line);
    const icon = PAGE_ICONS[line.id];
    return (
      <div key={line.id} className={line.settings ? "arow deep" : "arow"}>
        {icon && <Icon name={icon} />}
        <b>{line.title}</b>
        <span className="state">
          <span className={level === "see" ? "amark" : "amark do"}>{level}</span>
        </span>
        <span className="what">{yourWords(line, level)}</span>
      </div>
    );
  };

  return (
    <div className="alist">
      {pages.map(row)}
      {settings.length > 0 && (
        <>
          <div className="arow">
            <Icon name="settings" />
            <b>Settings</b>
          </div>
          {settings.map(row)}
        </>
      )}
      {hidden.length > 0 && (
        <div className="arow hidden" title="Whoever may change people and groups can open them.">
          <Icon name="lock" />
          <b>{andWords(hidden)}</b>
          <span className="state meta">hidden</span>
        </div>
      )}
      <div className="arow">
        <Icon name="shield" />
        <b>Records</b>
        <span className="state">
          <RecordsTag detail={detail} />
        </span>
      </div>
    </div>
  );
}

/** One's own password, where the desk keeps the people: the current one, then the new one twice; one's other sessions end. */
export function YourPassword({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const changing = useActing();
  const ids = useId();
  const refusal = current ? passwordRefusal(password, again) : "Your current password first.";
  const change = () =>
    changing.act("changing your password", async () => {
      let ended: number;
      try {
        ended = (await identity.password(username, password, current)).sessions_ended;
      } catch (e) {
        throw new Error(personRefusal(e, "password"));
      }
      setOpen(false);
      setCurrent("");
      setPassword("");
      setAgain("");
      const words = ended > 0 ? `Password changed. ${ended === 1 ? "Your other session was" : `Your ${ended} other sessions were`} signed out.` : "Password changed.";
      setSaid(words);
      return words;
    });
  return (
    <section className="stack roomy">
      <div className="section-head rule-top">
        <h2>Password</h2>
        {!open && (
          <button
            type="button"
            className="button secondary small"
            onClick={() => {
              setSaid(null);
              setOpen(true);
            }}
          >
            <Icon name="key" />
            Change your password
          </button>
        )}
      </div>
      {said && <p className="ok-words">{said}</p>}
      {open && (
        <div className="panel card password-form">
          <div className="fields3">
            <div className="field">
              <label className="label" htmlFor={`${ids}-current`}>
                Current password
              </label>
              <div className="input">
                <input id={`${ids}-current`} type="password" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-new`}>
                New password
              </label>
              <div className="input">
                <input id={`${ids}-new`} type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-again`}>
                Again
              </label>
              <div className="input">
                <input id={`${ids}-again`} type="password" value={again} autoComplete="new-password" onChange={(e) => setAgain(e.target.value)} />
              </div>
            </div>
          </div>
          {refusal && password && <p className="warn">{refusal}</p>}
          <Acted acting={changing.acting} />
          <div className="row actions">
            <button type="button" className="button" disabled={refusal !== null || changing.working} onClick={change}>
              Change it
            </button>
            <button type="button" className="button secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
