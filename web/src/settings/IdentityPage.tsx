// SPDX-License-Identifier: AGPL-3.0-only
// The Identity page (Wave 5 section 10.5, record 25), kept terse: how people
// sign in, where the desk answers and how long a session lasts as one row of
// values, with the signing facts folded under Details and the command that
// changes them; the groups as cards; and the people with their groups, what
// those add up to and when each last signed in. A person's subject is a hover
// title, never text. A change applies at the person's next click.

import { useEffect, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { may } from "../grants";
import { Command } from "../ui/Command";
import { Icon } from "../ui/Icon";
import { GroupForm, PersonForm } from "./AccessForm";
import { Head, Stats } from "./common";
import { GroupCards, GroupTags, Marks, MarksLegend, RecordsTag } from "./GroupCards";
import {
  SIGN_IN,
  accessStats,
  groupsGiving,
  hostOf,
  identity,
  marksOf,
  memberCount,
  ownDetailAbove,
  ownPages,
  reachWords,
  readWords,
  seenWords,
  sessionWords,
  type Access,
  type Group,
  type Person,
} from "./identity";

export type Opened = { kind: "add" } | { kind: "person"; person: Person } | { kind: "group"; group: Group | null };

export function IdentityPage({ caps }: { caps: Capabilities }) {
  const mode = caps.desk.mode;
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [said, setSaid] = useState<Said | null>(null);
  const [open, setOpen] = useState<Opened | null>(null);

  const load = () =>
    Promise.all([identity.groups(), identity.access()])
      .then(([g, a]) => {
        setGroups(g);
        setAccess(a);
        setWhy(null);
      })
      .catch((e: unknown) => setWhy(readWords(e)));

  useEffect(() => {
    // the identity doors answer only where people sign in
    if (mode !== "off") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once for the mode the desk runs in
  }, [mode]);

  const done = (where: Said["where"]) => (words: string) => {
    setOpen(null);
    setSaid({ where, words });
    void load();
  };
  const signs = mode === "oidc" ? "oidc" : "local";

  return (
    <IdentityBody
      caps={caps}
      groups={groups}
      access={access}
      why={why}
      said={said}
      onOpen={(o) => {
        setSaid(null);
        setOpen(o);
      }}
    >
      {open?.kind === "add" && (
        <PersonForm mode="local" groups={groups} person={null} taken={(access?.people ?? []).map((p) => p.subject)} onClose={() => setOpen(null)} onDone={done("people")} onGroupMade={() => void load()} />
      )}
      {open?.kind === "person" && <PersonForm mode={signs} groups={groups} person={open.person} taken={[]} onClose={() => setOpen(null)} onDone={done("people")} onGroupMade={() => void load()} />}
      {open?.kind === "group" && (
        <GroupForm
          mode={signs}
          group={open.group}
          groups={groups ?? []}
          members={open.group ? memberCount(open.group, access?.people ?? null) : 0}
          onClose={() => setOpen(null)}
          onDone={(words) => done("groups")(words)}
        />
      )}
    </IdentityBody>
  );
}

/** What a change came to, said in the section it changed. */
export interface Said {
  where: "groups" | "people";
  words: string;
}

export interface BodyProps {
  caps: Capabilities;
  /** What the page read, or null while it reads. */
  groups: readonly Group[] | null;
  access: Access | null;
  why: string | null;
  said?: Said | null;
  now?: number;
  onOpen: (o: Opened) => void;
  children?: React.ReactNode;
}

/** The page as it draws from what it read. */
export function IdentityBody({ caps, groups, access, why, said = null, now = Date.now(), onOpen, children }: BodyProps) {
  const mode = caps.desk.mode;
  const work = may(caps, "identity:work");
  return (
    <div className="settings">
      <Head title="Identity" lede={mode === "off" ? "Nobody signs in: whoever opens the desk may do everything." : "People, groups and what each may open."} />
      <Stats items={accessStats(caps, groups, access)} />
      {why && <p className="warn">{why}</p>}
      <SignIn caps={caps} sessions={access?.sessions_open ?? null} />
      {mode !== "off" && (
        <>
          <section className="stack roomy">
            <div className="section-head rule-top">
              <h2>Groups</h2>
              {work && (
                <button type="button" className="button secondary small" disabled={groups === null} onClick={() => onOpen({ kind: "group", group: null })}>
                  <Icon name="plus" />
                  Make a group
                </button>
              )}
            </div>
            {said?.where === "groups" && <p className="ok-words">{said.words}</p>}
            {groups === null ? (
              !why && <p className="meta">Reading the groups.</p>
            ) : groups.length === 0 ? (
              <p className="meta">No groups yet.</p>
            ) : (
              <GroupCards groups={groups} people={access?.people ?? null} follow={mode === "oidc"} mayChange={work} onChange={(g) => onOpen({ kind: "group", group: g })} />
            )}
          </section>
          <section className="stack roomy">
            <div className="section-head rule-top">
              <h2>People</h2>
              {mode === "local" && work && (
                <button type="button" className="button small" disabled={groups === null} onClick={() => onOpen({ kind: "add" })}>
                  <Icon name="plus" />
                  Add a person
                </button>
              )}
            </div>
            {said?.where === "people" && <p className="ok-words">{said.words}</p>}
            {access === null ? (
              !why && <p className="meta">Reading the people.</p>
            ) : (
              <People mode={mode} people={access.people} groups={groups ?? []} me={caps.person.subject} work={work} now={now} onChange={(p) => onOpen({ kind: "person", person: p })} />
            )}
            {access !== null && access.people.length > 0 && <MarksLegend followed={mode === "oidc"} />}
          </section>
        </>
      )}
      {children}
    </div>
  );
}

/** How people sign in, where the desk answers and how long a session lasts, as a row of values; the signing facts under Details; and the command that changes them. */
function SignIn({ caps, sessions }: { caps: Capabilities; sessions: number | null }) {
  const mode = caps.desk.mode;
  const s = caps.desk.settings;
  const reach = s ? reachWords(s.origin) : null;
  const signing = mode === "off" ? null : (s?.signing ?? null);
  const host = mode === "oidc" && signing?.issuer ? hostOf(signing.issuer) : null;
  const where = reach?.local ? "Only this machine" : "This network";
  const pairs: [string, string | undefined][] = [
    ["signing key", signing?.key],
    ["audience", signing?.audience],
    ["provider", signing?.issuer],
    ["client", signing?.client_id],
    ["groups claim", mode === "oidc" ? signing?.groups_claim : undefined],
    ["also at", (s?.also_origins ?? []).join(", ") || undefined],
  ];
  const details = pairs.filter((f): f is [string, string] => Boolean(f[1]));

  return (
    <section className="stack roomy">
      <div className="section-head rule-top">
        <h2>Sign-in</h2>
      </div>
      <div className="panel card signin">
        <div className="signin-row">
          <span className="signin-item">
            <Icon name="users" />
            {SIGN_IN[mode]}
            {host && <span className="path">{host}</span>}
          </span>
          {s && reach && (
            <span className="signin-item" title={where}>
              <Icon name={reach.local ? "lock" : "globe"} />
              <span className="sr-only">{where}: </span>
              <span className="path">{s.origin}</span>
            </span>
          )}
          {mode !== "off" && s && (
            <span className="signin-item">
              <Icon name="clock" />
              {sessionWords(s.session_hours, sessions)}
            </span>
          )}
        </div>
        {details.length > 0 && (
          <details className="signin-details">
            <summary>Details</summary>
            <dl className="facts sign-facts">
              {details.map(([k, v]) => (
                <div key={k} className="facts-pair">
                  <dt>{k}</dt>
                  <dd>
                    <span className="path">{v}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        <div className="setup-say">
          <Icon name="restart" />
          <span>Change with</span>
          <Command text="nils setup" />
        </div>
      </div>
    </section>
  );
}

/** The people: their groups, what those add up to with what is theirs alone, and when each last signed in. */
function People(props: { mode: "off" | "local" | "oidc"; people: readonly Person[]; groups: readonly Group[]; me: string; work: boolean; now: number; onChange: (p: Person) => void }) {
  const { mode, people, groups, me, work, now, onChange } = props;
  if (people.length === 0) return <p className="meta">{mode === "oidc" ? "Nobody has signed in yet." : "Nobody yet."}</p>;
  return (
    <>
      {mode === "oidc" && <p className="meta">People appear once they have signed in.</p>}
      <div className="table-wrap">
        <table className="thin people">
          <thead>
            <tr>
              <th>Person</th>
              <th>Groups</th>
              <th>Access</th>
              <th>Last seen</th>
              {work && (
                <th className="acts">
                  <span className="sr-only">Change</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              // the groups the provider's groups reach count as groups, so what they give is not the person's own
              const theirs = groupsGiving(p, groups);
              const own = ownPages(p.grants, theirs);
              const seen = seenWords(p, now);
              const name = p.display || p.subject;
              return (
                <tr key={p.subject}>
                  <td>
                    <b title={p.subject}>{name}</b>
                    {p.subject === me && <span className="meta"> you</span>}
                    <div className="person-under">
                      <span className="meta">{seen}</span>
                      <span className="person-groups">
                        <GroupTags person={p} groups={groups} />
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className="amarks">
                      <GroupTags person={p} groups={groups} />
                      {theirs.length === 0 && <span className="meta">none</span>}
                    </span>
                  </td>
                  <td>
                    <Marks marks={marksOf(p.access.grants, own)}>
                      <RecordsTag detail={p.access.detail} own={ownDetailAbove(p.detail, theirs)} />
                    </Marks>
                  </td>
                  <td className="meta">{seen}</td>
                  {work && (
                    <td className="acts">
                      <button type="button" className="button quiet small" aria-label={`Change ${name}`} onClick={() => onChange(p)}>
                        Change
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Add a person, from Setup as from this page; the groups are read here when the caller has not read them. */
export function AddPerson({ users, groups, onClose, onDone }: { users: readonly { username: string }[]; groups?: Group[]; onClose: () => void; onDone: (words: string) => void }) {
  const [read, setRead] = useState<Group[] | null>(groups ?? null);
  const [why, setWhy] = useState<string | null>(null);

  useEffect(() => {
    if (groups) return;
    let alive = true;
    identity
      .groups()
      .then((g) => alive && setRead(g))
      .catch((e: unknown) => alive && setWhy(readWords(e)));
    return () => {
      alive = false;
    };
  }, [groups]);

  return <PersonForm mode="local" groups={groups ?? read} why={why} person={null} taken={users.map((u) => u.username)} onClose={onClose} onDone={onDone} />;
}
