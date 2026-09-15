// SPDX-License-Identifier: AGPL-3.0-only
// The groups an admin names, as cards (record 25), kept terse: each with its
// name, how many people are in it, the pages it gives as marks with one tag
// for how much of a record its people see, and under oidc the provider's
// groups it follows when it follows some. A page seen draws an outline, a
// page worked draws filled, a page given to one person alone draws dashed,
// and a group a person reaches through the provider's groups carries the
// globe; the legend under the people says so in a word each.

import type React from "react";
import { holdsGrant, type Detail } from "../grants";
import { Icon } from "../ui/Icon";
import { RECORD_WORDS, countWords, followedOnly, groupsOf, marksOf, memberCount, type Group, type Mark, type Person } from "./identity";

export function Marks({ marks, none = "None", children }: { marks: readonly Mark[]; none?: string; children?: React.ReactNode }) {
  return (
    <span className="amarks">
      {marks.length === 0 && <span className="meta">{none}</span>}
      {marks.map((m) => (
        <span key={m.key} className={["amark", m.work && "do", m.own && "own"].filter(Boolean).join(" ")}>
          {m.label}
        </span>
      ))}
      {children}
    </span>
  );
}

/** How much of a record, as one short tag with the whole of it on hover; dashed when it is a person's own. */
export function RecordsTag({ detail, own = false }: { detail: Detail; own?: boolean }) {
  const w = RECORD_WORDS[detail];
  return (
    <span className={own ? "tag records own" : "tag records"} title={w.says}>
      <Icon name="shield" />
      {w.short}
      <span className="sr-only"> records</span>
    </span>
  );
}

export function MarksLegend({ followed = false }: { followed?: boolean }) {
  return (
    <div className="amark-legend">
      <span className="amark">Data</span>
      <span>see</span>
      <span className="amark do">Data</span>
      <span>work</span>
      <span className="amark own">Kvasir</span>
      <span>own</span>
      {followed && (
        <>
          <span className="tag followed">
            <Icon name="globe" />
            Reviewers
          </span>
          <span>via provider</span>
        </>
      )}
    </div>
  );
}

/** A person's groups as tags: the ones they were put in, then the ones the provider's groups reach, marked with the globe. */
export function GroupTags({ person, groups }: { person: Pick<Person, "groups" | "followed">; groups: readonly Group[] }) {
  const tag = (g: Group) => (holdsGrant(g.grants, "identity:work") ? "tag brand" : "tag");
  return (
    <>
      {groupsOf(person.groups, groups).map((g) => (
        <span key={`put-${String(g.id)}`} className={tag(g)}>
          {g.name}
        </span>
      ))}
      {followedOnly(person, groups).map((g) => (
        <span key={`followed-${String(g.id)}`} className={`${tag(g)} followed`} title="via provider">
          <Icon name="globe" />
          {g.name}
          <span className="sr-only">, through the provider's groups</span>
        </span>
      ))}
    </>
  );
}

export function GroupCards(props: { groups: readonly Group[]; people: readonly Person[] | null; follow: boolean; mayChange: boolean; onChange: (group: Group) => void }) {
  const { groups, people, follow, mayChange, onChange } = props;
  return (
    <div className="ggrid">
      {groups.map((g) => (
        <div key={String(g.id)} className="gcard">
          <div className="row">
            <h3 className="grow">{g.name}</h3>
            <span className="meta">{countWords(memberCount(g, people), "person", "people")}</span>
          </div>
          <Marks marks={marksOf(g.grants)} none="No pages">
            <RecordsTag detail={g.detail} />
          </Marks>
          {follow && g.follows.length > 0 && (
            <span className="meta follows" title="Provider groups it follows">
              <Icon name="globe" />
              <span className="sr-only">Follows </span>
              {g.follows.map((f, i) => (
                <span key={f}>
                  {i > 0 && ", "}
                  <span className="path">{f}</span>
                </span>
              ))}
            </span>
          )}
          {mayChange && (
            <button type="button" className="button quiet small" aria-label={`Change ${g.name}`} onClick={() => onChange(g)}>
              Change
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
