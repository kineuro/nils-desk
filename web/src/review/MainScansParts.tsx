// SPDX-License-Identifier: AGPL-3.0-only
// The parts of the Main scans page (record 55, decision 6), drawn as the
// approved canvas draws them in the desk's design language: a kind as a
// value tag in its colour (a thin frame, a 3px left bar and the tint, never
// a glyph), the five numbers with the ones a way of keeping alike keeps and
// gives up marked, the kinds, where they come from, the series, visit by
// visit, and the group's subjects as cards or every subject as a strip. A
// layer (body region, body part or post-contrast) colours the visits by what
// their scans are, in the same language: the scan taken's value filled, the
// value most of a visit's scans carry outlined where it takes none.

import { Fragment, type CSSProperties } from "react";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import {
  alsoWords,
  besideField,
  columnTitle,
  groupTitle,
  keptBy,
  kindChanges,
  LAYERS,
  layerName,
  layerSlot,
  layerWord,
  litOf,
  numbersOf,
  othersOf,
  pct,
  pctWords,
  runOf,
  sameGroup,
  sharedWords,
  stepWord,
  stripDrawn,
  stripKinds,
  visitDrawn,
  visitLayerWords,
  type Columns,
  type Group,
  type KeepAlike,
  type Layer,
  type MapAnswer,
  type MapLayer,
  type MapSubject,
  type MapVisit,
  type Order,
  type Strips,
  type SubjectsPage,
  type VisitLayer,
} from "./mainScans";

const n = (v: number) => v.toLocaleString("en-US");
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`;

export type Slot = (kind: string | null) => number | null;

/** A kind, framed in its colour; "none" for no pick, dashed; struck out where the rules leave it out. */
export function KindTag({ kind, slot, off = false }: { kind: string | null; slot: Slot; off?: boolean }) {
  const s = kind === null ? null : slot(kind);
  const cls = ["value-tag", "ms-kind", kind === null ? "none" : s === null ? "plain" : "", off ? "off" : ""].filter(Boolean).join(" ");
  return (
    <span className={cls} title={kind ?? "none"} {...(s !== null ? { "data-slot": s } : {})}>
      {kind ?? "none"}
    </span>
  );
}

/** The five numbers, the ones the way of keeping alike keeps marked with the brand bar and the one it gives up with the caution bar. */
export function Numbers({ map, role, keep }: { map: MapAnswer; role: string; keep: KeepAlike }) {
  const { kept, given } = keptBy(keep);
  return (
    <div className="ms-numbers">
      {numbersOf(map.metrics, role).map((l) => {
        const mark = kept.includes(l.key) ? "kept" : given.includes(l.key) ? "given" : null;
        return (
          <div key={l.key} className={mark ? `ms-number ${mark}` : "ms-number"}>
            <span className="eyebrow">{l.label}</span>
            <span className="ms-value">{pctWords(l.value)}</span>
            <span className="ms-sub">{l.sub}</span>
            {mark && <span className="ms-note">{mark === "kept" ? "kept" : "given up"}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** The kinds the data holds for the role: faint the visits that have one, solid the visits the rules take it in. */
export function KindsBox({ map, slot, off }: { map: MapAnswer; slot: Slot; off: (kind: string) => boolean }) {
  const most = Math.max(1, ...map.kinds.map((k) => k.visits_with));
  return (
    <section className="ms-box ms-kinds" aria-label="The kinds">
      <div className="ms-box-head">
        <h3 className="eyebrow">The kinds</h3>
        <Hint text="Faint: visits that have the kind. Solid: visits where the rules take it. Struck out: the rules leave it out." />
      </div>
      {map.kinds.length === 0 && <p className="ms-none">No scan of this role here.</p>}
      {map.kinds.map((k) => {
        const s = slot(k.key);
        return (
          <div key={k.key} className="ms-kind-row">
            <KindTag kind={k.key} slot={slot} off={off(k.key) || !k.allowed} />
            <span className="ms-bar" aria-hidden="true" {...(s !== null ? { "data-slot": s } : {})}>
              <i className="has" style={{ width: `${pct(k.visits_with, most) ?? 0}%` }} />
              <i className="taken" style={{ width: `${pct(k.visits_taken, most) ?? 0}%` }} />
            </span>
            <span className="ms-count">
              {n(k.visits_taken)} taken of {n(k.visits_with)}
            </span>
          </div>
        );
      })}
    </section>
  );
}

/** Visits by the kind taken, per scanner or dataset; a cell opens its subjects. A visit whose scan is in several datasets is in each of their columns, which one line says. */
export function WhereBox({ map, slot, group, onGroup, columns, onColumns }: { map: MapAnswer; slot: Slot; group: Group; onGroup: (g: Group) => void; columns: Columns; onColumns: ((c: Columns) => void) | null }) {
  const cols = map.columns;
  const shared = sharedWords(map.shared_visits);
  return (
    <section className="ms-box ms-where" aria-label="Where the kinds come from">
      <div className="ms-box-head">
        <h3 className="eyebrow grow">Where the kinds come from</h3>
        {onColumns && (
          <div className="chips" role="group" aria-label="Columns">
            {(
              [
                ["scanner", "By scanner"],
                ["dataset", "By dataset"],
              ] as const
            ).map(([c, words]) => (
              <button key={c} type="button" className={columns === c ? "opt on" : "opt"} aria-pressed={columns === c} onClick={() => onColumns(c)}>
                {words}
              </button>
            ))}
          </div>
        )}
        <Hint text={`Visits by the kind taken, per ${columns === "dataset" ? "dataset" : "scanner"} and field strength. A cell opens its subjects.`} />
      </div>
      {shared && cols.length > 0 && <p className="ms-shared">{shared}</p>}
      {cols.length === 0 ? (
        <p className="ms-none">No visit here.</p>
      ) : (
        <div className="ms-matrix-wrap">
          <div className="ms-matrix" style={{ "--cols": cols.length } as CSSProperties}>
            <span />
            {cols.map((c) => (
              <span key={c.key} className="ms-col" title={columnTitle(c)}>
                {c.key}
              </span>
            ))}
            {map.matrix.map((row) => (
              <Fragment key={row.kind ?? ""}>
                <KindTag kind={row.kind} slot={slot} />
                {row.cells.map((v, i) => {
                  const col = cols[i].key;
                  if (v === 0) return <span key={col} className="ms-cell empty" />;
                  const here: Group = { by: "cell", kind: row.kind, column: col };
                  const on = sameGroup(group, here);
                  const s = slot(row.kind);
                  return (
                    <button key={col} type="button" className={on ? "ms-cell on" : "ms-cell"} aria-pressed={on} aria-label={`${plural(v, "visit", "visits")} at ${col} take ${row.kind ?? "nothing"}`} onClick={() => onGroup(here)}>
                      <span className="num">{n(v)}</span>
                      <span className="ms-cellbar" {...(s !== null ? { "data-slot": s } : {})}>
                        <i className={row.kind === null ? "none" : undefined} style={{ width: `${pct(v, cols[i].visits || v) ?? 0}%` }} />
                      </span>
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** The kinds a subject's visits take, in order, repeats folded; most common first. */
export function SeriesBox({ map, slot, group, onGroup }: { map: MapAnswer; slot: Slot; group: Group; onGroup: (g: Group) => void }) {
  const repeat = map.metrics.series_complete.of;
  return (
    <section className="ms-box ms-series" aria-label="Series">
      <div className="ms-box-head">
        <h3 className="eyebrow">Series</h3>
        <span className="ms-head-line">
          {n(repeat)} with repeat visits · {n(map.single_visit_subjects)} with one
        </span>
        <Hint text="The kinds a subject's visits take, in order, repeats folded. Most common first." />
      </div>
      {map.series.length === 0 && <p className="ms-none">No subject has repeat visits.</p>}
      {map.series.slice(0, 8).map((s) => {
        const here: Group = { by: "series", steps: s.steps };
        const on = sameGroup(group, here);
        const words = s.steps.map(stepWord).join(" then ");
        return (
          <div key={words} className="ms-series-row">
            <span className="ms-steps">
              {s.steps.map((k, i) => (
                <Fragment key={i}>
                  {i > 0 && <span className="ms-then">then</span>}
                  <KindTag kind={k} slot={slot} />
                </Fragment>
              ))}
              {s.steps.length === 1 && <span className="ms-then">at every visit</span>}
            </span>
            <span className="ms-n">{plural(s.subjects, "subject", "subjects")}</span>
            <button type="button" className={on ? "opt on" : "opt"} aria-pressed={on} aria-label={`Show the ${plural(s.subjects, "subject", "subjects")} whose series is ${words}`} onClick={() => onGroup(here)}>
              Show
            </button>
          </div>
        );
      })}
    </section>
  );
}

/** The kinds taken at each subject's first, second, third visit and on. */
export function ByVisitBox({ map, slot, palette }: { map: MapAnswer; slot: Slot; palette: string[] }) {
  const seen = new Set(map.by_visit.flatMap((b) => b.kinds.filter((k) => k.visits > 0).map((k) => k.kind)));
  const legend = [...palette.filter((k) => seen.has(k)), ...[...seen].filter((k): k is string => k !== null && !palette.includes(k))];
  return (
    <section className="ms-box ms-byvisit" aria-label="Visit by visit">
      <div className="ms-box-head">
        <h3 className="eyebrow">Visit by visit</h3>
        <Hint text="The kinds taken at each subject's first, second, third visit and on. A band that grows or shrinks is subjects switching." />
      </div>
      {map.by_visit.map((b) => (
        <div key={b.visit} className="ms-visit-row">
          <span>{b.visit >= 5 ? "Visit 5+" : `Visit ${b.visit}`}</span>
          <span className="ms-band">
            {b.kinds
              .filter((k) => k.visits > 0)
              .map((k) => {
                const s = slot(k.kind);
                return <i key={k.kind ?? ""} className={k.kind === null ? "none" : undefined} title={`${k.kind ?? "none"}: ${plural(k.visits, "visit", "visits")}`} style={{ flexGrow: k.visits }} {...(s !== null ? { "data-slot": s } : {})} />;
              })}
          </span>
          <span className="ms-n small">{plural(b.visits, "visit", "visits")}</span>
        </div>
      ))}
      {legend.length + (seen.has(null) ? 1 : 0) > 0 && (
        <div className="ms-legend">
          {legend.map((k) => (
            <KindTag key={k} kind={k} slot={slot} />
          ))}
          {seen.has(null) && <KindTag kind={null} slot={slot} />}
        </div>
      )}
    </section>
  );
}

const CARDS_HINT = "Visits as columns, 24 subjects a page. A visit whose head stands out takes another kind than the visit with a pick before it. A visit opens its pick.";
const stripsHint = (columns: Columns, layer: Layer | null = null) =>
  layer
    ? `Every subject, by the ${columns === "dataset" ? "dataset" : "scanner"} most of its visits are at, longest series first. The group you opened is lit. One cell a visit, in the colour of its ${layerName(layer).toLowerCase()}: filled for the scan taken, outlined for what most of its scans are where none is taken.`
    : `Every subject, by the ${columns === "dataset" ? "dataset" : "scanner"} most of its visits are at, longest series first. The group you opened is lit. One cell a visit; a marked left edge is a change of kind.`;
const REDRAWN_HINT = "An outlined visit: your changed rules pick it differently.";

export interface GroupBoxProps {
  /** The columns the map is drawn by, which the strips are grouped by too. */
  columns: Columns;
  /** A draft is shown, so a visit it picks otherwise is outlined. */
  draft: boolean;
  group: Group;
  onGroup: (g: Group) => void;
  view: "cards" | "strips";
  onView: (v: "cards" | "strips") => void;
  order: Order;
  onOrder: (o: Order) => void;
  page: number;
  onPage: (p: number) => void;
  subjects: SubjectsPage | null;
  /** While the group's own page is first read; the cards wait and no visit of another page is offered. */
  subjectsSince?: number | null;
  /** A newer answer for the same page is being read: its visits are not opened meanwhile. */
  subjectsBusy?: boolean;
  subjectsWhy: string | null;
  strips: Strips | null;
  stripsWhy: string | null;
  slot: Slot;
  onVisit: (s: MapSubject, v: MapVisit) => void;
  /** The layer the visits are coloured by, none for their kinds alone. */
  layer?: Layer | null;
}

/** The group's subjects, as cards a page at a time or every subject as a strip with the group lit. */
export function GroupBox(p: GroupBoxProps) {
  const total = p.subjects?.total ?? null;
  const pages = Math.max(1, Math.ceil((total ?? 0) / (p.subjects?.per_page || 24)));
  const cards = p.view === "cards";
  return (
    <section className="ms-box ms-group" aria-label="Subjects">
      <div className="ms-group-head">
        <h3 className="ms-group-title">{groupTitle(p.group)}</h3>
        {p.group.by !== "breaks" && (
          <button type="button" className="icon-button" aria-label="Back to the subjects whose series breaks" title="Back to the subjects whose series breaks" onClick={() => p.onGroup({ by: "breaks" })}>
            <Icon name="x" />
          </button>
        )}
        {total !== null && <span className="ms-group-count">{plural(total, "subject", "subjects")}</span>}
        <Hint text={cards ? (p.layer ? `${CARDS_HINT} ${layerCardsHint(p.layer)}` : CARDS_HINT) : stripsHint(p.columns, p.layer ?? null)} />
        {cards && p.draft && <Hint text={REDRAWN_HINT} />}
        <span className="grow" />
        <div className="chips" role="group" aria-label="View">
          {(
            [
              ["cards", "Cards"],
              ["strips", "All subjects"],
            ] as const
          ).map(([v, words]) => (
            <button key={v} type="button" className={p.view === v ? "opt on" : "opt"} aria-pressed={p.view === v} onClick={() => p.onView(v)}>
              {words}
            </button>
          ))}
        </div>
        {cards && (
          <>
            <div className="chips" role="group" aria-label="Order">
              {(
                [
                  ["changes", "Most changes"],
                  ["visits", "Most visits"],
                ] as const
              ).map(([o, words]) => (
                <button key={o} type="button" className={p.order === o ? "opt on" : "opt"} aria-pressed={p.order === o} onClick={() => p.onOrder(o)}>
                  {words}
                </button>
              ))}
            </div>
            <div className="ms-pager">
              <button type="button" className="icon-button" aria-label="Previous page" disabled={p.page <= 0} onClick={() => p.onPage(p.page - 1)}>
                <Icon name="chevron-left" />
              </button>
              <span className="num">
                {Math.min(p.page + 1, pages)} of {pages}
              </span>
              <button type="button" className="icon-button" aria-label="Next page" disabled={p.page >= pages - 1} onClick={() => p.onPage(p.page + 1)}>
                <Icon name="chevron-right" />
              </button>
            </div>
          </>
        )}
      </div>
      {cards ? <Cards {...p} /> : <StripsView {...p} />}
    </section>
  );
}

function Cards({ subjects, subjectsSince, subjectsBusy = false, subjectsWhy, slot, onVisit, group, layer = null }: GroupBoxProps) {
  if (subjectsWhy) return <p className="warn">The subjects could not be read: {subjectsWhy}</p>;
  if (!subjects) return <Wait phase="reading the subjects" since={subjectsSince ?? Date.now()} size="panel" />;
  if (subjects.subjects.length === 0) return <p className="ms-none">No subject in this group.</p>;
  const slots = Math.max(1, ...subjects.subjects.map((s) => s.visits.length));
  // the layer, where one is on and this answer is of it, as the strips check theirs
  const mine = layer !== null && subjects.layer?.layer === layer;
  // a cell's list is about its column: a card names it first, and a visit in another dataset too names that one
  const here = group.by === "cell" ? group.column : null;
  return (
    <div className="ms-cards">
      {subjects.subjects.map((s) => {
        const at = [...new Set(s.visits.flatMap((v) => v.columns))];
        const where = here !== null && at.includes(here) ? [here, ...at.filter((c) => c !== here)] : at;
        const changes = kindChanges(s.visits.map((v) => v.kind));
        return (
          <div key={s.subject_id} className="ms-card">
            <div className="ms-card-head">
              <b>{s.subject}</b>
              {where.length > 0 && <span title={where.join(", ")}>{where.length === 1 ? where[0] : `${where[0]} and ${where.length - 1} more`}</span>}
            </div>
            <div className="ms-card-visits">
              {Array.from({ length: slots }, (_, j) => {
                const v = s.visits[j];
                if (!v)
                  return (
                    <span key={`blank-${j}`} className="ms-visit blank" aria-hidden="true">
                      <span className="ms-visit-head" />
                      <span className="value-tag ms-kind none" />
                    </span>
                  );
                const others = othersOf(v, here);
                const also = alsoWords(others);
                // the layer, where one is on and this answer carries it
                const on = mine && v.layer !== null ? v.layer : null;
                const layered = on && layer ? `, ${layerName(layer).toLowerCase()} ${layerSaid(layer, on)}` : "";
                return (
                  <button
                    key={v.sessionId ?? `visit-${v.visit}`}
                    type="button"
                    disabled={subjectsBusy}
                    className={["ms-visit", changes[j] ? "changed" : "", v.redrawn ? "redrawn" : ""].filter(Boolean).join(" ")}
                    aria-label={`Subject ${s.subject}, visit ${v.visit}: ${v.kind ?? "none"}${changes[j] ? ", a change" : ""}${v.redrawn ? ", picked differently by your changed rules" : ""}${also ? `, ${also}` : ""}${layered}`}
                    title={on && layer ? visitLayerWords(layer, on) : undefined}
                    onClick={() => onVisit(s, v)}
                  >
                    <span className="ms-visit-head">
                      V{v.visit}
                      {v.field ? ` · ${v.field}` : ""}
                    </span>
                    <KindTag kind={v.kind} slot={slot} />
                    {on && layer && <VisitLayerMark layer={layer} v={on} />}
                    {also && (
                      <span className="ms-visit-also" title={also}>
                        {alsoWords(others.map((c) => besideField(c, v.field)))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StripsView({ strips, stripsWhy, slot, group, layer = null }: GroupBoxProps) {
  if (stripsWhy) return <p className="warn">The subjects could not be read: {stripsWhy}</p>;
  if (!strips) return <p className="ms-none">Reading every subject.</p>;
  if (strips.subjects.length === 0) return <p className="ms-none">No subject here.</p>;
  const lit = litOf(strips, group);
  // the layer, where one is on and this answer carries it
  const head = layer !== null && strips.layer?.layer === layer ? strips.layer : null;
  const slots = Math.min(12, Math.max(1, ...strips.subjects.map((s) => s.visits.length)));
  const columns = [...new Set(strips.subjects.map((s) => s.column))].sort((a, b) => (a < 0 ? 1 : b < 0 ? -1 : a - b));
  return (
    <div className="ms-strips">
      {columns.map((c) => {
        const here = strips.subjects
          .filter((s) => s.column === c)
          .map((s) => ({ s, kinds: stripKinds(strips, s.visits) }))
          .sort((a, b) => b.kinds.length - a.kinds.length || runOf(a.kinds).map(stepWord).join(">").localeCompare(runOf(b.kinds).map(stepWord).join(">")) || a.s.subject_id - b.s.subject_id);
        const label = strips.columns[c]?.key ?? "Elsewhere";
        return (
          <div key={c} className="ms-strip-group">
            <span className="ms-strip-label">
              {label} · {plural(here.length, "subject", "subjects")}
            </span>
            <div className="ms-strip-list">
              {here.map(({ s, kinds }) => {
                if (head && s.layer) {
                  // the layer's colours in place of the kinds': filled for the scan taken, outlined for what most of a visit's scans are
                  const lay = s.layer;
                  const drawn = kinds.map((_, j) => stripDrawn(head, lay, j));
                  const words = drawn.map((d) => (d === null ? "no answer" : `${layerWord(head.layer, d.value)}${d.taken ? "" : ", none taken"}`)).join("; ");
                  return (
                    <span key={s.subject_id} className={lit.has(s.subject_id) ? "ms-strip lit" : "ms-strip"} role="img" aria-label={words} title={words}>
                      {Array.from({ length: slots }, (_, j) => {
                        if (j >= kinds.length) return <i key={j} className="blank" />;
                        const d = drawn[j];
                        const sl = d === null ? null : layerSlot(head.layer, d.value);
                        const cls = d === null ? "none" : d.taken ? "" : "held";
                        return <i key={j} className={cls || undefined} {...(sl !== null ? { "data-slot": sl } : {})} />;
                      })}
                    </span>
                  );
                }
                const words = kinds.map(stepWord).join(", ");
                const changes = kindChanges(kinds);
                return (
                  <span key={s.subject_id} className={lit.has(s.subject_id) ? "ms-strip lit" : "ms-strip"} role="img" aria-label={words} title={words}>
                    {Array.from({ length: slots }, (_, j) => {
                      if (j >= kinds.length) return <i key={j} className="blank" />;
                      const k = kinds[j];
                      const sl = slot(k);
                      const cls = [k === null ? "none" : "", changes[j] ? "changed" : ""].filter(Boolean).join(" ");
                      return <i key={j} className={cls || undefined} {...(sl !== null ? { "data-slot": sl } : {})} />;
                    })}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ the layer

/** The cards' hint where a layer is on. */
const layerCardsHint = (layer: Layer) => `Under each kind, the ${layerName(layer).toLowerCase()} of the scan taken; outlined, what most of the visit's scans are where none is taken. A visit's scans by value on hover.`;

/** A visit's value on the layer in a few words, for one who hears the page. */
function layerSaid(layer: Layer, v: VisitLayer): string {
  const d = visitDrawn(v);
  if (!d) return "no answer";
  return d.taken ? layerWord(layer, d.value) : `none taken, its scans mostly ${layerWord(layer, d.value)}`;
}

/** A value of the layer, framed in its colour; outlined where it is not the scan taken's; dashed for no answer. */
export function LayerTag({ layer, value, held = false }: { layer: Layer; value: string | null; held?: boolean }) {
  const s = value === null ? null : layerSlot(layer, value);
  const words = value === null ? "no answer" : layerWord(layer, value);
  const cls = ["value-tag", "ms-kind", "ms-layer-tag", value === null ? "none" : s === null ? "plain" : "", held ? "held" : ""].filter(Boolean).join(" ");
  return (
    <span className={cls} title={words} {...(s !== null ? { "data-slot": s } : {})}>
      {words}
    </span>
  );
}

/** A card's visit on the layer: the value of the scan taken, or, outlined, the one most of its scans carry; and the 72-hour flag where it is up. */
function VisitLayerMark({ layer, v }: { layer: Layer; v: VisitLayer }) {
  const d = visitDrawn(v);
  return (
    <span className="ms-visit-layer">
      <LayerTag layer={layer} value={d?.value ?? null} held={d !== null && !d.taken} />
      {layer === "post_contrast" && v.prior_72h > 0 && (
        <span className="tag caution" title="Contrast was given in the 72 hours before this visit">
          72 h
        </span>
      )}
    </span>
  );
}

/** A Run of the layer's step where it has not run over the scope, as the dataset's own page offers it. */
export interface LayerRun {
  label: string;
  disabled: boolean;
  why: string | null;
  onRun: () => void;
}

export interface LayerBoxProps {
  /** The layer chosen, none for the kinds alone. */
  layer: Layer | null;
  onLayer: (l: Layer | null) => void;
  /** The map's answer for the chosen layer; null while it is read. */
  answer: MapLayer | null;
  /** The engine answered the map without the layer: it draws none yet. */
  unanswered?: boolean;
  /** Since when the chosen layer is being read. */
  since: number | null;
  /** The layer's step over the scope in one line, and whether it has run there. */
  step: { words: string; ran: boolean } | null;
  run: LayerRun | null;
  /** One line once a run is asked for, or why it was refused. */
  said: string | null;
}

/**
 * The layer keys, only the chosen one in colour, and with a layer on its
 * values over the visits as the kinds are drawn: faint the visits that hold a
 * scan of the value, solid the visits whose scan taken carries it. What
 * carries none, and whether the step that answers it has run over the
 * dataset or cohort, with a Run where it has not.
 */
export function LayerBox({ layer, onLayer, answer, unanswered = false, since, step, run, said }: LayerBoxProps) {
  const most = Math.max(1, ...(answer?.values.map((v) => v.visits_with) ?? []));
  return (
    <section className="ms-box ms-layer" aria-label="Layer">
      <div className="ms-box-head">
        <h3 className="eyebrow">Layer</h3>
        <div className="chips" role="group" aria-label="Layer">
          {LAYERS.map((l) => {
            const on = l.key === layer;
            return (
              <button key={l.words} type="button" className={on ? "opt on" : "opt"} aria-pressed={on} onClick={() => onLayer(l.key)}>
                {l.words}
              </button>
            );
          })}
        </div>
        <Hint text="Colours each visit by what its scans are: body region and body part from the body-part step, post-contrast from the label. Filled: the scan taken. Outlined: none taken, what most of its scans are." />
      </div>
      {layer !== null && answer === null && unanswered && <p className="ms-none">This engine does not draw layers on the map yet.</p>}
      {layer !== null && answer === null && !unanswered && <Wait phase={`reading the ${layerName(layer).toLowerCase()}`} since={since ?? Date.now()} />}
      {layer !== null && answer !== null && (
        <>
          {step && (
            <div className="ms-layer-step">
              <span className={step.ran ? "ms-layer-said" : "ms-layer-said not-run"}>{step.words}</span>
              {run && (
                <>
                  <button type="button" className="button secondary small" disabled={run.disabled} onClick={run.onRun}>
                    {run.label}
                  </button>
                  {run.why && <Hint text={run.why} />}
                </>
              )}
            </div>
          )}
          {said && (
            <p className="meta ms-said" role="status">
              {said}
            </p>
          )}
          {answer.values.length === 0 && <p className="ms-none">No scan of these visits carries a {layerName(layer).toLowerCase()} yet.</p>}
          {answer.values.map((v) => {
            const s = layerSlot(layer, v.value);
            const was = v.visits_taken_before !== null && v.visits_taken_before !== v.visits_taken ? ` (was ${n(v.visits_taken_before)})` : "";
            return (
              <div key={v.value} className="ms-kind-row" title={`${layerWord(layer, v.value)}: ${plural(v.scans, "scan", "scans")}`}>
                <LayerTag layer={layer} value={v.value} />
                <span className="ms-bar" aria-hidden="true" {...(s !== null ? { "data-slot": s } : {})}>
                  <i className="has" style={{ width: `${pct(v.visits_with, most) ?? 0}%` }} />
                  <i className="taken" style={{ width: `${pct(v.visits_taken, most) ?? 0}%` }} />
                </span>
                <span className="ms-count">
                  {n(v.visits_taken)} taken of {n(v.visits_with)}
                  {was}
                </span>
              </div>
            );
          })}
          {(answer.none.scans > 0 || answer.none.visits > 0) && <p className="ms-none">{noneWords(layer, answer)}</p>}
          {answer.prior_72h !== null && answer.prior_72h > 0 && (
            <p className="ms-layer-flag">
              <span className="tag caution">72 h</span> {plural(answer.prior_72h, "visit follows", "visits follow")} contrast given in the 72 hours before.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** What carries no value on the layer, in one line. */
function noneWords(layer: Layer, a: MapLayer): string {
  const name = layerName(layer).toLowerCase();
  const parts = [`${plural(a.none.scans, "scan carries", "scans carry")} no ${name}`];
  if (a.none.visits > 0) parts.push(`${plural(a.none.visits, "visit has", "visits have")} none at all`);
  if (a.none.taken > 0) parts.push(`${plural(a.none.taken, "scan", "scans")} taken without one`);
  return `${parts.join(" · ")}.`;
}
