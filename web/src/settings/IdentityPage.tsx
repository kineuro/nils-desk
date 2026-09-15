// SPDX-License-Identifier: AGPL-3.0-only
// The Identity page (Wave 5 section 10.5, record 25), as the chosen design
// draws it: how people sign in and where the desk answers, as facts with the
// command that changes them, since both restart the desk and the engine; the
// groups an admin names, each with the pages it gives; and the people, with
// their groups, what those add up to and what is theirs alone. Under oidc a
// person's groups include the ones the provider's groups reach, marked as
// such. A change to a person or a group applies at their next click.

import { useEffect, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { may } from "../grants";
import { Command } from "../ui/Command";
import { Icon } from "../ui/Icon";
import { GroupForm, PersonForm } from "./AccessForm";
import { Head, Stats } from "./common";
import { GroupCards, GroupTags, Marks, MarksLegend } from "./GroupCards";
import {
  MODES,
  RECORD_WORDS,
  accessStats,
  groupsGiving,
  identity,
  marksOf,
  memberCount,
  openWords,
  ownDetailAbove,
  ownPages,
  ownWords,
  reachWords,
  readWords,
  seenWords,
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

const LOCAL_NOTE =
  "A person in two groups gets what both give. When people sign in through an identity provider instead, each group follows one of the provider's groups, so a person's groups are set once, at the provider.";
const OIDC_NOTE =
  "A person in two groups gets what both give. A group that follows the provider's groups takes in whoever is in them when they sign in, marked with the globe; a person can also be put in a group here, and given a page of their own, with Change.";

/** The page as it draws from what it read. */
export function IdentityBody({ caps, groups, access, why, said = null, now = Date.now(), onOpen, children }: BodyProps) {
  const mode = caps.desk.mode;
  const work = may(caps, "identity:work");
  return (
    <div className="settings">
      <Head title="Identity" lede={mode === "off" ? "Who signs in, and what each person may see and do." : "Who signs in, the groups they belong to, and what each group may see and do."} />
      <Stats items={accessStats(caps, groups, access)} />
      {why && <p className="warn">{why}</p>}
      <SignIn caps={caps} sessions={access?.sessions_open ?? null} />
      {mode !== "off" && (
        <>
          <section className="stack roomy">
            <div className="section-head rule-top">
              <h2>Groups</h2>
              <span className="meta">the pages a group sees, and where it may work</span>
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
              <p className="meta">No group yet. A group gives its people pages, and a person in two gets what both give.</p>
            ) : (
              <GroupCards groups={groups} people={access?.people ?? null} follow={mode === "oidc"} mayChange={work} onChange={(g) => onOpen({ kind: "group", group: g })} />
            )}
          </section>
          <section className="stack roomy">
            <div className="section-head rule-top">
              <h2>People</h2>
              {mode === "oidc" && <span className="meta">those who have signed in</span>}
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
            <div className="note">
              <Icon name="info" />
              <div className="note-body">
                <p className="note-detail">{mode === "oidc" ? OIDC_NOTE : LOCAL_NOTE}</p>
              </div>
            </div>
          </section>
        </>
      )}
      {children}
    </div>
  );
}

/** How people sign in, where the desk answers and how long a session lasts, as facts, with the command that changes them. */
function SignIn({ caps, sessions }: { caps: Capabilities; sessions: number | null }) {
  const mode = caps.desk.mode;
  const s = caps.desk.settings;
  const how = MODES.find((m) => m.id === mode) ?? MODES[0];
  const reach = s ? reachWords(s.origin) : null;
  const also = s?.also_origins ?? [];
  const signing = mode === "off" ? null : (s?.signing ?? null);
  const pairs: [string, string | undefined][] = [
    ["signing key", signing?.key],
    ["audience", signing?.audience],
    ["provider", signing?.issuer],
    ["client", signing?.client_id],
    ["groups claim", mode === "oidc" ? signing?.groups_claim : undefined],
  ];
  const facts = pairs.filter((f): f is [string, string] => Boolean(f[1]));

  return (
    <section className="stack roomy">
      <div className="section-head rule-top">
        <h2>How people sign in</h2>
        <span className="meta">chosen in setup</span>
      </div>
      <div className="panel card signin">
        <div className={mode === "off" || !s ? "facts-row two" : "facts-row"}>
          <div className="fact">
            <Icon name="users" size="lg" />
            <b>{how.title}</b>
            <span className="meta">{how.words}</span>
          </div>
          {s && reach && (
            <div className="fact">
              <Icon name={reach.local ? "lock" : "globe"} size="lg" />
              <b>{reach.local ? "Only this machine" : "This network"}</b>
              <span className="meta">
                The desk answers at <span className="path">{s.origin}</span>
                {also.length > 0
                  ? also.map((o, i) => (
                      <span key={o}>
                        {i === 0 ? ", and also at " : ", "}
                        <span className="path">{o}</span>
                      </span>
                    ))
                  : reach.local && " and nowhere else"}
                .
              </span>
            </div>
          )}
          {mode !== "off" && s && (
            <div className="fact">
              <Icon name="clock" size="lg" />
              <b>A session lasts {s.session_hours === 1 ? "an hour" : `${s.session_hours} hours`}</b>
              <span className="meta">
                {mode === "oidc" ? "The provider says who each person is, and the desk signs for the parts." : "Signed with the desk's own key."}
                {sessions !== null && ` ${openWords(sessions)}`}
              </span>
            </div>
          )}
        </div>
        {facts.length > 0 && (
          <dl className="facts sign-facts">
            {facts.map(([k, v]) => (
              <div key={k} className="facts-pair">
                <dt>{k}</dt>
                <dd>
                  <span className="path">{v}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="setup-say">
          <Icon name="restart" />
          {mode === "off" ? (
            <p>
              To let people sign in, each seeing only what they are given, run <Command text="nils setup" /> and choose that the desk keeps the people, or an identity provider. It restarts the desk and the engine.
            </p>
          ) : (
            <p>
              To change how people sign in, or where the desk answers, run <Command text="nils setup" /> on this machine. It restarts the desk and the engine, and everyone signs in again.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** The people: their groups, what those add up to with what is theirs alone, and when each last signed in. */
function People(props: { mode: "off" | "local" | "oidc"; people: readonly Person[]; groups: readonly Group[]; me: string; work: boolean; now: number; onChange: (p: Person) => void }) {
  const { mode, people, groups, me, work, now, onChange } = props;
  if (people.length === 0) return <p className="meta">{mode === "oidc" ? "Nobody has signed in yet." : "The desk keeps nobody yet."}</p>;
  return (
    <div className="table-wrap">
      <table className="thin people">
        <thead>
          <tr>
            <th>Person</th>
            <th>Groups</th>
            <th>Adds up to</th>
            <th>Last signed in</th>
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
            const extra = ownWords(own.size, ownDetailAbove(p.detail, theirs));
            const seen = seenWords(p, now);
            const name = p.display || p.subject;
            return (
              <tr key={p.subject}>
                <td>
                  <b>{name}</b>
                  {p.subject === me && <span className="meta"> you</span>}
                  {name !== p.subject && <div className="meta path">{p.subject}</div>}
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
                    {extra && <span className="meta">{extra}</span>}
                    {theirs.length === 0 && !extra && <span className="meta">none</span>}
                  </span>
                </td>
                <td>
                  <div className="stack">
                    <Marks marks={marksOf(p.access.grants, own)} none="No grant yet" />
                    <span className="meta">In records: {RECORD_WORDS[p.access.detail].choice.toLowerCase()}</span>
                  </div>
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
