// SPDX-License-Identifier: AGPL-3.0-only
// Identity (Wave 5 section 10.5): the mode, the trust list, the people and
// their entitlements, the sessions, and the standing grants.

import { useEffect, useState } from "react";
import { door } from "../ask/client";
import { assistant, type Grant, type Grants } from "../assistant/client";
import type { Capabilities } from "../capabilities";
import { holds } from "../sections";
import { Empty } from "../ui/Empty";

interface UserRow {
  name: string;
  display_name?: string;
  entitlements: string[];
  last_seen?: string | null;
}

export function Identity({ caps }: { caps: Capabilities }) {
  const admin = holds(caps, "admin");
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [ladder, setLadder] = useState<Grants["ladder"]>([]);
  const [door2, setDoor2] = useState("");
  const [why, setWhy] = useState<string | null>(null);
  const loadGrants = () =>
    assistant
      .grants(admin)
      .then((g) => {
        setGrants(g.grants.filter((x) => !x.revoked_at));
        setLadder(g.ladder);
      })
      .catch(() => setGrants(null));
  useEffect(() => {
    if (caps.desk.mode === "local" && admin) door<{ users: UserRow[] }>("GET", "/desk/users").then((u) => setUsers(u.users)).catch((e: Error) => setWhy(e.message));
    if (caps.assistant !== null) loadGrants();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mode and person
  }, [caps.desk.mode, caps.assistant, admin]);
  const rungTwo = ladder.filter((l) => l.rung === 2 && holds(caps, l.role as "reader" | "reviewer" | "operator" | "admin"));
  const trust = (caps.engine as { oidc?: { issuer?: string; audience?: string } } | null)?.oidc;
  return (
    <div className="identity">
      <dl className="facts">
        <dt>mode</dt>
        <dd>{caps.desk.mode === "off" ? "off: no login, every entitlement" : caps.desk.mode === "local" ? "local: the desk keeps the people" : "oidc: the identity provider decides"}</dd>
        {trust && (
          <>
            <dt>trust</dt>
            <dd>
              issuer <code>{trust.issuer}</code>
              {trust.audience && <>, audience <code>{trust.audience}</code></>}
            </dd>
          </>
        )}
        <dt>you</dt>
        <dd>
          {caps.person.display_name} <code>{caps.person.subject}</code>, {caps.person.entitlements.join(", ") || "no entitlement"}
        </dd>
      </dl>
      {caps.desk.mode === "local" && (
        <>
          <h3>People</h3>
          {!admin && <p className="meta">The people are listed for admins.</p>}
          {why && <p className="warn">{why}</p>}
          {users && users.length === 0 && <Empty what="No person yet." />}
          {users && users.length > 0 && (
            <table className="thin users">
              <thead>
                <tr>
                  <th>person</th>
                  <th>entitlements</th>
                  <th>last seen</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.name}>
                    <td>{u.display_name ?? u.name}</td>
                    <td>{u.entitlements.join(", ")}</td>
                    <td className="when">{u.last_seen ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {caps.desk.mode === "oidc" && <p className="meta">People and their groups are the identity provider's; the desk reads the entitlements it binds to them.</p>}
      <h3>Standing grants</h3>
      <p className="meta">A grant is consent: personal, per verb, revocable, shown in the rail before anything runs. Only what your own entitlement opens can be granted, and only rung-two verbs, the ones that can be undone.</p>
      {caps.assistant === null && <p className="meta">No assistant: nothing runs under a grant.</p>}
      {grants !== null && rungTwo.length > 0 && (
        <div className="row">
          <select value={door2} onChange={(e) => setDoor2(e.target.value)} aria-label="a verb to grant">
            <option value="">a verb the assistant may run for you</option>
            {rungTwo.filter((l) => !(grants ?? []).some((g) => g.door === l.door && g.subject === caps.person.subject)).map((l) => (
              <option key={l.door} value={l.door}>{l.door}</option>
            ))}
          </select>
          <button type="button" disabled={!door2} onClick={() => assistant.grant(door2).then(() => { setDoor2(""); loadGrants(); }).catch((e: Error) => setWhy(e.message))}>Grant</button>
        </div>
      )}
      {caps.assistant !== null && grants === null && <p className="meta">The assistant serves no grants door yet.</p>}
      {grants && grants.length === 0 && <Empty what="No standing grant." />}
      {grants && grants.length > 0 && (
        <table className="thin">
          <thead>
            <tr>
              <th>person</th>
              <th>may run</th>
              <th>since</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {grants.map((g) => (
              <tr key={g.id}>
                <td>{g.subject}</td>
                <td>
                  <code>{g.door}</code>
                </td>
                <td className="when">{g.created_at.slice(0, 16).replace("T", " ")}</td>
                <td>
                  {(admin || g.subject === caps.person.subject) && (
                    <button type="button" onClick={() => assistant.revoke(g.id).then(() => setGrants((s) => (s ?? []).filter((x) => x.id !== g.id))).catch((e: Error) => setWhy(e.message))}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
