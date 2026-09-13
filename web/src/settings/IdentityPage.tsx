// SPDX-License-Identifier: AGPL-3.0-only
// The Identity page (Wave 5 section 10.5), as the chosen design draws it: how
// people sign in, the people the desk keeps and what each may do, where the
// desk answers, and how it signs. What a person may do changes at once, and
// applies at their next click; how people sign in and where the desk answers
// are set up again with the command beside them, since both restart the desk
// and the engine.

import { useEffect, useState } from "react";
import type { Capabilities, Entitlement } from "../capabilities";
import { Command } from "../ui/Command";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Acted, Head, messageOf, Stats, useActing } from "./common";
import { identityStats } from "./stats";
import { LADDER, MODES, addRefusal, identity, lastSeenWords, lit, reachWords, stepBelow, topStep, withAssist, withStep, type DeskUser, type Users } from "./identity";

export function IdentityPage({ caps }: { caps: Capabilities }) {
  const mode = caps.desk.mode;
  const s = caps.desk.settings;
  const [users, setUsers] = useState<Users | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const change = useActing();
  const me = caps.person.subject;
  const now = Date.now();

  const load = () =>
    identity
      .users()
      .then((u) => {
        setUsers(u);
        setWhy(null);
      })
      .catch((e: unknown) => setWhy(messageOf(e)));

  useEffect(() => {
    if (mode === "local") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once for the mode the desk runs in
  }, [mode]);

  const set = (u: DeskUser, entitlements: string[]) =>
    change.act(`changing what ${u.username} may do`, async () => {
      await identity.setEntitlements(u.username, entitlements);
      await load();
      return `${u.username} may do what the ladder shows now, from their next click.`;
    });

  const reach = s ? reachWords(s.origin) : null;
  const signing = s?.signing ?? null;

  return (
    <div className="settings">
      <Head title="Identity" lede="Who signs in, and what each person may do." />
      <Stats items={identityStats(caps, users)} />
      {why && <p className="warn">{why}</p>}

      <section className="stack">
        <h2>How people sign in</h2>
        <div className="modes">
          {MODES.map((m) => (
            <div key={m.id} className={m.id === mode ? "panel card mode on" : "panel card mode"}>
              <div className="row">
                <span className={m.id === mode ? "radio on" : "radio"} aria-hidden="true" />
                <h3>{m.title}</h3>
              </div>
              <p className="meta">{m.words}</p>
            </div>
          ))}
        </div>
      </section>

      {mode === "local" && (
        <section className="stack">
          <div className="section-head">
            <h2>People</h2>
            <button type="button" className="button small" onClick={() => setAdding(true)}>
              <Icon name="plus" />
              Add a person
            </button>
          </div>
          <div className="table-wrap">
            <table className="thin">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>What they may do</th>
                  <th>Last signed in</th>
                </tr>
              </thead>
              <tbody>
                {(users?.users ?? []).map((u) => {
                  const top = topStep(u.entitlements);
                  const assist = u.entitlements.includes("assist");
                  return (
                    <tr key={u.username}>
                      <td>
                        <b>{u.username}</b> {u.username === me && <span className="meta">you</span>}
                        {u.display && u.display !== u.username && <div className="meta">{u.display}</div>}
                      </td>
                      <td>
                        <div className="row ladder-row">
                          <span className="ladder" role="group" aria-label={`What ${u.username} may do`}>
                            {LADDER.map((step: Entitlement) => (
                              <button
                                key={step}
                                type="button"
                                className={lit(u.entitlements, step) ? "on" : undefined}
                                aria-pressed={lit(u.entitlements, step)}
                                disabled={change.working}
                                onClick={() => set(u, withStep(u.entitlements, top === step ? stepBelow(step) : step))}
                              >
                                {step}
                              </button>
                            ))}
                          </span>
                          <button type="button" className={assist ? "tag brand" : "tag"} aria-pressed={assist} disabled={change.working} onClick={() => set(u, withAssist(u.entitlements, !assist))}>
                            assist
                          </button>
                        </div>
                      </td>
                      <td className="meta">{lastSeenWords(u.last_seen, now)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Acted acting={change.acting} />
          <p className="meta">Each step includes the ones before it; assist lets a person use the assistant. A change applies at the person's next click. By hand:</p>
          <Command text="nils-desk user --help" />
        </section>
      )}

      {mode === "oidc" && (
        <section className="stack">
          <h2>People</h2>
          <p className="meta">
            People, and what each may do, live at the identity provider; the desk reads the entitlements from the {signing?.roles_claim ?? "roles"} claim of each sign-in.
          </p>
        </section>
      )}

      {s && (
        <section className="pair">
          <div className="panel card">
            <h2>Where the desk answers</h2>
            <div className="choices">
              <div className="choice">
                <span className={reach?.local ? "radio on" : "radio"} aria-hidden="true" />
                Only this machine
              </div>
              <div className="choice">
                <span className={reach && !reach.local ? "radio on" : "radio"} aria-hidden="true" />
                {reach && !reach.local ? reach.words : "This network"}
              </div>
            </div>
            {(s.also_origins ?? []).length > 0 && (
              <dl className="facts">
                <dt>also accepted</dt>
                <dd>
                  {(s.also_origins ?? []).map((o, i) => (
                    <span key={o}>
                      {i > 0 && ", "}
                      <span className="path">{o}</span>
                    </span>
                  ))}
                </dd>
              </dl>
            )}
          </div>
          <div className="panel card">
            <h2>Signing and sessions</h2>
            <dl className="facts">
              {signing?.key && (
                <>
                  <dt>signing key</dt>
                  <dd>
                    <span className="path">{signing.key}</span>
                  </dd>
                </>
              )}
              {signing?.audience && (
                <>
                  <dt>audience</dt>
                  <dd>
                    <span className="path">{signing.audience}</span>
                  </dd>
                </>
              )}
              {signing?.issuer && (
                <>
                  <dt>provider</dt>
                  <dd>
                    <span className="path">{signing.issuer}</span>
                  </dd>
                </>
              )}
              {signing?.client_id && (
                <>
                  <dt>client</dt>
                  <dd>
                    <span className="path">{signing.client_id}</span>
                  </dd>
                </>
              )}
              <dt>a session lasts</dt>
              <dd>{s.session_hours} hours</dd>
              {typeof users?.sessions_open === "number" && (
                <>
                  <dt>open now</dt>
                  <dd>{users.sessions_open === 1 ? "one session" : `${users.sessions_open} sessions`}</dd>
                </>
              )}
            </dl>
          </div>
        </section>
      )}

      <div className="note">
        <Icon name="restart" />
        <div className="note-body">
          <p className="note-lead">Changing how people sign in, or where the desk answers, restarts the desk and the engine.</p>
          <p className="note-detail">Setup asks both again, and everyone signs in again afterwards.</p>
          <Command text="nils setup" />
        </div>
      </div>

      {adding && users && (
        <AddPerson
          users={users.users}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

export function AddPerson({ users, onClose, onDone }: { users: DeskUser[]; onClose: () => void; onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [display, setDisplay] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<Entitlement>("reader");
  const [assist, setAssist] = useState(false);
  const adding = useActing();
  const refusal = addRefusal({ username, password }, users);

  const add = () =>
    adding.act(`adding ${username.trim()}`, async () => {
      await identity.add({ username: username.trim(), password, display: display.trim() || undefined, entitlements: withAssist([step], assist) });
      onDone();
      return `${username.trim()} may sign in now.`;
    });

  const foot = (
    <>
      <Acted acting={adding.acting} />
      {refusal && (username || password) && <p className="warn">{refusal}</p>}
      <div className="row actions">
        <button type="button" className="button" disabled={refusal !== null || adding.working} onClick={add}>
          Add the person
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return (
    <Dialog title="Add a person" icon="users" onClose={onClose} foot={foot}>
      <div className="field">
        <label className="label" htmlFor="person-username">
          Username
        </label>
        <div className="input mono">
          <input id="person-username" value={username} autoComplete="off" spellCheck={false} onChange={(e) => setUsername(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="person-display">
          Name shown
        </label>
        <div className="input">
          <input id="person-display" value={display} onChange={(e) => setDisplay(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="person-password">
          Password
        </label>
        <div className="input">
          <input id="person-password" type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
        </div>
        <span className="meta">The person changes it after signing in; the desk refuses one that is too weak.</span>
      </div>
      <div className="field">
        <label className="label" htmlFor="person-step">
          What they may do
        </label>
        <div className="input">
          <select id="person-step" value={step} onChange={(e) => setStep(e.target.value as Entitlement)}>
            {LADDER.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <label className="choice">
          <input type="checkbox" checked={assist} onChange={(e) => setAssist(e.target.checked)} />
          and use the assistant
        </label>
      </div>
    </Dialog>
  );
}
