// SPDX-License-Identifier: AGPL-3.0-only
// One form for what a person or a group may see and do (record 25), kept
// terse: a person's groups as chips on top, a line for each page with how far
// they go there and a few words on what that opens, the pages under Settings
// each on their own, and how much of a record they see. A person's line names
// the group that gave it, a level a group gives cannot be chosen lower, and
// hovering a locked level says which group gives it. Under oidc the groups
// the provider's groups reach count as groups too, and are never sent back as
// groups the person was put in. One sentence under the lines says what all of
// it comes to.

import { useId, useState } from "react";
import { DETAILS, type Detail } from "../grants";
import { Dialog } from "../ui/Dialog";
import { Icon, type IconName } from "../ui/Icon";
import { Acted, useActing } from "./common";
import {
  LEVEL_WORDS,
  PAGE_LINES,
  RECORD_WORDS,
  addRefusal,
  andWords,
  countWords,
  detailGivenBy,
  detailLocked,
  followsOf,
  givenBy,
  grantsOf,
  groupRefusal,
  groupsGiving,
  higher,
  highestDetail,
  identity,
  levelsOf,
  lineWords,
  locked,
  personBody,
  refusalWords,
  sameGroup,
  summaryWords,
  type Group,
  type GroupId,
  type Level,
  type Levels,
  type PageId,
  type PageLine,
  type Person,
} from "./identity";

/** The side's icon for each page that has one there. */
export const PAGE_ICONS: Partial<Record<PageId, IconName>> = { assistant: "assistant", query: "search", data: "data", review: "review", release: "release", pipelines: "branch" };

function Seg<T extends string>(props: { label: string; choices: readonly T[]; words: (c: T) => string; titles?: (c: T) => string | undefined; value: T; isLocked: (c: T) => boolean; onPick: (c: T) => void; wide?: boolean }) {
  const { label, choices, words, titles, value, isLocked, onPick, wide } = props;
  return (
    <span className={wide ? "seg wide" : "seg"} role="group" aria-label={label}>
      {choices.map((c) => {
        const on = c === value;
        const lock = isLocked(c);
        const cls = [on && "on", on && c === "hidden" && "off", lock && "locked"].filter(Boolean).join(" ");
        return (
          <button key={c} type="button" className={cls || undefined} aria-pressed={on} disabled={lock} title={titles?.(c)} onClick={() => onPick(c)}>
            {words(c)}
          </button>
        );
      })}
    </span>
  );
}

/** Where a person's line comes from: the groups that give it, or the person's own when it goes higher. */
function From({ shownAbove, from }: { shownAbove: boolean; from: readonly string[] }) {
  if (shownAbove) return <span className="from own">own</span>;
  if (from.length === 0) return null;
  return <span className="from">from {andWords(from)}</span>;
}

export interface LinesProps {
  kind: "person" | "group";
  /** What each line shows, and how much of a record. */
  levels: Levels;
  detail: Detail;
  /** A person's groups, which give levels that cannot go lower. */
  groups?: readonly Group[];
  onLevel: (id: PageId, level: Level) => void;
  onDetail: (detail: Detail) => void;
}

/** A line for each page with how far the person or the group goes there, and how much of a record they see. */
export function AccessLines(props: LinesProps) {
  const { kind, levels, detail, onLevel, onDetail } = props;
  const person = kind === "person";
  const groups = person ? (props.groups ?? []) : [];

  const row = (line: PageLine) => {
    const given = givenBy(groups, line);
    const level = levels[line.id];
    const icon = PAGE_ICONS[line.id];
    const cls = ["arow", line.settings && "deep", level === "hidden" && "hidden"].filter(Boolean).join(" ");
    const above = person && locked(line, given.level, level);
    return (
      <div key={line.id} className={cls}>
        {icon && <Icon name={icon} />}
        <b>{line.title}</b>
        <Seg
          label={line.title}
          choices={line.levels}
          words={(l) => LEVEL_WORDS[l]}
          titles={(l) => (locked(line, l, given.level) ? `from ${andWords(given.from)}` : undefined)}
          value={level}
          isLocked={(l) => locked(line, l, given.level)}
          onPick={(l) => onLevel(line.id, l)}
        />
        <span className="what">
          {lineWords(line)}
          {level !== "hidden" && (above || given.from.length > 0) && (
            <>
              {" · "}
              <From shownAbove={above} from={given.from} />
            </>
          )}
        </span>
      </div>
    );
  };

  const givenDetail = detailGivenBy(groups);
  const detailAbove = person && detailLocked(givenDetail.detail, detail);
  return (
    <div className="alist">
      {PAGE_LINES.filter((l) => !l.settings).map(row)}
      <div className="arow">
        <Icon name="settings" />
        <b>Settings</b>
      </div>
      {PAGE_LINES.filter((l) => l.settings).map(row)}
      <div className="arow">
        <Icon name="shield" />
        <b>Records</b>
        <Seg wide label="Records" choices={DETAILS} words={(d) => RECORD_WORDS[d].choice} titles={(d) => RECORD_WORDS[d].says} value={detail} isLocked={(d) => detailLocked(d, givenDetail.detail)} onPick={onDetail} />
        {person && (detailAbove || givenDetail.from.length > 0) && (
          <span className="what">
            <From shownAbove={detailAbove} from={givenDetail.from} />
          </span>
        )}
      </div>
    </div>
  );
}

/** The sentence under the lines: what it all comes to. */
export function AccessNote({ words }: { words: string }) {
  return (
    <div className="note brand">
      <Icon name="info" />
      <p>{words}</p>
    </div>
  );
}

/** A person's groups as chips to pick; a group the provider's groups reach is shown among them, fixed and marked with the globe. */
function GroupChips(props: { groups: readonly Group[] | null; chosen: readonly GroupId[]; followed: readonly GroupId[]; onToggle: (id: GroupId) => void; onMake: () => void }) {
  const { groups, chosen, followed, onToggle, onMake } = props;
  const id = useId();
  if (groups === null) {
    return (
      <div className="field">
        <span className="label">Groups</span>
        <span className="meta">Reading the groups.</span>
      </div>
    );
  }
  return (
    <div className="field">
      <span className="label" id={id}>
        Groups
      </span>
      <div className="row presets" role="group" aria-labelledby={id}>
        {groups.map((g) => {
          if (followed.some((f) => sameGroup(f, g.id))) {
            return (
              <span key={String(g.id)} className="opt on followed" title="via provider">
                <Icon name="globe" />
                {g.name}
                <span className="sr-only">, through the provider's groups</span>
              </span>
            );
          }
          const on = chosen.some((c) => sameGroup(c, g.id));
          return (
            <button key={String(g.id)} type="button" className={on ? "opt on" : "opt"} aria-pressed={on} onClick={() => onToggle(g.id)}>
              {on && <Icon name="check" />}
              {g.name}
            </button>
          );
        })}
        <button type="button" className="button quiet small" onClick={onMake}>
          <Icon name="plus" />
          Make a group
        </button>
      </div>
      {groups.length === 0 && <span className="meta">No groups yet.</span>}
    </div>
  );
}

export interface PersonFormProps {
  mode: "local" | "oidc";
  /** The groups the desk keeps, or null while they are read. */
  groups: readonly Group[] | null;
  /** Why the groups could not be read. */
  why?: string | null;
  /** The person changed, or null to add one. */
  person: Person | null;
  /** The usernames the desk keeps already. */
  taken: readonly string[];
  onClose: () => void;
  onDone: (words: string) => void;
  /** A group made from inside the form. */
  onGroupMade?: (group: Group) => void;
}

/** Add a person, or change what one may see and do. */
export function PersonForm(props: PersonFormProps) {
  const { mode, person, taken, onClose, onDone, onGroupMade } = props;
  const followed = person?.followed ?? [];
  const [username, setUsername] = useState("");
  const [display, setDisplay] = useState("");
  const [password, setPassword] = useState("");
  const [made, setMade] = useState<Group[]>([]);
  const [making, setMaking] = useState(false);
  const [chosen, setChosen] = useState<GroupId[]>(person?.groups ?? []);
  const [own, setOwn] = useState<Levels>(() => levelsOf(person?.grants ?? []));
  const [ownDetail, setOwnDetail] = useState<Detail | null>(person?.detail ?? null);
  const saving = useActing();
  const ids = useId();

  const known = props.groups;
  const all = known === null ? null : [...known, ...made.filter((m) => !known.some((g) => sameGroup(g.id, m.id)))];
  // the groups the provider's groups reach give what they give, and lock it, as the ones the person was put in do
  const mine = groupsGiving({ groups: chosen, followed }, all ?? []);
  const levels = Object.fromEntries(PAGE_LINES.map((l) => [l.id, higher(l, givenBy(mine, l).level, own[l.id])])) as Levels;
  const detail = highestDetail([detailGivenBy(mine).detail, ...(ownDetail ? [ownDetail] : [])]);
  const body = personBody(chosen, followed, all ?? [], own, ownDetail);
  const name = person === null ? display.trim() || username.trim() : person.display || person.subject;
  const words = summaryWords({ kind: "person", name, grants: grantsOf(levels), detail });
  const refusal = person === null ? addRefusal({ username, password }, taken) : null;

  const save = () =>
    saving.act(`saving ${name}`, async () => {
      try {
        if (person === null) await identity.add({ username: username.trim(), password, display: display.trim(), ...body });
        else await identity.setAccess(person.subject, body);
      } catch (e) {
        throw new Error(refusalWords(e, "person"));
      }
      const said = `Saved: ${name}`;
      onDone(said);
      return said;
    });

  const foot = (
    <>
      <Acted acting={saving.acting} />
      {refusal && (username || password) && <p className="warn">{refusal}</p>}
      <div className="row actions">
        <button type="button" className="button" disabled={refusal !== null || saving.working || all === null} onClick={save}>
          {person === null ? "Add the person" : "Save"}
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return (
    <>
      <Dialog title={person === null ? "Add a person" : `Change ${name}`} icon="users" onClose={onClose} foot={foot}>
        {person === null && (
          <div className="fields3">
            <div className="field">
              <label className="label" htmlFor={`${ids}-username`}>
                Username
              </label>
              <div className="input mono">
                <input id={`${ids}-username`} value={username} autoComplete="off" spellCheck={false} onChange={(e) => setUsername(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-display`}>
                Name shown
              </label>
              <div className="input">
                <input id={`${ids}-display`} value={display} onChange={(e) => setDisplay(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor={`${ids}-password`}>
                Password
              </label>
              <div className="input">
                <input id={`${ids}-password`} type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
          </div>
        )}
        {props.why ? (
          <p className="warn">{props.why}</p>
        ) : (
          <GroupChips
            groups={all}
            chosen={chosen}
            followed={followed}
            onToggle={(id) => setChosen((c) => (c.some((x) => sameGroup(x, id)) ? c.filter((x) => !sameGroup(x, id)) : [...c, id]))}
            onMake={() => setMaking(true)}
          />
        )}
        <div className="field alist-head">
          <span className="label">Pages</span>
        </div>
        <AccessLines kind="person" levels={levels} detail={detail} groups={mine} onLevel={(id, level) => setOwn((o) => ({ ...o, [id]: level }))} onDetail={(d) => setOwnDetail(d)} />
        <AccessNote words={words} />
      </Dialog>
      {making && all !== null && (
        <GroupForm
          mode={mode}
          group={null}
          groups={all}
          members={0}
          onClose={() => setMaking(false)}
          onDone={(_, g) => {
            setMaking(false);
            if (!g) return;
            setMade((m) => [...m, g]);
            setChosen((c) => [...c, g.id]);
            onGroupMade?.(g);
          }}
        />
      )}
    </>
  );
}

export interface GroupFormProps {
  mode: "local" | "oidc";
  /** The group changed, or null to make one. */
  group: Group | null;
  /** Every group the desk keeps, so two are not named the same. */
  groups: readonly Group[];
  /** How many people are in it. */
  members: number;
  onClose: () => void;
  /** What was done, and the group as the desk keeps it now; null once removed. */
  onDone: (words: string, group: Group | null) => void;
}

/** Make a group, or change or remove one: its name, under oidc the provider's groups it follows, and the same lines as a person's. */
export function GroupForm(props: GroupFormProps) {
  const { mode, group, groups, members, onClose, onDone } = props;
  const follow = mode === "oidc";
  const [name, setName] = useState(group?.name ?? "");
  const [follows, setFollows] = useState((group?.follows ?? []).join(", "));
  const [levels, setLevels] = useState<Levels>(() => levelsOf(group?.grants ?? []));
  const [detail, setDetail] = useState<Detail>(group?.detail ?? "plain");
  const [removing, setRemoving] = useState(false);
  const saving = useActing();
  const ids = useId();

  const refusal = groupRefusal(name, groups, group?.id ?? null);
  const grants = grantsOf(levels);
  const words = summaryWords({ kind: "group", name, grants, detail });

  const save = () =>
    saving.act(`saving ${name.trim()}`, async () => {
      const body = { name: name.trim(), grants, detail, follows: follow ? followsOf(follows) : (group?.follows ?? []) };
      let kept: Group;
      try {
        kept = group === null ? await identity.makeGroup(body) : await identity.setGroup(group.id, body);
      } catch (e) {
        throw new Error(refusalWords(e, "group"));
      }
      const said = `Saved: ${body.name}`;
      onDone(said, kept);
      return said;
    });

  const remove = (g: Group) =>
    saving.act(`removing ${g.name}`, async () => {
      try {
        await identity.removeGroup(g.id);
      } catch (e) {
        throw new Error(refusalWords(e, "group"));
      }
      const said = `Removed: ${g.name}`;
      onDone(said, null);
      return said;
    });

  const foot = (
    <>
      <Acted acting={saving.acting} />
      {refusal && name && <p className="warn">{refusal}</p>}
      {removing && group !== null ? (
        <div className="note caution">
          <Icon name="alert" />
          <div className="note-body">
            <p className="note-lead">Remove {group.name}?</p>
            <p className="note-detail">{members === 0 ? "Nobody is in it." : `${countWords(members, "person loses", "people lose")} what it gives.`}</p>
            <div className="row actions">
              <button type="button" className="button" disabled={saving.working} onClick={() => remove(group)}>
                Remove
              </button>
              <button type="button" className="button secondary" onClick={() => setRemoving(false)}>
                Keep
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="row actions">
          <button type="button" className="button" disabled={refusal !== null || saving.working} onClick={save}>
            {group === null ? "Make the group" : "Save"}
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {group !== null && (
            <button type="button" className="button quiet small push" onClick={() => setRemoving(true)}>
              Remove the group
            </button>
          )}
        </div>
      )}
    </>
  );

  const nameField = (
    <div className="field">
      <label className="label" htmlFor={`${ids}-name`}>
        Name
      </label>
      <div className="input">
        <input id={`${ids}-name`} value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
      </div>
    </div>
  );

  return (
    <Dialog title={group === null ? "Make a group" : `Change ${group.name}`} icon="users" onClose={onClose} foot={foot}>
      {follow ? (
        <div className="fields2">
          {nameField}
          <div className="field">
            <label className="label" htmlFor={`${ids}-follows`}>
              Provider groups
            </label>
            <div className="input mono">
              <input id={`${ids}-follows`} value={follows} placeholder="group-a, group-b" autoComplete="off" spellCheck={false} onChange={(e) => setFollows(e.target.value)} />
            </div>
          </div>
        </div>
      ) : (
        nameField
      )}
      <div className="field alist-head">
        <span className="label">Pages</span>
      </div>
      <AccessLines kind="group" levels={levels} detail={detail} onLevel={(id, level) => setLevels((l) => ({ ...l, [id]: level }))} onDetail={setDetail} />
      <AccessNote words={words} />
    </Dialog>
  );
}
