// SPDX-License-Identifier: AGPL-3.0-only
// New check (job type 3, record 55 H3; the build spec of 2026-10-11,
// section 9.2, slice D2): one select and one click, as Add a dataset. From a
// run's page it opens filled for that run, so the only press is Start
// checking; from Campaigns it first asks which run (the runs that made
// masks, the newest first, each with its results not yet checked). The rows
// are keys in chips, only the chosen one in colour: which results, the part
// set looked at, one item per result or per lesion, the scans beside the
// one the result was made on, the answers (the preset reasons for the set's
// kind, which the person may change), and who reads: the people who hold
// work on Campaigns, which a rater's claim needs, the others named as
// lacking it. The foot says what
// the engine would make (the preview door, asked again a moment after each
// change) and what it leaves out, each in a tag with its why on hover.
// Making it opens the check reader at once for one of its raters; a maker
// who does not read it lands on its page, which says who reads.

import { useEffect, useMemo, useRef, useState } from "react";
import { door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { catalog, type Pipeline, type Run } from "../ops/catalog";
import { packRoles, review, type PackDoc } from "../review/client";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { DEFAULT_ROLES, OFFERED_ROLES, PANELS_MAX, REASONS_MAX, WORDS_MAX, checkBody, refusalWords, checkDoors, checkNameOf, leftOutTags, makeCheckRefusal, maskOutputs, presetFor, previewLine, reasonIdOf, roleWord, type CheckDraft, type MaskOutput, type Preview, type Which } from "./check";
import { campaigns, principalOf, refused as refusedWords } from "./client";
import { slotOf } from "./values";

/** A run a check is made of: its id, its pipeline's name and words, and the mask outputs it declares. */
export interface RunChoice {
  id: number;
  pipeline: string;
  label: string;
  outputs: MaskOutput[];
}

/** A run of a catalog pipeline as the dialog takes it; null when the pipeline declares no mask. */
export function runChoiceOf(run: Pick<Run, "id" | "pipeline" | "pipeline_id">, pipelines: readonly Pick<Pipeline, "id" | "name" | "label" | "outputs">[]): RunChoice | null {
  const p = pipelines.find((x) => x.id === run.pipeline_id) ?? pipelines.find((x) => x.name === run.pipeline) ?? null;
  const outputs = maskOutputs(p?.outputs ?? null);
  if (outputs.length === 0) return null;
  return { id: run.id, pipeline: p?.name ?? run.pipeline, label: p?.label ?? run.pipeline, outputs };
}

/** A run's masks no check has decided, counted up to `cap` (more reads as cap+). */
function uncheckedOf(run: number, cap = 500): Promise<number> {
  return door<{ derivatives: unknown[] }>("GET", `/api/derivatives?run=${run}&kind=mask&check=unchecked&limit=${cap + 1}`).then((r) => r.derivatives.length);
}

/** A desk person as the engine names them: the provider's subject at its host, as this person's own principal shows it. */
export function principalFor(caps: Capabilities, subject: string): string {
  const me = principalOf(caps);
  const mine = caps.person.subject;
  if (me !== mine && me.startsWith(`${mine}@`)) return `${subject}${me.slice(mine.length)}`;
  return subject;
}

/** What a rater's claim needs of the desk: work on Campaigns. */
const RATER_NEEDS = "campaigns:work";

/** A person on the desk who may be named to read, and whether they hold what a rater needs (null where the desk does not say). */
export interface Reader {
  principal: string;
  display: string;
  holds: boolean | null;
}

/** The people offered to read, never the maker (who is "Me"), and those left out for lacking work on Campaigns. */
export function readersOf(people: readonly Reader[], me: string): { offered: Reader[]; lacking: Reader[] } {
  const others = people.filter((p) => p.principal !== me);
  return { offered: others.filter((p) => p.holds !== false), lacking: others.filter((p) => p.holds === false) };
}

export function NewCheck({ caps, run = null, onClose }: { caps: Capabilities; run?: RunChoice | null; onClose: () => void }) {
  const [chosen, setChosen] = useState<RunChoice | null>(run);
  if (!chosen) return <RunChooser caps={caps} onPick={setChosen} onClose={onClose} />;
  return <CheckForm caps={caps} run={chosen} onClose={onClose} onBack={run ? null : () => setChosen(null)} />;
}

type Runs = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; runs: (RunChoice & { unchecked: number | null; when: string | null })[] };

/** The runs that made masks, the newest first, each with its results not yet checked. */
function RunChooser({ caps, onPick, onClose }: { caps: Capabilities; onPick: (r: RunChoice) => void; onClose: () => void }) {
  const [runs, setRuns] = useState<Runs>(() => ({ kind: "loading", since: Date.now() }));
  useEffect(() => {
    let alive = true;
    Promise.all([catalog.runs(100), catalog.list()])
      .then(async ([r, c]) => {
        const made = r.runs
          .filter((x) => (x.derivatives?.length ?? 0) > 0 && x.status !== "running" && x.status !== "queued")
          .sort((a, b) => b.id - a.id)
          .flatMap((x) => {
            const ch = runChoiceOf(x, c.pipelines);
            return ch ? [{ ...ch, when: x.finished_at ?? x.started_at }] : [];
          })
          .slice(0, 8);
        const counted = await Promise.all(made.map((m) => uncheckedOf(m.id).then((n) => ({ ...m, unchecked: n }), () => ({ ...m, unchecked: null }))));
        if (alive) setRuns({ kind: "ready", runs: counted });
      })
      .catch((e: unknown) => alive && setRuns({ kind: "failed", why: refusedWords(e) }));
    return () => {
      alive = false;
    };
  }, []);
  const refusal = makeCheckRefusal(caps);
  return (
    <Dialog
      eyebrow="Check results"
      title="Which run"
      icon="check"
      className="new-check"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{refusal ?? ""}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      }
    >
      {runs.kind === "loading" && <Wait phase="reading the runs" since={runs.since} />}
      {runs.kind === "failed" && <p className="warn">{runs.why}</p>}
      {runs.kind === "ready" && runs.runs.length === 0 && <p className="meta">No run made masks yet.</p>}
      {runs.kind === "ready" && runs.runs.length > 0 && (
        <ul className="check-runs">
          {runs.runs.map((r) => (
            <li key={r.id}>
              <button type="button" className="check-run" disabled={refusal !== null} onClick={() => onPick(r)}>
                <b>{r.label}</b>
                <span className="meta">run {r.id}</span>
                <span className="grow" />
                {r.unchecked !== null && <span className={r.unchecked > 0 ? "tag" : "tag ok"}>{r.unchecked > 500 ? "500+" : r.unchecked.toLocaleString("en-US")} not yet checked</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** The draft a run opens with: its first mask output, that output's first set, the preset answers, me reading each result once. */
export function draftFor(caps: Capabilities, run: RunChoice): CheckDraft {
  const out = run.outputs[0];
  const set = out.sets[0];
  return {
    run: run.id,
    pipeline: run.pipeline,
    output: out.id,
    setKey: set.key,
    setWords: set.words,
    setKind: set.kind,
    grain: "result",
    which: "unchecked",
    sample: 50,
    roles: [...DEFAULT_ROLES],
    reasons: presetFor(caps, set.kind),
    raters: [principalOf(caps)],
    perItem: 1,
    name: checkNameOf(run.pipeline, set.words, run.id),
  };
}

type Counts = { all: number; unchecked: number; breached: number | null };

function CheckForm({ caps, run, onClose, onBack }: { caps: Capabilities; run: RunChoice; onClose: () => void; onBack: (() => void) | null }) {
  const [d, setD] = useState<CheckDraft>(() => draftFor(caps, run));
  const [named, setNamed] = useState(false);
  const [preview, setPreview] = useState<{ p: Preview; for: string } | null>(null);
  const [previewWhy, setPreviewWhy] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [pack, setPack] = useState<PackDoc | null>(null);
  const [people, setPeople] = useState<Reader[]>([]);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [adding, setAdding] = useState<"reason" | "role" | null>(null);
  const [reasonText, setReasonText] = useState("");
  const me = principalOf(caps);
  const set = (p: Partial<CheckDraft>) => setD((x) => ({ ...x, ...p }));
  const out = run.outputs.find((o) => o.id === d.output) ?? run.outputs[0];

  // the pack's roles for "+ scan", and the people who may read: a rater's claim needs work on Campaigns
  useEffect(() => {
    const name = caps.engine?.packs[0]?.name;
    if (name) review.pack(name).then(setPack, () => undefined);
    if (caps.desk?.mode !== "off")
      fetch(`/desk/people?holding=${RATER_NEEDS}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ people?: { subject: string; display: string; holds?: boolean }[] }>) : { people: [] }))
        .then((r) => setPeople((r.people ?? []).map((p) => ({ principal: principalFor(caps, p.subject), display: p.display || p.subject, holds: typeof p.holds === "boolean" ? p.holds : null }))))
        .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the counts on the Results keys: every result of the output, those no check decided, those the run's checks flagged
  const countsFor = `${run.id}/${d.output}/${d.setKey}`;
  useEffect(() => {
    let alive = true;
    const body = checkBody({ ...d, which: "all" });
    if (!body.ok) return;
    const ask = (which: string) => checkDoors.preview({ ...body.body, source: { run: run.id, output: d.output, which } });
    Promise.all([ask("all"), ask("breached").catch(() => null)])
      .then(([all, br]) => {
        if (!alive) return;
        const taken = (p: Preview) => p.drawable + p.held + p.partsPending + p.notDrawable.reduce((a, x) => a + x.count, 0);
        setCounts({ all: all.results, unchecked: Math.max(0, all.results - all.checkedAlready), breached: br ? taken(br) : null });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsFor]);

  // the preview of the body as drafted, asked again a moment after each change
  const body = checkBody(d);
  const bodyKey = body.ok ? JSON.stringify({ ...body.body, name: "" }) : null;
  const asked = useRef(0);
  useEffect(() => {
    if (!body.ok || !bodyKey) return;
    const mine = ++asked.current;
    const t = setTimeout(() => {
      checkDoors.preview(body.body).then(
        (p) => {
          if (asked.current !== mine) return;
          setPreview({ p, for: bodyKey });
          setPreviewWhy(null);
        },
        (e: unknown) => asked.current === mine && setPreviewWhy(refusedWords(e)),
      );
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyKey]);

  const chooseSet = (s: MaskOutput["sets"][number], o: MaskOutput = out) => {
    setD((x) => ({ ...x, output: o.id, setKey: s.key, setWords: s.words, setKind: s.kind, grain: s.kind === "components" ? x.grain : "result", reasons: presetFor(caps, s.kind), name: named ? x.name : checkNameOf(run.pipeline, s.words, run.id) }));
  };
  const refusal = makeCheckRefusal(caps);
  const shown = preview && preview.for === bodyKey ? preview.p : null;
  const stale = preview !== null && preview.for !== bodyKey;
  const needs = !body.ok ? body.needs : null;
  const make = () => {
    if (!body.ok) return;
    setBusy(true);
    setWhy(null);
    campaigns
      .make(body.body as never)
      .then((c) => {
        onClose();
        // the reader is a rater's alone: anyone else would claim and be refused
        const raters = c.rater_policy?.raters ?? d.raters;
        location.hash = raters.includes(me) ? href("review", "campaigns", String(c.id), "check") : href("review", "campaigns", String(c.id));
      })
      .catch((e: unknown) => {
        setBusy(false);
        setWhy(refusedWords(e));
      });
  };
  const roles = useMemo(() => {
    const fromPack = packRoles(pack).filter((r) => !OFFERED_ROLES.includes(r));
    return { offered: [...OFFERED_ROLES, ...d.roles.filter((r) => !OFFERED_ROLES.includes(r))], more: fromPack.filter((r) => !d.roles.includes(r)) };
  }, [pack, d.roles]);
  const toggleRole = (r: string) => set({ roles: d.roles.includes(r) ? d.roles.filter((x) => x !== r) : [...d.roles, r] });
  const reasonIds = d.reasons.map((r) => r.id);
  const addReason = () => {
    const words = reasonText.trim().slice(0, WORDS_MAX);
    if (!words || d.reasons.length >= REASONS_MAX) return;
    set({ reasons: [...d.reasons, { id: reasonIdOf(words, reasonIds), words, needs: "none" }] });
    setReasonText("");
    setAdding(null);
  };
  const n = (v: number) => v.toLocaleString("en-US");
  const which: { k: Which; words: string; count: number | null }[] = [
    { k: "unchecked", words: "Not yet checked", count: counts?.unchecked ?? null },
    { k: "all", words: "All", count: counts?.all ?? null },
    ...(counts?.breached ? [{ k: "breached" as Which, words: "Flagged by the run's checks", count: counts.breached }] : []),
    { k: "sample", words: "A sample", count: null },
  ];
  const sets = run.outputs.flatMap((o) => o.sets.map((s) => ({ o, s })));
  const readers = readersOf(people, me);
  const perPart = d.setKind === "components";
  const tags = shown ? leftOutTags(shown) : [];
  return (
    <Dialog
      eyebrow="Check results"
      title={`${run.label} · ${d.setWords.toLowerCase()}`}
      icon="check"
      className="new-check"
      onClose={onClose}
      foot={
        <div className="check-foot">
          <div className="row check-foot-line">
            <span className="meta check-preview" aria-live="polite">
              {shown ? previewLine(shown, d.setKind, d.grain) : previewWhy ? "" : needs ? `Needs ${needs}.` : "counting…"}
            </span>
            {stale && <span className="meta">…</span>}
            {tags.map((t) => (
              <span key={t.words} className="tag caution" title={t.why}>
                {t.words}
              </span>
            ))}
          </div>
          {(previewWhy || why) && <p className="warn">{refusalWords(why ?? previewWhy ?? "")}</p>}
          <div className="row actions">
            {onBack && (
              <button type="button" className="button secondary" onClick={onBack}>
                Back
              </button>
            )}
            <span className="grow meta">{refusal ?? ""}</span>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="button" disabled={busy || !body.ok || refusal !== null || (shown !== null && shown.items === 0)} onClick={make}>
              Start checking
            </button>
          </div>
        </div>
      }
    >
      <label className="check-name">
        <span className="sr-only">Name</span>
        <input value={d.name} onChange={(e) => (setNamed(true), set({ name: e.target.value }))} aria-label="the check's name" />
      </label>
      <div className="check-rows">
        <span className="check-row-label">Results</span>
        <span className="chips" role="group" aria-label="results">
          {which.map((w) => (
            <button key={w.k} type="button" className={d.which === w.k ? "opt on" : "opt"} aria-pressed={d.which === w.k} onClick={() => set({ which: w.k })}>
              {w.words}
              {w.count !== null && <b className="opt-count">{n(w.count)}</b>}
            </button>
          ))}
          {d.which === "sample" && (
            <span className="input check-sample">
              <input type="number" min={1} value={d.sample} aria-label="how many results" onChange={(e) => set({ sample: Math.max(1, Number(e.target.value) || 1) })} />
            </span>
          )}
          {d.which === "sample" && <Hint text="drawn from the results not yet checked, by a seed the check records" />}
        </span>

        <span className="check-row-label">Look at</span>
        <span className="chips" role="group" aria-label="look at">
          {sets.map(({ o, s }) => (
            <button key={`${o.id}/${s.key}`} type="button" className={d.output === o.id && d.setKey === s.key ? "opt on" : "opt"} aria-pressed={d.output === o.id && d.setKey === s.key} onClick={() => chooseSet(s, o)}>
              {s.words}
              {run.outputs.length > 1 && <span className="meta"> · {o.id}</span>}
            </button>
          ))}
        </span>

        <span className="check-row-label">One item per</span>
        <span className="chips" role="group" aria-label="one item per">
          <button type="button" className={d.grain === "result" ? "opt on" : "opt"} aria-pressed={d.grain === "result"} onClick={() => set({ grain: "result" })}>
            Result
          </button>
          {perPart && (
            <button type="button" className={d.grain === "part" ? "opt on" : "opt"} aria-pressed={d.grain === "part"} onClick={() => set({ grain: "part" })}>
              Lesion
            </button>
          )}
          {perPart && <Hint text="per lesion: each lesion its own item, read one key each" />}
        </span>

        <span className="check-row-label">Beside it</span>
        <span className="chips" role="group" aria-label="beside it">
          <button type="button" className="opt on followed" aria-pressed="true" disabled title="the scan the result was made on: always first">
            made on
          </button>
          {roles.offered.map((r) => (
            <button key={r} type="button" className={d.roles.includes(r) ? "opt on" : "opt"} aria-pressed={d.roles.includes(r)} disabled={!d.roles.includes(r) && d.roles.length + 1 >= PANELS_MAX} onClick={() => toggleRole(r)}>
              {roleWord(r)}
            </button>
          ))}
          {roles.more.length > 0 && adding !== "role" && (
            <button type="button" className="opt quiet-opt" onClick={() => setAdding("role")}>
              + scan
            </button>
          )}
          {adding === "role" &&
            roles.more.map((r) => (
              <button key={r} type="button" className="opt quiet-opt" onClick={() => (toggleRole(r), setAdding(null))}>
                + {roleWord(r)}
              </button>
            ))}
          <Hint text="each visit's main scans by role; a visit without one shows one panel fewer; aligned by the scanner's position" />
        </span>

        <span className="check-row-label">Answers</span>
        <span className="chips check-reasons" role="group" aria-label="answers">
          {d.reasons.map((r) => (
            <span key={r.id} className="value-tag check-reason-tag" data-slot={slotOf(reasonIds, r.id) ?? undefined}>
              <kbd>{reasonIds.indexOf(r.id) + 3}</kbd>
              <span>{r.words}</span>
              {r.needs !== "none" && (
                <span className="check-needs" title={r.needs === "point" ? "answered with a click on a picture" : "answered with a note"}>
                  {r.needs}
                </span>
              )}
              <button type="button" className="icon-button check-remove" aria-label={`remove ${r.words}`} disabled={d.reasons.length <= 1} onClick={() => set({ reasons: d.reasons.filter((x) => x.id !== r.id) })}>
                <Icon name="x" />
              </button>
            </span>
          ))}
          {adding === "reason" ? (
            <span className="input check-reason-input">
              <input
                autoFocus
                value={reasonText}
                maxLength={WORDS_MAX}
                placeholder="a reason"
                aria-label="a new reason"
                onChange={(e) => setReasonText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.preventDefault(), addReason());
                  if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), setAdding(null));
                }}
                onBlur={() => (reasonText.trim() ? addReason() : setAdding(null))}
              />
            </span>
          ) : (
            d.reasons.length < REASONS_MAX && (
              <button type="button" className="opt quiet-opt" onClick={() => setAdding("reason")}>
                + reason
              </button>
            )
          )}
          <Hint text={d.raters.length > 1 || d.perItem > 1 ? "1 accepts and 2 rejects; a lesion flagged by either reader goes to correction" : "1 accepts and 2 rejects; these are the keys 3 to 9"} />
        </span>

        <span className="check-row-label">Who</span>
        <span className="chips" role="group" aria-label="who">
          {[{ principal: me, display: "Me" }, ...readers.offered].map((p) => {
            const on = d.raters.includes(p.principal);
            return (
              <button key={p.principal} type="button" className={on ? "opt on" : "opt"} aria-pressed={on} onClick={() => set({ raters: on ? d.raters.filter((x) => x !== p.principal) : [...d.raters, p.principal], perItem: !on || d.raters.length > 2 ? d.perItem : 1 })}>
                {p.display}
              </button>
            );
          })}
          {readers.lacking.length > 0 && (
            <span className="meta check-lacking" title={`${readers.lacking.map((p) => p.display).join(", ")}: a claim needs work on Campaigns, which an admin gives on the Identity page`}>
              {readers.lacking.length <= 3 ? readers.lacking.map((p) => p.display).join(", ") : `${n(readers.lacking.length)} more`} without work on Campaigns
            </span>
          )}
          <span className="check-each">
            each read by
            {([1, 2] as const).map((k) => (
              <button key={k} type="button" className={d.perItem === k ? "opt on" : "opt"} aria-pressed={d.perItem === k} disabled={k === 2 && d.raters.length < 2} onClick={() => set({ perItem: k })}>
                {k}
              </button>
            ))}
          </span>
        </span>
      </div>
      {!served(caps, "POST /api/campaigns/preview") && <p className="meta">This engine counts nothing ahead.</p>}
    </Dialog>
  );
}
