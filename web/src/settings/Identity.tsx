// SPDX-License-Identifier: AGPL-3.0-only
// Identity (Wave 5 section 10.5): the mode, the trust list, the people and
// their entitlements, the sessions, and the standing grants.

import { useEffect, useState } from "react";
import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { holds } from "../sections";
import { Empty } from "../ui/Empty";

interface UserRow {
  name: string;
  display_name?: string;
  entitlements: string[];
  last_seen?: string | null;
}

interface Grant {
  id: number;
  principal: string;
  door: string;
  created_at: string;
}

export function Identity({ caps }: { caps: Capabilities }) {
  const admin = holds(caps, "admin");
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => {
    if (caps.desk.mode === "local" && admin) door<{ users: UserRow[] }>("GET", "/desk/users").then((u) => setUsers(u.users)).catch((e: Error) => setWhy(e.message));
    if (caps.assistant !== null) door<{ grants: Grant[] }>("GET", "/assistant/grants").then((g) => setGrants(g.grants)).catch(() => setGrants(null));
  }, [caps.desk.mode, caps.assistant, admin]);
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
      {caps.assistant === null && <p className="meta">No assistant: nothing runs under a grant.</p>}
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
                <td>{g.principal}</td>
                <td>
                  <code>{g.door}</code>
                </td>
                <td className="when">{g.created_at.slice(0, 16).replace("T", " ")}</td>
                <td>
                  {(admin || g.principal === caps.person.subject) && (
                    <button type="button" onClick={() => door("DELETE", `/assistant/grants/${g.id}`).then(() => setGrants((s) => (s ?? []).filter((x) => x.id !== g.id))).catch((e: Error) => setWhy(e.message))}>
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
