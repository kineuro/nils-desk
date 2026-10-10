// SPDX-License-Identifier: AGPL-3.0-only
// The pseudonymise step, in the dataset (Wave 7a, the design Nima confirmed
// on 2026-10-09): opened in place under the rail, never on a page of its own.
// Three boxes, the originals, locked, the IDs and how many have a code, and
// the pseudonymised copy, which is what NILS reads; one primary button for
// the next thing to do; the rules as one line with Change. Giving the IDs a
// code happens here too: the IDs one row each by their shape, a CSV of ID and
// subject code dropped or pasted and rehearsed by the engine so the rows fill
// as they match, a generated code for one or for the rest, the IDs shown once
// and recorded for a person cleared to see them, and a button that says
// exactly what it will do and then does it: the map filed, then the
// dataset's own thread, pseudonymise, read and sort. Once every file has its
// copy, what every file got and the next steps running beside it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { needsWork } from "../access";
import type { ChainedJob } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, sees } from "../grants";
import { placesKept } from "../objects/kept";
import { ops } from "../ops/client";
import { href } from "../routes";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { bringInBody, bringInName, jobs, packFor, type Dataset } from "./datasets";
import { PurgeDialog, VaultDialog } from "./Originals";
import { plainError, type Plain } from "./plain";
import { policyKept } from "./policy";
import {
  bytesWords,
  linkage,
  NOTHING_ASKED,
  NOTHING_TYPED,
  originals as originalsDoor,
  originalsActs,
  originalsWords,
  parseCsv,
  reportOf,
  vaultedInto,
  type OriginalsLook,
  type PlaceRow,
  type PurgeAsk,
  typeLabel,
  type VaultAsk,
} from "./pseudonyms";
import {
  chipOf,
  codeColumnsOf,
  codePairs,
  codesBody,
  codesWords,
  everyFile,
  held,
  idsBox,
  idTypeOf,
  matchedOf,
  outcomeWords,
  shapeNote,
  primaryOf,
  rulesLine,
  stepView,
  waitWords,
  type HeldIds,
  type IdRow,
  type Matched,
  type StepView,
} from "./pseudoStep";
import { RulesDialog } from "./RulesDialog";
import { clock, stepOf, took, type DatasetSummary } from "./summary";
import { STOPPED_NEXT, type Stopped } from "./stopped";
import { TagsDialog } from "./Tags";

const n = (v: number) => v.toLocaleString("en-US");

/** A dialog the step opens: the rules, the tag chooser, or an act on the originals. */
export type Opened = { kind: "rules" } | { kind: "tags" } | { kind: "vault"; ask: VaultAsk } | { kind: "purge"; ask: PurgeAsk } | null;

/** A map given here: its file's name and its rows as pairs of ID and subject code. */
interface GivenMap {
  name: string;
  pairs: string[][];
  /** The two headers as the file has them, ID first; null where it has none, its first row a row of the map. */
  heads: [string, string] | null;
}

/** What the engine's rehearsal of the maps answered. */
type Rehearsal = { kind: "idle" } | { kind: "working"; since: number } | { kind: "done"; conflicts: { row: number; why: string }[] } | { kind: "refused"; plain: Plain };

/** The step's own state, held by the dataset's detail so the rail and the step read one view. */
export interface Pseudonymise {
  view: StepView | null;
  held: HeldIds | null;
  matched: Matched[];
  setMatched: (m: Matched[]) => void;
  /** What the step is doing now, said while it does it. */
  acting: { phase: string; since: number } | null;
  setActing: (a: { phase: string; since: number } | null) => void;
  reload: () => void;
}

/**
 * The step of a dataset with originals: its held IDs read from the engine
 * whenever its summary moves, the codes a map being rehearsed gives them, and
 * the view the rail and the step both draw. Nothing for a dataset without
 * originals, which has no step.
 */
export function usePseudonymise(caps: Capabilities, d: Dataset, s: DatasetSummary | null): Pseudonymise {
  const has = Boolean(d.trees?.originals);
  const lists = has && served(caps, "GET /api/linkage/held/ids") && may(caps, "data:see");
  const [heldIds, setHeldIds] = useState<HeldIds | null>(null);
  const [matched, setMatched] = useState<Matched[]>([]);
  const [acting, setActing] = useState<{ phase: string; since: number } | null>(null);
  const step = stepOf(s, "pseudonymised");
  const moved = [step?.state, step?.files, step?.held, step?.job, d.held?.files, d.held?.identifiers, d.trees?.anon?.files].join(":");
  const reload = useCallback(() => {
    if (!lists) return;
    held.ids(d.name).then(setHeldIds, () => setHeldIds(null));
  }, [lists, d.name]);
  useEffect(() => {
    reload();
  }, [reload, moved]);
  const running = acting !== null || step?.state === "running" || step?.state === "queued";
  // worked out again only when what it reads changes, not on the detail's every second
  const view = useMemo(() => (has ? stepView(d, step, lists ? heldIds : null, matched, running) : null), [has, d, step, lists, heldIds, matched, running]);
  return {
    view,
    held: heldIds,
    matched,
    setMatched,
    acting,
    setActing,
    reload,
  };
}

/** Whether the step opens by itself: while it is the dataset's next step, or while it runs. */
export function opensItself(v: StepView | null): boolean {
  return v !== null && v.phase !== "done";
}

/** A job of the engine's, waited for until it ends; a failure or a stop is said in its own words. */
async function ended(job: number): Promise<void> {
  for (;;) {
    await new Promise((done) => setTimeout(done, 1000));
    const row = await ops.job(job);
    if (row.state === "done") return;
    if (row.state === "failed" || row.state === "cancelled") throw new Error(row.error ?? "The map was not filed.");
  }
}

/* ---------------------------------------------------------------- the three boxes */

function Boxes({ v, compact, codes, kept }: { v: StepView; compact: boolean; codes?: { big: string; words: string; caution: boolean }; kept?: string }) {
  const box = idsBox(v);
  const mid = codes ?? box;
  const arrow = (
    <span className="ps-arrow" aria-hidden="true">
      <Icon name="arrow" />
    </span>
  );
  const originals = v.originals === null ? "?" : n(v.originals);
  const size = v.bytes !== null && v.bytes > 0 && !compact ? ` · ${bytesWords(v.bytes)}` : "";
  return (
    <div className={compact ? "ps-boxes compact" : "ps-boxes"}>
      <div className="ps-box">
        <span className="ps-box-label">
          <Icon name="lock" />
          Originals
        </span>
        <span className="ps-big">{originals}</span>
        <span className="ps-box-words">{kept ?? `files${size} · locked`}</span>
      </div>
      {arrow}
      <div className={kept ? "ps-box" : "ps-box on"}>
        <span className="ps-box-label">
          <Icon name="key" />
          {kept ? "Subject codes" : "IDs to subject codes"}
        </span>
        <span className="ps-big">{mid.big}</span>
        <span className={mid.caution ? "ps-box-words warn" : "ps-box-words"}>{mid.words}</span>
      </div>
      {arrow}
      <div className={kept ? "ps-box done" : "ps-box"}>
        <span className="ps-box-label">
          <Icon name="shield" />
          Pseudonymised copy
        </span>
        <span className={v.copy === 0 ? "ps-big faint" : "ps-big"}>{n(v.copy)}</span>
        <span className="ps-box-words">{compact ? "files" : "files · what NILS reads"}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the step: the boxes, the next action, and the IDs given codes */

export interface StepProps {
  caps: Capabilities;
  dataset: Dataset;
  summary: DatasetSummary | null;
  pseudo: Pseudonymise;
  /** Words for the page; with a dataset's name, they speak of its run and stand only while it goes. */
  onChanged: (words: string, running?: string) => void;
  onFailed: (e: unknown) => void;
  /** A dialog of the step's, which the dataset's detail holds. */
  onOpen: (o: Opened) => void;
  /** Where the dataset's chain stopped, in its job's own words: said here, and the run is tried again (2026-10-10). */
  stopped?: Stopped | null;
}

export function PseudonymiseStep(props: StepProps) {
  const { caps, dataset: d, pseudo, onChanged, onFailed, onOpen, stopped = null } = props;
  const v = pseudo.view;
  const [codes, setCodes] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  if (v === null) return null;
  const works = may(caps, "data:work");
  const generates = d.unmapped === "code";
  const open = codes && (v.phase === "codes" || v.phase === "ready");
  const next = works ? primaryOf(v, generates, open) : null;
  // a run that stopped is tried again by the same act, never shown as if nothing happened
  const primary = next && stopped && next.act === "run" ? { ...next, label: "Try again" } : next;
  const chip = chipOf(v, open);
  const changes = works && may(caps, "places:work") && served(caps, "PUT /api/places/{id}");

  /**
   * The dataset's own thread, after the map is filed where one was given:
   * pseudonymise, read and sort. The act is the dataset's, held by its
   * detail, not the step's: closing the step from the rail while the map
   * files neither strands the filed map without its run nor leaves the step
   * saying it is still giving the codes (review of 2026-10-10).
   */
  const run = async (map: { pairs: string[][] } | null) => {
    pseudo.setActing({ phase: map ? "giving the subject codes" : "starting", since: Date.now() });
    try {
      if (map) {
        const r = await linkage.import(codesBody(d.name, idTypeOf(d, v.rows), map.pairs, false));
        if (typeof r.job === "number") await ended(r.job);
        pseudo.setActing({ phase: "starting", since: Date.now() });
      }
      const body = bringInBody(d, bringInName(d.name), packFor(caps));
      await jobs.enqueue(body.command, body.name);
      pseudo.setMatched([]);
      if (alive.current) setCodes(false);
      onChanged(`${d.name}: pseudonymising, then reading and sorting.`, d.name);
    } catch (e) {
      onFailed(e);
    } finally {
      pseudo.setActing(null);
    }
  };

  const generate = (chosen?: number[]) => {
    pseudo.setActing({ phase: "giving generated subject codes", since: Date.now() });
    held
      .generate(d.name, chosen)
      .then(() => pseudo.reload())
      .catch(onFailed)
      .finally(() => pseudo.setActing(null));
  };

  const act = (map: { pairs: string[][] } | null) => {
    if (!primary) return;
    if (primary.act === "codes") return setCodes(true);
    void run(map);
  };

  return (
    <section className="ps-step" id={`pseudonymise-${d.id}`} aria-label="Pseudonymise">
      <div className="ps-head">
        <Icon name="shield" size="lg" />
        <h3 className="ps-title">Pseudonymise</h3>
        {chip && <span className={`tag ${chip.tone}`}>{chip.words}</span>}
        <span className="grow" />
        <span className="ps-rules-line">{rulesLine(d)}</span>
        {changes && (
          <button type="button" className="link-button ps-change" onClick={() => onOpen({ kind: "rules" })}>
            Change
          </button>
        )}
      </div>
      <Boxes v={v} compact={open} />
      {stopped && !pseudo.acting && (
        <div className="ps-pad">
          <p className="ps-stopped" role="status">
            Stopped: {stopped.words} <span className="meta">{STOPPED_NEXT}</span>
          </p>
        </div>
      )}
      {pseudo.acting && (
        <div className="ps-pad">
          <Wait phase={pseudo.acting.phase} since={pseudo.acting.since} />
        </div>
      )}
      {open ? (
        <Codes caps={caps} dataset={d} pseudo={pseudo} view={v} primary={primary} busy={pseudo.acting !== null} onRun={(map) => act(map)} onGenerate={generate} onFailed={onFailed} />
      ) : (
        <div className="ps-actions">
          {primary && (
            <button type="button" className="button" disabled={pseudo.acting !== null} onClick={() => act(null)}>
              <Icon name={primary.act === "codes" ? "key" : "shield"} />
              {primary.label}
            </button>
          )}
          {works && v.phase === "codes" && served(caps, "POST /api/linkage/held/code") && v.rows.length > 0 && (
            <>
              <button type="button" className="button secondary" disabled={pseudo.acting !== null} onClick={() => generate(v.rows.filter((r) => !r.coded && r.state === "held").map((r) => r.id))}>
                Generate subject codes
              </button>
              <Hint text="A subject code made from the ID itself. A map given later folds it into the right subject." />
            </>
          )}
          {!works && <span className="meta">{needsWork(caps, "Pseudonymising", [["data:work", "the Data page"]])}</span>}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- give the IDs a code */

/** The IDs the table draws at once, and adds on each Show more. */
const ROWS_AT_ONCE = 200;

function Codes(props: {
  caps: Capabilities;
  dataset: Dataset;
  pseudo: Pseudonymise;
  view: StepView;
  primary: { label: string } | null;
  busy: boolean;
  onRun: (map: { pairs: string[][] } | null) => void;
  onGenerate: (chosen?: number[]) => void;
  onFailed: (e: unknown) => void;
}) {
  const { caps, dataset: d, pseudo, view: v, primary, busy, onRun, onGenerate, onFailed } = props;
  const [maps, setMaps] = useState<GivenMap[]>([]);
  const [rehearsal, setRehearsal] = useState<Rehearsal>({ kind: "idle" });
  const [refused, setRefused] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [shown, setShown] = useState<Map<number, string> | null>(null);
  /** How many IDs the table draws: a dataset can hold thousands, so a page of them at a time, the most files first. */
  const [atOnce, setAtOnce] = useState(ROWS_AT_ONCE);
  const [revealing, setRevealing] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  const cleared = sees(caps, "sensitive");
  const maps_ = cleared && served(caps, "POST /api/linkage/imports");
  const reveals = cleared && served(caps, "POST /api/linkage/held/reveal");
  const generates = served(caps, "POST /api/linkage/held/code");
  const shapes = v.rows.map((r) => r.shape ?? "").filter(Boolean);
  const idType = idTypeOf(d, v.rows);

  // the IDs shown once are let go of when the step closes or the dataset changes, and so are the codes of a map not filed
  useEffect(() => () => setShown(null), [d.name]);
  const { setMatched } = pseudo;
  useEffect(() => () => setMatched([]), [setMatched]);

  // the newest rehearsal's answer alone is shown: one asked before it that answers late is let go
  const rehearsals = useRef(0);
  const rehearse = (all: GivenMap[]) => {
    const pairs = all.flatMap((m) => m.pairs);
    if (pairs.length === 0) return;
    const mine = ++rehearsals.current;
    setRehearsal({ kind: "working", since: Date.now() });
    linkage
      .import(codesBody(d.name, idType, pairs, true))
      .then((raw) => {
        if (mine !== rehearsals.current) return;
        const report = reportOf(raw);
        pseudo.setMatched(report.conflicts.length > 0 ? [] : matchedOf(raw));
        setRehearsal({ kind: "done", conflicts: report.conflicts });
      })
      .catch((e: unknown) => {
        if (mine !== rehearsals.current) return;
        pseudo.setMatched([]);
        setRehearsal({ kind: "refused", plain: plainError(e, "The map could not be read.") });
      });
  };

  const took = useRef(0);
  const take = (name: string, textOf: string) => {
    took.current += 1;
    setRefused(null);
    const csv = parseCsv(textOf);
    const cols = codeColumnsOf(csv, shapes);
    if ("refusal" in cols) return setRefused(cols.refusal);
    const pairs = codePairs(csv, cols);
    if (pairs.length === 0) return setRefused("No row has both an ID and a subject code.");
    const next = [...maps, { name, pairs, heads: cols.headerless ? null : ([csv.header[cols.id], csv.header[cols.code]] as [string, string]) }];
    setMaps(next);
    rehearse(next);
  };

  const fromFile = (f: File | null | undefined) => {
    if (!f) return;
    f.text().then((t) => take(f.name, t), onFailed);
  };
  // Ctrl+V on the box: aimed at it, or while it or a button in it has the
  // focus. The document hears it, not the box: Firefox aims a paste at the
  // selection rather than the focus, so a box reached by Tab, or focused by
  // Paste below, never would.
  const taking = useRef(take);
  useEffect(() => {
    taking.current = take;
  });
  useEffect(() => {
    const pasted = (e: ClipboardEvent) => {
      const box = zone.current;
      if (!box || !(box.contains(e.target as Node | null) || box.contains(document.activeElement))) return;
      const t = e.clipboardData?.getData("text") ?? "";
      if (t.trim() === "") return;
      e.preventDefault();
      taking.current("pasted", t);
    };
    document.addEventListener("paste", pasted);
    return () => document.removeEventListener("paste", pasted);
  }, []);
  // the browser's own reading of the clipboard, which Firefox asks about first; refused, Ctrl+V on the box
  const paste = () => {
    const at = took.current;
    const instead = () => {
      // a Ctrl+V while the browser asked has given the map already
      if (took.current !== at) return;
      zone.current?.focus();
      setRefused("Press Ctrl+V on the box to paste.");
    };
    if (!navigator.clipboard?.readText) return instead();
    navigator.clipboard.readText().then((t) => take("pasted", t), instead);
  };
  const reveal = () => {
    if (shown) return setShown(null);
    setRevealing(true);
    held
      .reveal(d.name)
      .then(setShown, onFailed)
      .finally(() => setRevealing(false));
  };

  const matched = v.rows.filter((r) => r.from_map).length;
  const conflicts = rehearsal.kind === "done" ? rehearsal.conflicts : [];
  const lacking = v.rows.filter((r) => !r.coded && r.state === "held");
  const waiting = waitWords(v);
  const mapToFile = matched > 0 && maps.length > 0 ? { pairs: maps.flatMap((m) => m.pairs) } : null;
  // a map with no header shows none of its first row, which holds an ID
  const heads = maps.length === 0 ? "" : maps[0].heads ? `${maps[0].heads[0]}, ${maps[0].heads[1]}` : "no header row";

  return (
    <div className="ps-codes">
      {maps_ ? (
        <div
          ref={zone}
          className={over ? "ps-drop over" : "ps-drop"}
          tabIndex={0}
          aria-label="Drop or paste a CSV of ID and subject code"
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            fromFile(e.dataTransfer.files?.[0]);
          }}
        >
          <Icon name="upload" size="lg" />
          {maps.length === 0 ? (
            <span className="ps-drop-words">
              <b>Drop a CSV of ID and subject code</b>
              <span className="meta">or paste it here</span>
            </span>
          ) : (
            <span className="ps-drop-words">
              <span>
                <b>{maps.map((m) => m.name).join(", ")}</b>
                {rehearsal.kind === "done" && conflicts.length === 0 && v.rows.length > 0 && (
                  <span className={matched > 0 ? "ok-words" : "warn"}>
                    {" "}
                    · {matched === 0 ? `none of the ${n(v.rows.length)} IDs matched` : `${n(matched)} of ${n(v.rows.length)} IDs matched`}
                  </span>
                )}
                {conflicts.length > 0 && (
                  <span className="warn">
                    {" "}
                    · {n(conflicts.length)} {conflicts.length === 1 ? "row conflicts" : "rows conflict"}; nothing of it is filed
                    <Hint text={conflicts.slice(0, 20).map((c) => `row ${c.row}: ${c.why}`).join("; ")} />
                  </span>
                )}
              </span>
              <span className="meta">
                {heads}
                {matched > 0 ? ` · ${n(v.go)} ${v.go === 1 ? "file" : "files"} can go now` : ""}
              </span>
            </span>
          )}
          <span className="grow" />
          {maps.length > 0 && <span className="meta ps-again">Drop or paste another to add subject codes</span>}
          <label className="button secondary small ps-file">
            Choose a file
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              aria-label="Choose a CSV"
              onChange={(e) => {
                fromFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button type="button" className="button secondary small" onClick={paste}>
            Paste
          </button>
        </div>
      ) : (
        <p className="meta">{cleared ? "This engine takes no map here." : "Giving subject codes from a map reads the IDs; this account is not cleared to."}</p>
      )}
      {rehearsal.kind === "working" && <Wait phase="matching the map" since={rehearsal.since} />}
      {rehearsal.kind === "refused" && (
        <p className="warn">
          {rehearsal.plain.words}
          <Hint text={rehearsal.plain.detail} />
        </p>
      )}
      {refused && <p className="warn">{refused}</p>}

      <div className="ps-table" role="table" aria-label="The IDs in the originals">
        <div className="ps-row head" role="row">
          <span role="columnheader">#</span>
          <span role="columnheader">{shown ? "ID" : "ID, as its shape"}</span>
          <span role="columnheader" className="num">
            Files
          </span>
          <span role="columnheader">Subject code</span>
          <span role="columnheader" className="end">
            {reveals && (
              <button type="button" className="button quiet small" disabled={revealing} onClick={reveal}>
                <Icon name="eye" />
                {shown ? "Hide the IDs" : "Show the IDs · recorded"}
              </button>
            )}
          </span>
        </div>
        {v.rows.slice(0, atOnce).map((r, i) => (
          <IdLine key={r.id} row={r} n={i + 1} value={shown?.get(r.id) ?? null} generates={generates && !busy} onGenerate={() => onGenerate([r.id])} />
        ))}
        {v.rows.length > atOnce && (
          <div className="ps-row" role="row">
            <span role="cell" className="meta ps-none">
              {n(atOnce)} of {n(v.rows.length)} IDs, the most files first{" "}
              <button type="button" className="link-button" onClick={() => setAtOnce((was) => was + ROWS_AT_ONCE)}>
                Show {n(Math.min(ROWS_AT_ONCE, v.rows.length - atOnce))} more
              </button>
            </span>
          </div>
        )}
        {v.rows.length === 0 && (
          <div className="ps-row" role="row">
            <span role="cell" className="meta ps-none">
              {v.without.ids > 0 ? `${n(v.without.ids)} IDs held; this engine does not list them one by one.` : "No ID is held."}
            </span>
          </div>
        )}
      </div>

      <div className="ps-foot">
        {waiting && <span className="warn">{waiting}</span>}
        <span className="grow" />
        {generates && lacking.length > 0 && (
          <button type="button" className="button secondary" disabled={busy} onClick={() => onGenerate(lacking.map((r) => r.id))}>
            {lacking.length === 1 ? "Generate a subject code for this one" : `Generate subject codes for these ${n(lacking.length)}`}
          </button>
        )}
        {primary && (
          <button type="button" className="button" disabled={busy || rehearsal.kind === "working"} onClick={() => onRun(mapToFile)}>
            <Icon name="shield" />
            {primary.label}
          </button>
        )}
      </div>
    </div>
  );
}

/** One held ID: its place in the list, its shape (or its value, shown once), its files, its code or what it waits for, and its one way out. */
function IdLine({ row: r, n: i, value, generates, onGenerate }: { row: IdRow; n: number; value: string | null; generates: boolean; onGenerate: () => void }) {
  const lacking = !r.coded && r.state === "held";
  const code =
    r.state === "waits"
      ? `${r.code ?? "its subject"} · waits for its ${r.waits_for ? typeLabel(r.waits_for) : "ID"}`
      : r.code !== null
        ? r.code
        : r.state === "generated"
          ? "a generated subject code, at the run"
          : "no subject code yet";
  return (
    <div className={lacking ? "ps-row lacking" : "ps-row"} role="row">
      <span role="cell" className="ps-n">
        {i}
      </span>
      <span role="cell" className="ps-shape">
        {value ?? r.shape ?? "?"}
        {shapeNote(r) && <span className="meta ps-shape-note"> {shapeNote(r)}</span>}
      </span>
      <span role="cell" className="num">
        {n(r.files)}
      </span>
      <span role="cell" className="ps-code">
        <span className={r.code !== null && r.state !== "waits" ? "ps-code-value" : lacking ? "warn" : "meta"}>{code}</span>
        {r.also_in.length > 0 && <span className="tag">also in {r.also_in.join(", ")}</span>}
      </span>
      <span role="cell" className="end">
        {lacking && generates && (
          <button type="button" className="button secondary small" onClick={onGenerate}>
            Generate a subject code
          </button>
        )}
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- pseudonymised */

/** The jobs of the last run, its pseudonymise step and its read, as the jobs door answers them; read again when either changes. */
function useRan(caps: Capabilities, pseudonymise: number | null, read: number | null): { pseudonymise: ChainedJob | null; read: ChainedJob | null } | null {
  const [ran, setRan] = useState<{ pseudonymise: ChainedJob | null; read: ChainedJob | null } | null>(null);
  const reads = may(caps, "pipelines:see") && served(caps, "GET /api/jobs");
  useEffect(() => {
    if (!reads || (pseudonymise === null && read === null)) return setRan(null);
    let alive = true;
    const one = (id: number | null) => (id === null ? Promise.resolve(null) : ops.job(id).catch(() => null));
    void Promise.all([one(pseudonymise), one(read)]).then(([p, r]) => alive && setRan({ pseudonymise: p, read: r }));
    return () => {
      alive = false;
    };
  }, [reads, pseudonymise, read]);
  return ran;
}

/** The step once every file has its copy: what every file got, where the codes came from, and the originals. */
export function PseudonymisedSummary(props: { caps: Capabilities; dataset: Dataset; summary: DatasetSummary | null; pseudo: Pseudonymise; onOpen: (o: Opened) => void }) {
  const { caps, dataset: d, summary: s, pseudo, onOpen } = props;
  const policy = useKept(policyKept);
  useEffect(() => {
    if (served(caps, "GET /api/pseudonymize/tags")) void policyKept.ensure();
  }, [caps]);
  const step = stepOf(s, "pseudonymised");
  const readStep = stepOf(s, "read");
  const ran = useRan(caps, step?.job ?? null, readStep?.job ?? null);
  const v = pseudo.view;
  if (v === null) return null;
  const outcome = ran ? outcomeWords(ran.pseudonymise, ran.read, readStep?.refused ?? 0) : null;
  const at = new Date();
  const when = [clock(step?.finished_at, at), took(step?.started_at, step?.finished_at)].filter(Boolean).join(" · ");
  const subjects = v.subjects.coded;
  const kept = d.originals_kept ?? "kept";
  const keptWords = kept === "kept" ? "kept · locked" : originalsWords(kept, vaultedInto(d));
  const changes = may(caps, "data:work") && may(caps, "places:work") && served(caps, "PUT /api/places/{id}");
  const lines = everyFile(policy.value ?? null, d);
  const size = typeof d.trees?.originals?.bytes === "number" && d.trees.originals.bytes > 0 ? `, ${bytesWords(d.trees.originals.bytes)}` : "";
  return (
    <div className="dp-col ps-done" aria-label="Pseudonymised">
      <div className="ps-head plain">
        <span className="ps-ok">
          <Icon name="shield" size="lg" />
        </span>
        <h3 className="ps-title">Pseudonymised</h3>
        <span className="tag ok">
          {n(v.copy)} {v.copy === 1 ? "file" : "files"}
          {subjects > 0 ? ` · ${n(subjects)} ${subjects === 1 ? "subject" : "subjects"}` : ""}
        </span>
        <span className="grow" />
        {when && <span className="ps-when">{when}</span>}
      </div>
      {outcome && (
        <p className="ps-outcome">
          <span className="k">Last run</span>
          <span>{outcome}</span>
        </p>
      )}
      <Boxes v={v} compact codes={{ big: n(subjects), words: codesWords(v.subjects, v.personnummer), caution: false }} kept={keptWords} />
      <div className="ps-every">
        <h4 className="eyebrow">In every file</h4>
        {lines.map((l) => (
          <div key={l.label} className="ps-every-line">
            <span className="k">{l.label}</span>
            <span>
              {l.value}
              {l.all && (
                <>
                  {" "}
                  <button type="button" className="link-button" onClick={() => onOpen({ kind: "tags" })}>
                    {l.all}
                  </button>
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="ps-quiet">
        {v.subjects.generated > 0 && (
          <div className="ps-quiet-line">
            <span className="dot caution" aria-hidden="true" />
            <span>
              {n(v.subjects.generated)} {v.subjects.generated === 1 ? "subject has a generated subject code; a map later folds it" : "subjects have generated subject codes; a map later folds them"} into the right subject
            </span>
            {served(caps, "POST /api/linkage/imports") && <a href={href("data", "pseudonyms")}>Give a map</a>}
          </div>
        )}
        {kept !== "purged" && (
          <div className="ps-quiet-line">
            <span className="dot" aria-hidden="true" />
            <span>
              The originals are {kept === "kept" ? `kept, locked${size}` : originalsWords(kept, vaultedInto(d))}
            </span>
            {changes && originalsActs(caps, d).purge && (
              <button type="button" className="link-button" onClick={() => onOpen({ kind: "rules" })}>
                Vault or purge
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the dialogs the step opens */

/** The step's dialogs, held by the dataset's detail: the rules, the chooser, and the acts on the originals. */
export function StepDialogs(props: {
  caps: Capabilities;
  dataset: Dataset;
  /** Every dataset, which a vault stays out of. */
  datasets: readonly Dataset[];
  view: StepView | null;
  opened: Opened;
  setOpened: React.Dispatch<React.SetStateAction<Opened>>;
  onChanged: (words: string) => void;
}) {
  const { caps, dataset: d, datasets, view: v, opened, setOpened, onChanged } = props;
  const [look, setLook] = useState<OriginalsLook | null>(null);
  const policy = useKept(policyKept);
  const places = useKept(placesKept);
  const open = opened?.kind ?? null;
  // what an act on the originals would do, read when a dialog that offers one opens
  useEffect(() => {
    if (open === null || !d.trees?.originals || !served(caps, "GET /api/places/{id}/originals")) return;
    let alive = true;
    originalsDoor.look(d.id).then(
      (l) => alive && setLook(l),
      () => alive && setLook(null),
    );
    if (served(caps, "GET /api/pseudonymize/tags")) void policyKept.ensure();
    if (served(caps, "GET /api/places")) void placesKept.ensure();
    return () => {
      alive = false;
    };
  }, [open, caps, d.id, d.trees?.originals]);
  if (opened === null) return null;
  const done = (words: string) => {
    setOpened(null);
    onChanged(words);
  };
  const rows: PlaceRow[] = places.value?.places ?? [];
  switch (opened.kind) {
    case "rules":
      return (
        <RulesDialog
          caps={caps}
          dataset={d}
          policy={policy.value ?? null}
          look={look}
          acts={originalsActs(caps, d)}
          written={v?.copy ?? 0}
          onClose={() => setOpened(null)}
          onSaved={done}
          onTags={() => setOpened({ kind: "tags" })}
          onVault={() => setOpened({ kind: "vault", ask: NOTHING_ASKED })}
          onPurge={() => setOpened({ kind: "purge", ask: NOTHING_TYPED })}
        />
      );
    case "tags":
      return <TagsDialog caps={caps} dataset={d} policy={policy.value ?? null} onClose={() => setOpened(null)} onSaved={done} />;
    case "vault":
      return (
        <VaultDialog
          caps={caps}
          dataset={d}
          look={look}
          places={rows}
          datasets={[...datasets]}
          ask={opened.ask}
          onAsk={(ask) => setOpened((was) => (was?.kind === "vault" ? { kind: "vault", ask } : was))}
          onClose={() => setOpened(null)}
          onQueued={(job, into) => done(`Vaulting the originals of ${d.name} into ${into}: job ${job}.`)}
        />
      );
    case "purge":
      return (
        <PurgeDialog
          caps={caps}
          dataset={d}
          look={look}
          ask={opened.ask}
          onAsk={(ask) => setOpened((was) => (was?.kind === "purge" ? { kind: "purge", ask } : was))}
          onClose={() => setOpened(null)}
          onQueued={(job) => done(`Purging the originals of ${d.name}: job ${job}.`)}
        />
      );
  }
}
