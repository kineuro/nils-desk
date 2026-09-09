// SPDX-License-Identifier: AGPL-3.0-only
// The question page (Wave 4c section 7.3). The editor is a function of the
// stored document; every control is a move the engine offered through
// options, and every edit goes through apply. The desk composes no ask JSON:
// a question starts from a stored id, from text the person authored (the
// draft door repairs and stores it) or from a worked example the pack ships.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  ask,
  chain,
  columnName,
  desk,
  DoorError,
  runOnce,
  type Column,
  type Declaration,
  type Diagnosis,
  type Described,
  type Diff,
  type DocumentHandle,
  type Json,
  type Move,
  type Options,
  type Preview,
} from "./client";

import { documentMoves, edit, editor, firstEmpty, movesForCell, PROJECTIONS, project, sentence, type Edit, type Offer, type Step, type SubStep } from "./editor";
import type { Capabilities } from "../capabilities";
import { Pane } from "../assistant/Pane";
import { holds } from "../sections";

const LAST = "nils-desk.ask.last";

function idFromHash(): number | null {
  const m = /^#ask\/(\d+)$/.exec(location.hash);
  if (m) return Number(m[1]);
  try {
    const kept = localStorage.getItem(LAST);
    return kept ? Number(kept) : null;
  } catch {
    return null;
  }
}

export function Question({ caps }: { caps?: Capabilities }) {
  const [docId, setDocId] = useState<number | null>(idFromHash);
  const [why, setWhy] = useState<string | null>(null);
  // section 7.7: the two values the panes share, the document id and the epoch; the chain so a conversation follows a version
  const [context, setContext] = useState<{ chain: number[]; epoch: number }>({ chain: [], epoch: caps?.engine?.registry.epoch ?? 0 });
  const withAssistant = caps !== undefined && caps.assistant !== null && holds(caps, "assist");
  const open = (id: number) => {
    setWhy(null);
    setDocId(id);
    location.hash = `#ask/${id}`;
    try {
      localStorage.setItem(LAST, String(id));
    } catch {
      // a private window keeps nothing; the hash still carries the id
    }
  };
  const page = docId === null ? <Start onOpen={open} why={why} setWhy={setWhy} /> : <Editor key={docId} docId={docId} onOpen={open} onClose={() => { setDocId(null); location.hash = ""; }} onContext={setContext} />;
  if (!withAssistant || caps === undefined) return page;
  return (
    <div className="panes">
      {page}
      <Pane caps={caps} docId={docId} chain={context.chain} epoch={context.epoch} onOpen={open} />
    </div>
  );
}

/** No document yet: an id, authored text, or one of the pack's worked examples. */
function Start({ onOpen, why, setWhy }: { onOpen: (id: number) => void; why: string | null; setWhy: (w: string | null) => void }) {
  const [id, setId] = useState("");
  const [text, setText] = useState("");
  const [examples, setExamples] = useState<{ question: string; document: Json; note?: string }[]>([]);
  const [drafted, setDrafted] = useState<Diagnosis | null>(null);
  useEffect(() => {
    ask.guide().then((g) => setExamples(g.examples ?? [])).catch(() => setExamples([]));
  }, []);
  const byId = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) return setWhy("A document id is a positive whole number.");
    ask.get(n).then((d) => onOpen(d.document)).catch((err: Error) => setWhy(err.message));
  };
  const draft = () => {
    setWhy(null);
    ask
      .draft(text)
      .then((d) => {
        if (d.document !== null) onOpen(d.document);
        else {
          setDrafted(d.diagnosis);
          setWhy("The text did not validate. The diagnosis below says what to change.");
        }
      })
      .catch((err: Error) => setWhy(err.message));
  };
  const fromExample = (document: Json) => ask.store(document).then((d) => onOpen(d.document)).catch((err: Error) => setWhy(err.message));
  return (
    <section className="ask start">
      <h1>Ask</h1>
      <p>A question is a stored document with a version chain. Open one, write one, or start from an example the pack ships.</p>
      {why && <p className="warn">{why}</p>}
      <form onSubmit={byId} className="row">
        <label>
          Document <input value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" placeholder="id" />
        </label>
        <button type="submit">Open</button>
      </form>
      <details open={text.length > 0}>
        <summary>Write the document</summary>
        <p>YAML or JSON in the ask grammar. The engine repairs what it can, adds nothing, and stores the document when it validates.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} spellCheck={false} />
        <div className="row">
          <button type="button" onClick={draft} disabled={text.trim().length === 0}>Validate and store</button>
        </div>
        {drafted && <DiagnosisView d={drafted} />}
      </details>
      {examples.length > 0 && (
        <div>
          <h2>Worked examples</h2>
          <ul className="examples">
            {examples.map((x) => (
              <li key={x.question}>
                <button type="button" onClick={() => fromExample(x.document)}>{x.question}</button>
                {x.note && <span className="note">{x.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

interface Version extends DocumentHandle {
  /** What changed against the parent, from the diff door; null for the root or when the door refused. */
  changes: NonNullable<Diff["changes"]> | null;
}

/** The editor over one stored document. Keyed by the id: a new version is a fresh editor. */
function Editor({ docId, onOpen, onClose, onContext }: { docId: number; onOpen: (id: number) => void; onClose: () => void; onContext?: (c: { chain: number[]; epoch: number }) => void }) {
  const [doc, setDoc] = useState<DocumentHandle | null>(null);
  const [opts, setOpts] = useState<Record<string, Options>>({});
  const [openSet, setOpenSet] = useState<string | null>(null);
  const [described, setDescribed] = useState<Described | null>(null);
  const [explained, setExplained] = useState<{ sqlite: string; postgres: string } | null>(null);
  const [dialect, setDialect] = useState<"sqlite" | "postgres">("sqlite");
  const [showSql, setShowSql] = useState(false);
  const [preview, setPreview] = useState<{ of: number; p: Preview } | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [diffPick, setDiffPick] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const [diffed, setDiffed] = useState<{ a: number; b: number; d: Diff } | null>(null);
  const [compare, setCompare] = useState<Compared | null>(null);
  const [projection, setProjection] = useState<string | null>(null);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cell, setCell] = useState<{ column: string; value: unknown; offers: Offer[] } | null>(null);
  const [ran, setRan] = useState<{ handle: number; row_count: number; content_hash: string } | null>(null);
  const previousCount = useRef<Map<number, number>>(new Map());

  // the document and the read-only panels, once per version
  useEffect(() => {
    let alive = true;
    const fail = (e: Error) => alive && setWhy(e.message);
    ask.get(docId).then((d) => alive && setDoc(d)).catch(fail);
    ask.describe(docId).then((d) => alive && setDescribed(d)).catch(fail);
    ask.explain(docId).then((x) => alive && setExplained({ sqlite: x.sqlite, postgres: x.postgres })).catch(() => alive && setExplained(null));
    ask.diagnose(docId).then((d) => alive && setDiagnosis(d)).catch(fail);
    chain(docId)
      .then(async (list) => {
        const out: Version[] = [];
        for (let i = 0; i < list.length; i++) {
          const v = list[i];
          let changes: Version["changes"] = null;
          if (i > 0) {
            try {
              const d = await ask.diff({ document_id: list[i - 1].document }, { document_id: v.document });
              changes = d.changes ?? [];
            } catch {
              changes = null;
            }
          }
          out.push({ ...v, changes });
        }
        if (alive) setVersions(out);
      })
      .catch(fail);
    return () => {
      alive = false;
    };
  }, [docId]);

  // the preview: fetched once per version, then it goes stale on purpose
  const refreshPreview = useCallback(() => {
    ask
      .preview(docId)
      .then((p) => {
        setPreview({ of: docId, p });
        const count = p.level === "count" && typeof p.rows[0]?.[0] === "number" ? (p.rows[0][0] as number) : p.rows.length;
        const before = previousCount.current.get(docId - 1) ?? previousCount.current.get(doc?.parent ?? -1);
        previousCount.current.set(docId, count);
        if (count === 0 || (before !== undefined && count < before)) setDrawer(true);
      })
      .catch((e: Error) => setWhy(e.message));
  }, [docId, doc?.parent]);
  useEffect(() => {
    if (!preview) refreshPreview();
  }, [preview, refreshPreview]);

  const steps: Step[] = useMemo(() => (doc ? editor(doc.ask, opts) : []), [doc, opts]);

  // what the assistant pane shares with this page: the chain of this document and the epoch the options carried
  useEffect(() => {
    if (!onContext) return;
    const epoch = Object.values(opts)[0]?.epoch ?? 0;
    onContext({ chain: (versions ?? []).map((v) => v.document), epoch });
  }, [onContext, opts, versions]);

  // the open step: the first empty one, and its options
  useEffect(() => {
    if (doc && openSet === null) setOpenSet(firstEmpty(steps));
  }, [doc, steps, openSet]);
  useEffect(() => {
    if (!openSet || opts[openSet]) return;
    let alive = true;
    ask.options(docId, openSet).then((o) => alive && setOpts((prev) => ({ ...prev, [openSet]: o }))).catch((e: Error) => alive && setWhy(e.message));
    return () => {
      alive = false;
    };
  }, [docId, openSet, opts]);

  /** Every edit, from a chip, a cell or a proposal, goes through apply against the token the options carried. */
  const apply = useCallback(
    async (origin: Edit["origin"], offer: Offer) => {
      const o = opts[offer.set];
      if (!o) return setWhy(`The options of ${offer.set} are not here yet.`);
      const line = edit(origin, docId, offer);
      setBusy(true);
      setWhy(null);
      try {
        const a = await ask.apply(docId, o, offer.set, [{ move_id: offer.move.id, args: offer.args }]);
        setEdits((prev) => [...prev, line]);
        // the desk's own record of lineage, so a result of the parent can be told stale (section 7.4)
        if (a.document !== a.parent) desk.lineage(a.document, a.parent).catch(() => undefined);
        onOpen(a.document);
      } catch (e) {
        if (e instanceof DoorError && e.stale) {
          try {
            const fresh = await ask.options(docId, offer.set);
            setOpts((prev) => ({ ...prev, [offer.set]: fresh }));
            setWhy("The options had gone stale and were fetched again. Apply once more.");
          } catch (e2) {
            setWhy((e2 as Error).message);
          }
        } else setWhy((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [docId, opts, onOpen],
  );

  const run = () => {
    if (!doc) return;
    const epoch = opts[openSet ?? ""]?.epoch ?? 0;
    runOnce(docId, epoch)
      .then((r) => {
        setRan({ handle: r.handle, row_count: r.row_count, content_hash: r.content_hash });
        desk.record(r.handle, docId).catch(() => undefined);
      })
      .catch((e: Error) => setWhy(e.message));
  };

  const onCell = (column: string, value: unknown) => {
    const offers = movesForCell(Object.values(opts), column, value);
    setCell({ column, value, offers });
  };

  const showDiff = () => {
    if (diffPick.a === null || diffPick.b === null) return;
    const { a, b } = diffPick;
    ask.diff({ document_id: a }, { document_id: b }).then((d) => setDiffed({ a, b, d })).catch((e: Error) => setWhy(e.message));
  };

  if (!doc) return <section className="ask state">{why ?? `Reading document ${docId}`}</section>;
  const title = typeof doc.ask.name === "string" ? doc.ask.name : `document ${docId}`;
  const docOpts = openSet ? opts[openSet] ?? null : null;

  return (
    <section className="ask">
      <header className="ask-head">
        <div>
          <h1>{title}</h1>
          <p className="meta">
            document {docId}
            {doc.parent !== null && <> from {doc.parent}</>}
            {doc.principal && <> by {doc.principal}</>}
            {doc.created_at && <> at {doc.created_at}</>}
          </p>
        </div>
        <div className="row">
          <button type="button" onClick={run} disabled={busy}>Run</button>
          <button type="button" onClick={() => setShowSql((s) => !s)}>{showSql ? "Hide SQL" : "SQL"}</button>
          <button type="button" onClick={() => setDrawer((d) => !d)}>{drawer ? "Hide diagnosis" : "Diagnose"}</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </header>
      {why && <p className="warn">{why}</p>}
      {ran && (
        <p className="ran">
          Ran as handle {ran.handle}: {ran.row_count} rows, content {ran.content_hash.slice(0, 12)}. Presenting it again reads the handle.
        </p>
      )}

      {described && <DeclarationBlock d={described.declaration} described={described} />}

      {showSql && explained && (
        <div className="panel sql">
          <div className="row">
            <strong>Compiled SQL</strong>
            <button type="button" className={dialect === "sqlite" ? "on" : ""} onClick={() => setDialect("sqlite")}>sqlite</button>
            <button type="button" className={dialect === "postgres" ? "on" : ""} onClick={() => setDialect("postgres")}>postgres</button>
          </div>
          <pre>{explained[dialect]}</pre>
        </div>
      )}

      {drawer && diagnosis && <div className="panel"><DiagnosisView d={diagnosis} /></div>}

      <ol className="steps">
        {steps.map((s) => (
          <StepView
            key={s.set}
            step={s}
            open={s.set === openSet}
            onOpen={() => setOpenSet(s.set)}
            options={opts[s.set] ?? null}
            funnel={diagnosis?.funnel.filter((f) => f.set === s.set) ?? []}
            grain={s.grain}
            onApply={(offer) => apply("chip", offer)}
            busy={busy}
            projection={projection}
            setProjection={setProjection}
          />
        ))}
      </ol>

      {docOpts && (
        <div className="panel">
          <h2>The document</h2>
          <MoveList moves={documentMoves(docOpts)} set={openSet ?? ""} grain="" onApply={(offer) => apply("chip", offer)} busy={busy} />
        </div>
      )}

      <div className="panel">
        <div className="row">
          <h2>Preview</h2>
          {preview && preview.of !== docId && <span className="stale">stale: made for document {preview.of}</span>}
          <button type="button" onClick={refreshPreview}>Refresh</button>
        </div>
        {preview ? (
          <PreviewTable p={preview.p} projection={projection} onCell={onCell} />
        ) : (
          <p>Reading ten rows</p>
        )}
        {cell && (
          <div className="offers">
            <p>
              {cell.column} = {String(cell.value)}:{" "}
              {cell.offers.length === 0 ? "no move takes this value here; open the set that carries the column" : "one of these moves takes it"}
            </p>
            <ul>
              {cell.offers.map((o) => (
                <li key={`${o.set}-${o.move.id}`}>
                  <button type="button" disabled={busy} onClick={() => { setCell(null); apply("cell", o); }}>
                    {o.set}: {sentence(o.move, o.args)}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setCell(null)}>Dismiss</button>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Versions</h2>
        {versions ? (
          <ol className="versions">
            {versions.map((v) => (
              <li key={v.document} className={v.document === docId ? "on" : ""}>
                <button type="button" onClick={() => onOpen(v.document)}>{v.document}</button>
                <span>{v.principal ?? "unknown"}</span>
                <span className="when">{v.created_at ?? ""}</span>
                <span className="changed">
                  {v.changes === null ? (v.parent === null ? "the root" : "diff unavailable") : v.changes.length === 0 ? "no change" : v.changes.map((c) => `${c.set}.${c.part} ${c.kind}`).join("; ")}
                </span>
                <label>
                  <input type="radio" name="diff-a" checked={diffPick.a === v.document} onChange={() => setDiffPick((p) => ({ ...p, a: v.document }))} /> a
                </label>
                <label>
                  <input type="radio" name="diff-b" checked={diffPick.b === v.document} onChange={() => setDiffPick((p) => ({ ...p, b: v.document }))} /> b
                </label>
              </li>
            ))}
          </ol>
        ) : (
          <p>Reading the chain</p>
        )}
        <div className="row">
          <button type="button" onClick={showDiff} disabled={diffPick.a === null || diffPick.b === null}>Diff a against b</button>
        </div>
        {diffed && <DiffView a={diffed.a} b={diffed.b} d={diffed.d} />}
      </div>

      <Compare docId={docId} result={compare} setResult={setCompare} setWhy={setWhy} />

      {edits.length > 0 && (
        <div className="panel">
          <h2>Edits this session</h2>
          <ul className="edits">
            {edits.map((e, i) => (
              <li key={`${e.document}-${i}`}>
                <code>{e.origin}</code> on {e.document}, {e.set}: {e.sentence}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DeclarationBlock({ d, described }: { d: Declaration; described: Described }) {
  return (
    <div className="declaration">
      <dl>
        <dt>grain</dt><dd>{d.grain}</dd>
        {d.session_scheme && <><dt>session scheme</dt><dd>{d.session_scheme.name} {d.session_scheme.digest.slice(0, 8)}</dd></>}
        {d.membership && <><dt>membership</dt><dd>{d.membership}</dd></>}
        {d.key_namespace && <><dt>keys</dt><dd>{d.key_namespace}</dd></>}
        {d.pick_rule && <><dt>pick</dt><dd>{d.pick_rule}</dd></>}
        {d.denominator && <><dt>denominator</dt><dd>{d.denominator}</dd></>}
        {d.disclosure && <><dt>disclosure</dt><dd>{d.disclosure}</dd></>}
      </dl>
      {described.answer && <p className="answer">{described.answer}</p>}
      {(described.conventions ?? []).length > 0 && (
        <details>
          <summary>Conventions</summary>
          <ul>{described.conventions.map((c) => <li key={c}>{c}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

function DiagnosisView({ d }: { d: Diagnosis }) {
  return (
    <div className="diagnosis">
      <p>
        {d.valid ? "Valid" : "Not valid"}; cost {d.cost?.class ?? "unknown"} over {d.cost?.sets ?? 0} sets.
        {d.zero_rows && <> Zero rows: {d.zero_rows}.</>}
      </p>
      {d.issues.length > 0 && (
        <ul className="issues">
          {d.issues.map((i) => (
            <li key={`${i.code}-${i.path}`}>
              <code>{i.path}</code> {i.message}. <em>{i.next}</em>
            </li>
          ))}
        </ul>
      )}
      {d.warnings.length > 0 && <ul className="warnings">{d.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      {d.funnel.length > 0 && (
        <table className="funnel">
          <thead><tr><th>set</th><th>stage</th><th>rows</th><th>subjects</th></tr></thead>
          <tbody>
            {d.funnel.map((f, i) => (
              <tr key={`${f.set}-${i}`} className={f.on_path ? "" : "off"}>
                <td>{f.set}</td><td>{f.stage}</td><td className="num">{f.rows}</td><td className="num">{f.subjects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {d.drops.length > 0 && <p>{d.drops.length} drops; {d.unresolved.length} unresolved; {d.coarse.length} coarse.</p>}
    </div>
  );
}

function StepView({ step, open, onOpen, options, funnel, grain, onApply, busy, projection, setProjection }: {
  step: Step;
  open: boolean;
  onOpen: () => void;
  options: Options | null;
  funnel: { stage: string; rows: number; subjects: number }[];
  grain: string;
  onApply: (offer: Offer) => void;
  busy: boolean;
  projection: string | null;
  setProjection: (p: string | null) => void;
}) {
  const last = funnel[funnel.length - 1];
  return (
    <li className={`step ${open ? "open" : ""}`}>
      <div className="step-head" onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()} role="button" tabIndex={0}>
        <strong>{step.set}</strong> <span className="grain">{step.grain}s {step.source}</span>
        {step.answers && <span className="tag">answer</span>}
        {step.kept && <span className="tag">kept</span>}
        {last && <span className="count">{last.rows} rows, {last.subjects} subjects</span>}
      </div>
      {open && (
        <div className="step-body">
          {step.sentence && <p className="sentence">{step.sentence}</p>}
          {!options && <p>Reading the options</p>}
          {step.parts.filter((p) => p.visible).map((p) => (
            <SubStepView key={p.part} part={p} set={step.set} grain={grain} where={step.where} clauses={step.clauses[p.part] ?? []} source={step.source} onApply={onApply} busy={busy} projection={projection} setProjection={setProjection} />
          ))}
          {funnel.length > 0 && (
            <table className="funnel small">
              <tbody>
                {funnel.map((f, i) => (
                  <tr key={i}><td>{f.stage}</td><td className="num">{f.rows}</td><td className="num">{f.subjects}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}

function clauseText(c: unknown): string {
  if (!Array.isArray(c)) return JSON.stringify(c);
  const [op, , lhs, rhs] = c as [string, Json, unknown, unknown];
  const term = (t: unknown): string => {
    if (Array.isArray(t) && t.length === 3 && typeof t[0] === "string") {
      const [k, , n] = t as [string, Json, unknown];
      return k === "param" ? `{${n}}` : String(n);
    }
    return Array.isArray(t) ? t.map(term).join(", ") : String(t);
  };
  return `${term(lhs)} ${op} ${rhs === undefined ? "" : term(rhs)}`.trim();
}

function SubStepView({ part, set, grain, where, clauses, source, onApply, busy, projection, setProjection }: {
  part: SubStep;
  set: string;
  grain: string;
  where: unknown[];
  clauses: string[];
  source: string;
  onApply: (offer: Offer) => void;
  busy: boolean;
  projection: string | null;
  setProjection: (p: string | null) => void;
}) {
  return (
    <div className={`part ${part.active ? "active" : ""} ${part.valid ? "valid" : ""}`}>
      <h3>{part.part}</h3>
      {part.part === "source" && <p className="clause">{source}</p>}
      {clauses.length > 0 && (
        <ul className="chips">
          {clauses.map((c, i) => <li key={i}><span className="chip">{c}</span></li>)}
        </ul>
      )}
      {part.part === "where" && <WhereChips set={set} part={part} where={where} onApply={onApply} busy={busy} />}
      {part.part === "out" && (
        <label className="projection">
          Columns{" "}
          <select value={projection ?? ""} onChange={(e) => setProjection(e.target.value || null)}>
            <option value="">as the engine answers</option>
            {Object.keys(PROJECTIONS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
      )}
      <MoveList moves={part.moves} set={set} grain={grain} onApply={onApply} busy={busy} />
      {part.revert && (
        <button type="button" className="revert" disabled={busy} onClick={() => onApply({ set, move: part.revert!.move, args: part.revert!.args })}>
          Revert: {sentence(part.revert.move, part.revert.args)}
        </button>
      )}
    </div>
  );
}

/** The where clauses as chips; a chip click offers the drop of that clause, the same edit shape as any other. */
function WhereChips({ set, part, where, onApply, busy }: { set: string; part: SubStep; where: unknown[]; onApply: (o: Offer) => void; busy: boolean }) {
  const remove = part.moves.find((m) => m.kind === "remove_where");
  if (!part.active || where.length === 0) return null;
  return (
    <ul className="chips">
      {where.map((c, i) => (
        <li key={i}>
          <span className="chip">{clauseText(c)}</span>
          {remove && (
            <button type="button" className="drop" disabled={busy} title="drop this clause" onClick={() => onApply({ set, move: remove, args: { index: i } })}>
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One form per move the engine offered: the template, a control per hole. */
function MoveList({ moves, set, grain, onApply, busy }: { moves: Move[]; set: string; grain: string; onApply: (o: Offer) => void; busy: boolean }) {
  if (moves.length === 0) return null;
  return (
    <ul className="moves">
      {moves.map((m) => (
        <li key={m.id}>
          <MoveForm move={m} set={set} grain={grain} onApply={onApply} busy={busy} />
        </li>
      ))}
    </ul>
  );
}

function coerce(type: string, raw: string): unknown {
  if (raw === "") return undefined;
  if (type === "int" || type === "index") return Number(raw);
  if (type === "bool") return raw === "true";
  if (type === "value" && /^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function MoveForm({ move, set, grain, onApply, busy }: { move: Move; set: string; grain: string; onApply: (o: Offer) => void; busy: boolean }) {
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [samples, setSamples] = useState<string[]>([]);
  const field = raw[move.holes.find((h) => h.type === "field")?.name ?? ""];
  useEffect(() => {
    if (!field || !grain) return setSamples([]);
    let alive = true;
    ask.values(grain, field)
      .then((v) => alive && setSamples((v.items ?? []).map(([value]) => String(value))))
      .catch(() => alive && setSamples([]));
    return () => {
      alive = false;
    };
  }, [field, grain]);
  const args: Json = {};
  let complete = true;
  for (const h of move.holes) {
    const v = coerce(h.type, raw[h.name] ?? "");
    if (v === undefined) {
      if (!h.optional) complete = false;
    } else args[h.name] = v;
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (complete) onApply({ set, move, args });
  };
  const pieces = move.template.split(/(\{\w+\})/g);
  const listId = `values-${set}-${move.id}`;
  return (
    <form className="move" onSubmit={submit}>
      {pieces.map((piece, i) => {
        const m = /^\{(\w+)\}$/.exec(piece);
        if (!m) return <span key={i}>{piece}</span>;
        const hole = move.holes.find((h) => h.name === m[1]);
        if (!hole) return <span key={i}>{piece}</span>;
        const value = raw[hole.name] ?? "";
        const onChange = (v: string) => setRaw((prev) => ({ ...prev, [hole.name]: v }));
        if (hole.fillers && hole.fillers.length > 0) {
          return (
            <select key={i} value={value} onChange={(e) => onChange(e.target.value)} aria-label={hole.name}>
              <option value="">{hole.optional ? `(${hole.name})` : hole.name}</option>
              {hole.fillers.map((f) => <option key={String(f)} value={String(f)}>{String(f)}</option>)}
            </select>
          );
        }
        return (
          <input
            key={i}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={hole.optional ? `${hole.name}, optional` : hole.name}
            aria-label={hole.name}
            inputMode={hole.type === "int" ? "numeric" : undefined}
            list={hole.type === "value" && samples.length > 0 ? listId : undefined}
            size={Math.max(6, hole.name.length + 2)}
          />
        );
      })}
      {samples.length > 0 && <datalist id={listId}>{samples.map((s) => <option key={s} value={s} />)}</datalist>}
      <button type="submit" disabled={busy || !complete}>Apply</button>
    </form>
  );
}

function PreviewTable({ p, projection, onCell }: { p: Preview; projection: string | null; onCell: (column: string, value: unknown) => void }) {
  const names = p.columns.map(columnName);
  const keep = project(names, projection);
  const idx = keep.map((k) => names.indexOf(k));
  if (p.rows.length === 0) return <p>No rows. The diagnosis says where they went.</p>;
  return (
    <div className="scroll">
      <table className="preview">
        <thead><tr>{keep.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {p.rows.map((r, ri) => (
            <tr key={ri}>
              {idx.map((ci) => (
                <td key={ci} className={typeof r[ci] === "number" ? "num" : ""}>
                  <button type="button" className="cell" onClick={() => onCell(names[ci], r[ci])}>{r[ci] === null ? "" : String(r[ci])}</button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="meta">{p.level} level{p.truncated ? ", truncated" : ""}; a cell click offers the moves its value can fill.</p>
    </div>
  );
}

function DiffView({ a, b, d }: { a: number; b: number; d: Diff }) {
  if (d.refused) return <p className="warn">{d.refused}</p>;
  if (d.same) return <p>Documents {a} and {b} are the same canonical document.</p>;
  return (
    <table className="diff">
      <thead><tr><th>set</th><th>part</th><th>kind</th><th>before</th><th>after</th></tr></thead>
      <tbody>
        {(d.changes ?? []).map((c, i) => (
          <tr key={i}>
            <td>{c.set}</td><td>{c.part}</td><td>{c.kind}</td>
            <td><code>{c.before === undefined || c.before === null ? "" : clauseOrJson(c.before)}</code></td>
            <td><code>{c.after === undefined || c.after === null ? "" : clauseOrJson(c.after)}</code></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function clauseOrJson(v: unknown): string {
  return Array.isArray(v) && typeof v[0] === "string" && v.length === 4 ? clauseText(v) : JSON.stringify(v);
}

interface Compared {
  left: { id: number; kind: "document" | "handle"; count: string; declaration: Declaration | null };
  right: { id: number; kind: "document" | "handle"; count: string; declaration: Declaration | null };
  diff: Diff;
}

/** Compare: a command over two handles or two documents. */
function Compare({ docId, result, setResult, setWhy }: { docId: number; result: Compared | null; setResult: (c: Compared | null) => void; setWhy: (w: string | null) => void }) {
  const [kind, setKind] = useState<"document" | "handle">("document");
  const [left, setLeft] = useState(String(docId));
  const [right, setRight] = useState("");
  const side = async (id: number): Promise<Compared["left"]> => {
    if (kind === "handle") {
      const h = (await ask.handle(id)) as { row_count?: number; declaration?: Declaration };
      return { id, kind, count: `${h.row_count ?? "?"} rows`, declaration: h.declaration ?? null };
    }
    const p = await ask.preview(id, 1);
    const count = p.level === "count" && p.rows[0] ? `${p.rows[0].join(" / ")} (${p.columns.map(columnName).join(" / ")})` : `${p.rows.length}${p.truncated ? "+" : ""} rows`;
    return { id, kind, count, declaration: p.declaration };
  };
  const go = async () => {
    const a = Number(left);
    const b = Number(right);
    if (!Number.isInteger(a) || !Number.isInteger(b)) return setWhy("Compare takes two ids.");
    try {
      const key = kind === "handle" ? "handle" : "document_id";
      const [l, r, d] = await Promise.all([side(a), side(b), ask.diff({ [key]: a } as never, { [key]: b } as never)]);
      setResult({ left: l, right: r, diff: d });
    } catch (e) {
      setWhy((e as Error).message);
    }
  };
  return (
    <div className="panel">
      <h2>Compare</h2>
      <div className="row">
        <select value={kind} onChange={(e) => setKind(e.target.value as "document" | "handle")} aria-label="what to compare">
          <option value="document">documents</option>
          <option value="handle">handles</option>
        </select>
        <input value={left} onChange={(e) => setLeft(e.target.value)} inputMode="numeric" size={6} aria-label="left id" />
        <input value={right} onChange={(e) => setRight(e.target.value)} inputMode="numeric" size={6} aria-label="right id" placeholder="id" />
        <button type="button" onClick={go} disabled={!right}>Compare</button>
      </div>
      {result && (
        <div className="compare">
          {[result.left, result.right].map((s) => (
            <div key={`${s.kind}-${s.id}`}>
              <h3>{s.kind} {s.id}</h3>
              <p>{s.count}</p>
              {s.declaration && (
                <dl>
                  <dt>grain</dt><dd>{s.declaration.grain}</dd>
                  {s.declaration.membership && <><dt>membership</dt><dd>{s.declaration.membership}</dd></>}
                  {s.declaration.disclosure && <><dt>disclosure</dt><dd>{s.declaration.disclosure}</dd></>}
                </dl>
              )}
            </div>
          ))}
          <div className="wide"><DiffView a={result.left.id} b={result.right.id} d={result.diff} /></div>
        </div>
      )}
    </div>
  );
}

export { clauseText };
export type { Column };
