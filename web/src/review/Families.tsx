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
import { askedOf, choosePlan, type Asked, type AskedCandidate } from "./asked";
import { askPeopleHref, asksPeople } from "./askPeople";
import { CandidateList } from "./CandidateList";
import { refusalWords, review, type PackDoc } from "./client";
import { modelGroups } from "./modelFamily";
import { ModelFamily } from "./ModelFamily";
import { PickDialog } from "./PickDialog";
import { borderOf, borderWords, occasionWords, PICK_BORDER, type Border } from "./picks";

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
                No pick run doubts anything.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function PicksFamily({ caps, onChanged }: { caps: Capabilities; onChanged: (words: string) => void }) {
  const [load, again] = useRead(() => review.list({ kind: PICK_BORDER, limit: 500 }).then((r) => r.items));
  const [open, setOpen] = useState<ReviewItem | null>(null);
  const items = load.kind === "ready" ? load.value : [];
  const borders = items.map(borderOf).filter((b): b is Border => b !== null && (b.status === "open" || b.answered !== null));
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

export function ProposalsFamily({ caps, onChanged }: { caps: Capabilities; onChanged: (words: string) => void }) {
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
                <td>{top ? Object.entries(top.values).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join("+") || "none" : v}`).join(" · ") : "no legal candidate"}</td>
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
    const [asked, open, pack] = await Promise.all([
      review.list({ kind: "classify.asked", status: "open", limit: 500 }),
      review.list({ status: "open", limit: 500 }),
      packName ? review.pack(packName).catch(() => null) : Promise.resolve(null),
    ]);
    return { asked: asked.items, open: open.items, pack };
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
          <AskedTable asked={asked} onOpen={setOpened} />
        </>
      )}
      {opened && load.kind === "ready" && (
        <AskedDialog
          caps={caps}
          asked={opened}
          open={load.value.open}
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

/** One stack's candidates: choosing one decides each axis through the stack's open item of it, then closes the asked item. */
export function AskedDialog({ caps, asked, open, onClose, onNone, onDone }: { caps: Capabilities; asked: Asked; open: ReviewItem[]; onClose: () => void; onNone: (() => void) | null; onDone: (words: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const work = may(caps, "review:work");
  const choose = async (c: AskedCandidate) => {
    const plan = choosePlan(c, asked.stack, open);
    setBusy(true);
    setRefused(null);
    const why = `chose System 1's candidate at p ${c.p.toFixed(2)}`;
    try {
      for (const a of plan.applies) await ops.reviewApply(a.item.id, { value: a.value, scope: "stack", why });
      await ops.reviewAccept(asked.item.id, why);
      onDone(`Decided ${plan.applies.map((a) => `${a.axis} ${a.value}`).join(", ") || "nothing"} for stack ${asked.stack ?? ""}${plan.left.length > 0 ? `; ${plan.left.join(", ")} had no open question and stay as sorted` : ""}.`);
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
