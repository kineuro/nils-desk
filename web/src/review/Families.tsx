// SPDX-License-Identifier: AGPL-3.0-only
// Review's three grown families (record 45 S5 and S7), each a page under the
// Review head that reads its own items: Picks, the occasions a pick run
// doubts, opened on the session board; Proposals, what models proposed, as
// change matrices with commit by filter; Asked, System 1's candidate lists.
// Each offers "Ask people about these" where the Campaigns section is built.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { may } from "../grants";
import { ops, type ReviewItem } from "../ops/client";
import { Dialog } from "../ui/Dialog";
import { Wait } from "../ui/Wait";
import { askedOf, chooseBody, valueWords, type Asked, type AskedCandidate } from "./asked";
import { askPeopleHref, asksPeople } from "./askPeople";
import { CandidateList } from "./CandidateList";
import { packRoles, refusalWords, review, type PackDoc } from "./client";
import { modelGroups, standingActs, standingDoors, type Standing } from "./modelFamily";
import { ModelFamily } from "./ModelFamily";
import { CommitStandingDialog, RestCampaignDialog, StandingCard } from "./ModelStanding";
import { committedLine, followLine, resortOf, useFollowedJob, type Resort } from "./resort";
import { PickDialog } from "./PickDialog";
import { gridHref, gridServed } from "./proposalGrid";
import { borderOf, borderWords, occasionWords, PICK_BORDER, rolesOffered, type Border } from "./picks";

const n = (v: number) => v.toLocaleString("en-US");

type Load<T> = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; value: T };

function useRead<T>(read: () => Promise<T>): [Load<T>, () => void] {
  const [load, setLoad] = useState<Load<T>>(() => ({ kind: "loading", since: Date.now() }));
  const again = useCallback(() => {
    read().then(
      (value) => setLoad({ kind: "ready", value }),
      (e: Error) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: e.message })),
    );
  }, []);
  useEffect(again, [again]);
  return [load, again];
}

function Reading({ load, what }: { load: Load<unknown>; what: string }) {
  if (load.kind === "loading") return <Wait phase={`reading ${what}`} since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">{what} could not be read: {load.why}</p>;
  return null;
}

// ---------------------------------------------------------------- picks

/** The borders' table: open ones first, then the ones a person answered. */
export function BordersTable({ borders, onOpen }: { borders: Border[]; onOpen: (b: Border) => void }) {
  const rows = [...borders].sort((a, b) => (a.status === b.status ? a.item - b.item : a.status === "open" ? -1 : 1));
  return (
    <div className="table-wrap">
      <table className="thin">
        <thead>
          <tr>
            <th>Occasion</th>
            <th>Doubt</th>
            <th className="num">Candidates</th>
            <th>State</th>
            <th className="acts" />
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.item} className={b.status === "open" ? "" : "decided"}>
              <td>{occasionWords(b)}</td>
              <td>{borderWords(b)}</td>
              <td className="num">{n(b.candidates.length)}</td>
              <td>{b.answered ? <span className="tag brand">a person&apos;s pick</span> : b.status === "open" ? <span className="tag caution">open</span> : <span className="tag">{b.status}</span>}</td>
              <td className="acts">
                <button type="button" className="button secondary small" onClick={() => onOpen(b)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="meta">
                No pick run doubts anything. A pick run raises its doubts here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** The roles as chips (record 51 R8): the served pack's, each with its open borders, and every role. */
export function RoleChips({ roles, role, onRole }: { roles: { role: string; open: number }[]; role: string | null; onRole: (r: string | null) => void }) {
  if (roles.length === 0) return null;
  return (
    <div className="chips" role="group" aria-label="Role">
      <button type="button" className={role === null ? "opt on" : "opt"} aria-pressed={role === null} onClick={() => onRole(null)}>
        every role
      </button>
      {roles.map((r) => (
        <button key={r.role} type="button" className={role === r.role ? "opt on" : "opt"} aria-pressed={role === r.role} onClick={() => onRole(r.role)}>
          {r.role}
          <b>{n(r.open)}</b>
        </button>
      ))}
    </div>
  );
}

export function PicksFamily({ caps, packName = null, dataset, onChanged }: { caps: Capabilities; packName?: string | null; dataset?: string; onChanged: (words: string) => void }) {
  const [load, again] = useRead(() => review.list({ kind: PICK_BORDER, dataset, limit: 500 }).then((r) => r.items));
  const [open, setOpen] = useState<ReviewItem | null>(null);
  const [pack, setPack] = useState<PackDoc | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const readsPack = packName !== null && may(caps, "data:see");
  useEffect(() => {
    if (readsPack && packName) review.pack(packName).then(setPack, () => undefined);
  }, [readsPack, packName]);
  const items = load.kind === "ready" ? load.value : [];
  const all = items.map(borderOf).filter((b): b is Border => b !== null && (b.status === "open" || b.answered !== null));
  const roles = rolesOffered(packRoles(pack), all);
  const borders = role === null ? all : all.filter((b) => b.role === role);
  const waiting = borders.filter((b) => b.status === "open").length;
  return (
    <section className="stack roomy">
      <Reading load={load} what="the picks" />
      {load.kind === "ready" && (
        <>
          <div className="section-head rule-top">
            <h2>Occasions a pick run doubts</h2>
            <span className="meta">{n(waiting)} open</span>
            {asksPeople(caps) && waiting > 0 && (
              <a className="button secondary small" href={askPeopleHref({ kind: PICK_BORDER })}>
                Ask people about these
              </a>
            )}
          </div>
          <RoleChips roles={roles} role={role} onRole={setRole} />
          <BordersTable borders={borders} onOpen={(b) => setOpen(items.find((i) => i.id === b.item) ?? null)} />
        </>
      )}
      {open && (
        <PickDialog
          caps={caps}
          item={open}
          onClose={() => setOpen(null)}
          onDone={(w) => {
            setOpen(null);
            again();
            onChanged(w);
          }}
        />
      )}
    </section>
  );
}

// ------------------------------------------------------------ proposals

/**
 * What models proposed (UX round 1): on an engine that counts them, one card per model and axis with its two acts,
 * commit the ones at or above the threshold and make the rest a campaign for oneself; the change matrix stays one
 * open away for a look value by value. On an older engine, the matrix alone.
 */
export function ProposalsFamily({ caps, onChanged }: { caps: Capabilities; onChanged: (words: string) => void }) {
  const acts = standingActs(caps);
  if (!acts.reads) return <ProposalGroups caps={caps} onChanged={onChanged} />;
  return <ProposalStandings caps={caps} acts={acts} onChanged={onChanged} />;
}

function ProposalStandings({ caps, acts, onChanged }: { caps: Capabilities; acts: { commit: boolean; campaign: boolean }; onChanged: (words: string) => void }) {
  const [load, again] = useRead(() => standingDoors.list());
  const [committing, setCommitting] = useState<Standing | null>(null);
  const [making, setMaking] = useState<Standing | null>(null);
  const [groups, setGroups] = useState(false);
  const [seen, setSeen] = useState(0);
  // UX round 5: the re-sort a commit queued, followed until it is over; the page's line says how far
  const [follow, setFollow] = useState<{ s: Standing; resort: Resort } | null>(null);
  const followed = useFollowedJob(follow?.resort.job ?? null, () => {
    again();
    setSeen((x) => x + 1);
  });
  useEffect(() => {
    if (follow) onChanged(followLine(follow.s, follow.resort, followed));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the line follows the job
  }, [follow, followed]);
  const list = load.kind === "ready" ? load.value : [];
  return (
    <section className="stack roomy">
      <Reading load={load} what="the proposals" />
      {load.kind === "ready" && list.length === 0 && <p className="meta">Nothing proposed. A model run from Pipelines proposes its values here.</p>}
      {list.map((s) => (
        <StandingCard key={`${s.model.id}|${s.axis}`} s={s} acts={acts} onCommit={() => setCommitting(s)} onCampaign={() => setMaking(s)} reviewHref={gridServed(caps) ? gridHref(s.model.id, s.axis) : null} />
      ))}
      {load.kind === "ready" && list.length > 0 && (
        <details className="proposal-groups" onToggle={(e) => setGroups((e.target as HTMLDetailsElement).open)}>
          <summary>Value by value</summary>
          {groups && (
            <ProposalGroups
              key={seen}
              caps={caps}
              onChanged={(w) => {
                again();
                onChanged(w);
              }}
            />
          )}
        </details>
      )}
      {committing && (
        <CommitStandingDialog
          s={committing}
          onClose={() => setCommitting(null)}
          onDone={(answer) => {
            const s = committing;
            setCommitting(null);
            again();
            setSeen((x) => x + 1);
            const resort = resortOf(answer);
            if (resort.job !== null) setFollow({ s, resort });
            else {
              setFollow(null);
              onChanged(committedLine(s, answer));
            }
          }}
        />
      )}
      {making && <RestCampaignDialog s={making} onClose={() => setMaking(null)} />}
    </section>
  );
}

/** The change matrix of the groups waiting (record 45 S7), each cell opened and committed by hand. */
function ProposalGroups({ caps, onChanged }: { caps: Capabilities; onChanged: (words: string) => void }) {
  const [load, again] = useRead(() => Promise.all([review.list({ status: "open", limit: 500 }), review.list({ status: "staged", limit: 500 })]).then(([o, s]) => modelGroups([...o.items, ...s.items])));
  const ask = asksPeople(caps) ? (kind: string) => askPeopleHref({ kind }) : null;
  return (
    <section className="stack roomy">
      <Reading load={load} what="the proposals" />
      {load.kind === "ready" && (
        <ModelFamily
          caps={caps}
          groups={load.value}
          askHref={ask}
          onChanged={(w) => {
            again();
            onChanged(w);
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- asked

export function AskedTable({ asked, onOpen }: { asked: Asked[]; onOpen: (a: Asked) => void }) {
  return (
    <div className="table-wrap">
      <table className="thin">
        <thead>
          <tr>
            <th>Stack</th>
            <th>Most probable</th>
            <th className="num">p</th>
            <th className="num">Candidates</th>
            <th>Since</th>
            <th className="acts" />
          </tr>
        </thead>
        <tbody>
          {asked.map((a) => {
            const top = a.candidates[0];
            return (
              <tr key={a.item.id}>
                <td className="num">{a.stack ?? ""}</td>
                <td>{top ? Object.entries(top.values).map(([k, v]) => `${k} ${valueWords(v)}`).join(" · ") : "no legal candidate"}</td>
                <td className="num">{top ? top.p.toFixed(2) : ""}</td>
                <td className="num">{n(a.candidates.length)}</td>
                <td className="num">{whenWords(a.item.created_at)}</td>
                <td className="acts">
                  <button type="button" className="button secondary small" onClick={() => onOpen(a)}>
                    Open
                  </button>
                </td>
              </tr>
            );
          })}
          {asked.length === 0 && (
            <tr>
              <td colSpan={6} className="meta">
                Nothing is asked.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function AskedFamily({ caps, packName, onExplain, onChanged }: { caps: Capabilities; packName: string | null; onExplain: (item: ReviewItem, stack: number) => void; onChanged: (words: string) => void }) {
  const [load, again] = useRead(async () => {
    const [asked, pack] = await Promise.all([
      review.list({ kind: "classify.asked", status: "open", limit: 500 }),
      packName ? review.pack(packName).catch(() => null) : Promise.resolve(null),
    ]);
    return { asked: asked.items, pack };
  });
  const [opened, setOpened] = useState<Asked | null>(null);
  const pack: PackDoc | null = load.kind === "ready" ? load.value.pack : null;
  const asked = load.kind === "ready" ? load.value.asked.map((i) => askedOf(i, pack)).filter((a): a is Asked => a !== null) : [];
  return (
    <section className="stack roomy">
      <Reading load={load} what="what System 1 asks" />
      {load.kind === "ready" && (
        <>
          <div className="section-head rule-top">
            <h2>What System 1 asks</h2>
            <span className="meta">{n(asked.length)} stacks</span>
            {asksPeople(caps) && asked.length > 0 && (
              <a className="button secondary small" href={askPeopleHref({ kind: "classify.asked" })}>
                Ask people about these
              </a>
            )}
          </div>
          {asked.length === 0 ? <p className="meta">Nothing asked. System 1 asks here when it is unsure of a whole stack.</p> : <AskedTable asked={asked} onOpen={setOpened} />}
        </>
      )}
      {opened && load.kind === "ready" && (
        <AskedDialog
          caps={caps}
          asked={opened}
          onClose={() => setOpened(null)}
          onNone={opened.stack !== null ? () => { const a = opened; setOpened(null); onExplain(a.item, a.stack as number); } : null}
          onDone={(w) => {
            setOpened(null);
            again();
            onChanged(w);
          }}
        />
      )}
    </section>
  );
}

/** One stack's candidates: choosing one answers the asked item whole, one decision per axis in one transaction (record 45 R5). */
export function AskedDialog({ caps, asked, onClose, onNone, onDone }: { caps: Capabilities; asked: Asked; onClose: () => void; onNone: (() => void) | null; onDone: (words: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const work = may(caps, "review:work");
  const choose = async (c: AskedCandidate) => {
    setBusy(true);
    setRefused(null);
    const why = `chose System 1's candidate at p ${c.p.toFixed(2)}`;
    try {
      const r = (await ops.reviewApply(asked.item.id, chooseBody(asked, c, why))) as { staged?: boolean };
      const said = Object.entries(c.values)
        .map(([axis, v]) => `${axis} ${valueWords(v)}`)
        .join(", ");
      onDone(`Decided ${said || "nothing"} for stack ${asked.stack ?? ""}${r.staged ? ", waiting for a person to confirm" : ""}.`);
    } catch (e) {
      setBusy(false);
      setRefused(refusalWords(e));
    }
  };
  return (
    <Dialog
      title={`Stack ${asked.stack ?? ""}`}
      icon="review"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Close
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="lede">System 1&apos;s legal candidates, most probable first.</p>
      <CandidateList asked={asked} onChoose={work ? (c) => void choose(c) : null} onNone={work ? onNone : null} busy={busy} />
    </Dialog>
  );
}
