// SPDX-License-Identifier: AGPL-3.0-only
// The groups an admin names, as cards (record 25): each with how many people
// are in it, the pages it gives as marks, how much of a record its people
// see, and under oidc the provider's groups it follows. A page seen draws an
// outline, a page worked draws filled, and a page given to one person alone
// draws dashed; a group a person reaches through the provider's groups
// carries the globe. The legend under the people says so.

import { holdsGrant } from "../grants";
import { Icon } from "../ui/Icon";
import { RECORD_WORDS, countWords, followedOnly, groupsOf, marksOf, memberCount, type Group, type Mark, type Person } from "./identity";

export function Marks({ marks, none = "Home only" }: { marks: readonly Mark[]; none?: string }) {
  if (marks.length === 0) return <span className="meta">{none}</span>;
  return (
    <span className="amarks">
      {marks.map((m) => (
        <span key={m.key} className={["amark", m.work && "do", m.own && "own"].filter(Boolean).join(" ")}>
          {m.label}
        </span>
      ))}
    </span>
  );
}

export function MarksLegend({ followed = false }: { followed?: boolean }) {
  return (
    <div className="amark-legend">
      <span className="amark">Data</span>
      <span>sees the page</span>
      <span className="sep" />
      <span className="amark do">Data</span>
      <span>sees it and works there</span>
      <span className="sep" />
      <span className="amark own">Kvasir</span>
      <span>given to this person alone, on top of their groups</span>
      {followed && (
        <>
          <span className="sep" />
          <span className="tag followed">
            <Icon name="globe" />
            Reviewers
          </span>
          <span>joined through the provider's groups</span>
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
        <span key={`followed-${String(g.id)}`} className={`${tag(g)} followed`}>
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
          <Marks marks={marksOf(g.grants)} none="No page yet" />
          <span className="meta">In records: {RECORD_WORDS[g.detail].choice.toLowerCase()}</span>
          {follow && (
            <span className="meta">
              {g.follows.length === 0
                ? "Follows no group at the provider yet."
                : g.follows.map((f, i) => (
                    <span key={f}>
                      {i === 0 ? "Follows " : ", "}
                      <span className="path">{f}</span>
                    </span>
                  ))}
            </span>
          )}
          {holdsGrant(g.grants, "identity:work") && <span className="meta">Its people may change people and groups; the desk always keeps at least one.</span>}
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
