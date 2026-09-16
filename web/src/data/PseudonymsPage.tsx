// SPDX-License-Identifier: AGPL-3.0-only
// The Pseudonymisation page of a dataset, in four sections: identifiers
// become codes (the rule, the map by type, the code, where the identifiers
// are kept, what is held, what merged); the pseudonymised tree (the two
// trees and the tag facts, tag group by tag group); who sees what (the
// detail levels with how many people hold each); and when it leaves (the
// leaving policy). At the side: the files held until mapped with their
// three ways out, the two questions the identity-check station answers,
// and what waits on Review. Provide a map reads a CSV on this machine,
// guesses each column, rehearses the import and files it; Change edits the
// dataset's fields through its place. Every control is gated on the door
// behind it: an engine without the door leaves one line in its place.

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import { needsWork } from "../access";
import { stations, stationsServed, type StationRun, type Verdict } from "../assistant/stations";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, sees, type Detail } from "../grants";
import { ops, type ReviewItem } from "../ops/client";
import { href } from "../routes";
import { assistantOffered } from "../sections";
import { messageOf } from "../settings/common";
import { identity, RECORD_WORDS, type Access } from "../settings/identity";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import {
  arrivesWords,
  bytesWords,
  datasets,
  detailCounts,
  guessRole,
  heldGroups,
  heldLine,
  identityWords,
  importColumns,
  leavingRefusal,
  leavingWords,
  linkage,
  lookAt,
  mapRefusal,
  ORIGINALS_WORDS,
  parseCsv,
  proposedRule,
  REMOVED_GROUPS,
  REMOVED_TOTAL,
  reportLines,
  ruleWords,
  sawOf,
  shapeWords,
  subjectsWords,
  tagList,
  typeName,
  waitingLines,
  type ColumnLook,
  type Csv,
  type Dataset,
  type DatasetPatch,
  type Guess,
  type HeldRow,
  type IdType,
  type ImportReport,
  type Revealed,
  type TypesDoc,
} from "./pseudonyms";
import { countWords } from "./datasets";
import { sources, whenWords, type Handling } from "./sources";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; dataset: Dataset | null };
type Opened = { kind: "map" } | { kind: "held" } | { kind: "change" } | null;
type Check = { kind: "idle" } | { kind: "running"; question: string; since: number; run: StationRun | null } | { kind: "done"; question: string; run: StationRun; verdict: Verdict | null } | { kind: "failed"; question: string; why: string };

const n = (v: number) => v.toLocaleString("en-US");

export function PseudonymsPage({ caps, name, onChanged }: { caps: Capabilities; name: string; onChanged?: () => void }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [types, setTypes] = useState<TypesDoc | null>(null);
  const [held, setHeld] = useState<HeldRow[] | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [opened, setOpened] = useState<Opened>(null);
  const [check, setCheck] = useState<Check>({ kind: "idle" });
  const [said, setSaid] = useState<string | null>(null);
  const works = may(caps, "data:work");
  const maps = works && served(caps, "POST /api/linkage/imports");
  const heldServed = served(caps, "GET /api/linkage/held");
  const changing = needsWork(caps, "Changing how the dataset is pseudonymised", [
    ["data:work", "the Data page"],
    ["places:work", "the Places page"],
  ]);
  const checks = assistantOffered(caps) && stationsServed(caps).includes("identity-check");

  const read = useCallback(() => {
    sources
      .list()
      .then((r) => setLoad({ kind: "ready", dataset: (r.sources as Dataset[]).find((s) => s.name === name) ?? null }))
      .catch((e: unknown) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: messageOf(e) })));
    if (served(caps, "GET /api/linkage/types")) linkage.types().then(setTypes, () => setTypes(null));
    if (heldServed) linkage.held(name).then(setHeld, () => setHeld(null));
    if (may(caps, "identity:see") && caps.desk.mode !== "off") identity.access().then(setAccess, () => setAccess(null));
    if (served(caps, "GET /api/review") && may(caps, "review:see")) ops.review("open", undefined, 500).then((r) => setReview(r.items), () => undefined);
  }, [name, caps, heldServed]);

  useEffect(() => {
    setLoad({ kind: "loading", since: Date.now() });
    read();
  }, [read]);

  const dataset = load.kind === "ready" ? load.dataset : null;

  const ask = (question: string) => {
    setCheck({ kind: "running", question, since: Date.now(), run: null });
    stations
      .follow("identity-check", question, (run) => setCheck((was) => (was.kind === "running" ? { ...was, run } : was)))
      .then(({ run, verdict }) => setCheck({ kind: "done", question, run, verdict }))
      .catch((e: unknown) => setCheck({ kind: "failed", question, why: messageOf(e) }));
  };

  const codeHeld = () => {
    setSaid(null);
    linkage
      .codeHeld(name)
      .then((j) => {
        setSaid(`The held files get codes derived from their identifiers, as job ${j.job}; a later map merges them into the right person.`);
        read();
      })
      .catch((e: unknown) => setSaid(messageOf(e)));
  };

  if (load.kind === "loading") return <Wait phase="reading the dataset" since={load.since} size="panel" />;
  if (load.kind === "failed" || dataset === null) {
    return (
      <section className="state">
        <h1>Pseudonymisation of {name}</h1>
        <p>{load.kind === "failed" ? `The dataset could not be read: ${load.why}` : `No dataset is named ${name}.`}</p>
        <p>
          <a href={href("data")}>Back to Data</a>
        </p>
      </section>
    );
  }

  const heldFiles = dataset.held?.files ?? (held ?? []).reduce((s, r) => s + r.files, 0);
  const heldIds = dataset.held?.identifiers ?? (held ?? []).length;
  const groups = heldGroups(held ?? []);
  const counts = detailCounts(access);
  const identityItems = review.filter((i) => /^(identity|linkage)[.:]/.test(i.kind) && ofDataset(i, name));
  const waiting = waitingLines(identityItems, dataset.held?.files ?? null);
  const pixelItems = review.filter((i) => /pixel|burn/.test(i.kind) && ofDataset(i, name));
  const arrives = dataset.arrives ?? (dataset.handling?.arrives === "deidentified" ? "deidentified" : "identified");
  const onRelease = dataset.handling?.on_release;
  const typeLine = types
    ? [
        types.types.map((t) => `${t.name}${typeof t.identifiers === "number" ? ` ${n(t.identifiers)}` : ""}`).join(" · "),
        typeof types.several === "number" ? `${n(types.several)} subjects carry more than one type` : null,
        types.filed && types.filed.length > 0 ? `filed ${types.filed.slice(-3).map((d) => whenWords(d)).join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <section className="bpage">
      <div className="main">
        <div className="trail">
          <Icon name="data" />
          <a href={href("data")}>Data</a>
          <span>/</span>
          <a href={href("data", "datasets")}>Datasets</a>
          <span>/</span>
          <a href={href("data", "datasets", dataset.name)}>{dataset.name}</a>
          <span>/</span>
          <span>Pseudonymisation</span>
        </div>
        <div className="data-head">
          <div className="grow">
            <h1>Pseudonymisation of {dataset.name}</h1>
            <p className="lede">Who each file is about, what the pseudonymised tree keeps, who sees what, and what leaves.</p>
          </div>
          {maps && (
            <button type="button" className="button secondary" onClick={() => setOpened({ kind: "map" })}>
              <Icon name="file" />
              Provide a map
            </button>
          )}
          {changing === null && (
            <button type="button" className="button secondary" onClick={() => setOpened({ kind: "change" })}>
              <Icon name="pencil" />
              Change
            </button>
          )}
        </div>
        {said && <p className="meta">{said}</p>}
        {changing !== null && <p className="meta">{changing}</p>}
        {check.kind !== "idle" && (
          <CheckPanel
            caps={caps}
            dataset={dataset}
            check={check}
            onClose={() => setCheck({ kind: "idle" })}
            onUsed={(words) => {
              setSaid(words);
              setCheck({ kind: "idle" });
              read();
              onChanged?.();
            }}
          />
        )}

        <section className="panel card">
          <div className="row card-head">
            <span className="sq brand">
              <Icon name="key" />
            </span>
            <h2>1 · Identifiers become codes</h2>
            {heldFiles > 0 && <span className="tag caution">{n(heldFiles)} files held</span>}
          </div>
          <dl className="facts">
            <dt>who a file is about</dt>
            <dd>
              {identityWords(dataset)} <span className="meta">· a type is chosen from the registry's list or made new</span>
            </dd>
            <dt>the map</dt>
            <dd>
              {types === null && (served(caps, "GET /api/linkage/types") ? "the types could not be read" : "this engine does not list the map's types")}
              {types !== null && types.types.length === 0 && "no map filed yet: the identifiers are hashed under the key"}
              {types !== null && types.types.length > 0 && (
                <>
                  {typeof types.identifiers === "number" && typeof types.subjects === "number"
                    ? `${n(types.identifiers)} identifiers of ${n(types.types.length)} ${types.types.length === 1 ? "type" : "types"} on ${n(types.subjects)} subjects`
                    : `${n(types.types.length)} ${types.types.length === 1 ? "type" : "types"}`}{" "}
                  <span className="meta">· {typeLine}</span>
                </>
              )}
            </dd>
            <dt>the code</dt>
            <dd>
              {subjectsWords(dataset)} <span className="meta">· the same wherever they are seen</span>
            </dd>
            <dt>the identifiers</dt>
            <dd>
              sealed in the linkage store beside the registry, never in it <span className="meta">· every reading audited</span>
            </dd>
            <dt>held</dt>
            <dd>
              {heldFiles === 0 ? (
                <>
                  nothing held <span className="meta">· {dataset.unmapped === "code" ? "an unmapped identifier gets a code derived from it" : "an unmapped identifier holds its files until a map names it"}</span>
                </>
              ) : (
                <>
                  <b>{n(heldFiles)} files</b> of {n(heldIds)} {heldIds === 1 ? "identifier" : "identifiers"} the map does not know{groups[0]?.since ? `, since ${whenWords(groups[0].since)}` : ""}{" "}
                  <span className="meta">
                    ·{" "}
                    <button type="button" className="link-button" onClick={() => setOpened({ kind: "held" })}>
                      map them
                    </button>
                  </span>
                </>
              )}
            </dd>
            <dt>merged</dt>
            <dd>
              {types?.merged && types.merged.subjects > 0
                ? `${n(types.merged.subjects)} subjects became fewer${types.merged.last ? ` on ${whenWords(types.merged.last)}` : ""}, when a map said so`
                : "no subject merged yet"}{" "}
              <span className="meta">· the old codes stay as their identifiers</span>
            </dd>
          </dl>
        </section>

        <section className="panel card">
          <div className="row card-head">
            <span className="sq brand">
              <Icon name="shield" />
            </span>
            <h2>2 · The pseudonymised tree</h2>
            <span className="meta">tags only; pixels are never touched</span>
          </div>
          <div className="pair">
            <div className="tree-card">
              <div className="row">
                <Icon name="lock" />
                <b className="path">{dataset.trees?.originals?.path ?? "derivatives/dcm-original"}</b>
              </div>
              <span className="meta">
                {dataset.trees?.originals ? `${countWords(dataset.trees.originals.files)} files · ${typeof dataset.trees.originals.bytes === "number" ? `${bytesWords(dataset.trees.originals.bytes)} · ` : ""}` : arrives === "identified" ? "" : "no originals: the files arrive without identifiers · "}
                locked to the stewards · read by the pseudonymiser only · never a source
              </span>
              <span className="meta">{ORIGINALS_WORDS[dataset.originals_kept ?? "kept"]}</span>
            </div>
            <div className="tree-card on">
              <div className="row">
                <Icon name="shield" />
                <b className="path">{dataset.trees?.anon?.path ?? dataset.path}</b>
              </div>
              <span className="meta">
                {dataset.trees?.anon ? `${countWords(dataset.trees.anon.files)} files · ` : ""}
                written by NILS only · the registry's source{dataset.trees?.anon?.last_written ? ` · last written ${whenWords(dataset.trees.anon.last_written)}` : ""}
              </span>
              <span className="meta">layout from facts: code, study, series, instance · never the original path</span>
            </div>
          </div>
          <dl className="facts">
            <dt>PatientID</dt>
            <dd>the code</dd>
            <dt>removed</dt>
            <dd>
              {REMOVED_TOTAL} tags in four groups: {REMOVED_GROUPS.map((g) => `${g.group} ${g.tags}`).join(", ")} <span className="meta">· the earlier list, tag for tag</span>
            </dd>
            <dt>kept on purpose</dt>
            <dd>
              {dataset.tags?.keep_demographics === false ? (
                <>
                  <b>sex, weight, size</b> removed <span className="meta">· this dataset opted out of keeping them</span>
                </>
              ) : (
                <>
                  <b>sex, weight, size</b> <span className="meta">· in the patient group, but covariates, not identifiers: an opt-out here, recorded</span>
                </>
              )}
            </dd>
            <dt>written</dt>
            <dd>
              <b>PatientAge</b>, computed before the birth date goes
            </dd>
            <dt>kept</dt>
            <dd>
              <b>dates, times and UIDs</b>: the same study brought in twice is one study <span className="meta">· the date tags are the release's date policy</span>
            </dd>
            <dt>private tags</dt>
            <dd>
              all dropped; the pack keeps what it names by creator <span className="meta">· b-values, directions, the vendor fields it reads</span>
            </dd>
            <dt>overlays, curves</dt>
            <dd>dropped</dd>
            <dt>this dataset also</dt>
            <dd>
              {dataset.tags && (dataset.tags.remove.length > 0 || dataset.tags.keep.length > 0) ? (
                <>
                  {dataset.tags.remove.length > 0 && (
                    <>
                      removes {dataset.tags.remove.map((t, i) => (
                        <span key={t}>
                          {i > 0 ? ", " : ""}
                          <span className="path">{t}</span>
                        </span>
                      ))}
                    </>
                  )}
                  {dataset.tags.remove.length > 0 && dataset.tags.keep.length > 0 ? " · " : ""}
                  {dataset.tags.keep.length > 0 && (
                    <>
                      keeps {dataset.tags.keep.map((t, i) => (
                        <span key={t}>
                          {i > 0 ? ", " : ""}
                          <span className="path">{t}</span>
                        </span>
                      ))}
                    </>
                  )}
                </>
              ) : (
                "removes nothing extra · keeps nothing extra"
              )}{" "}
              <span className="meta">· a declared list, written on every batch</span>
            </dd>
            <dt>text in pixels</dt>
            <dd>a file that says nothing about it is marked, never read as clean</dd>
            <dt>re-runs</dt>
            <dd>only new or changed originals are written again</dd>
          </dl>
        </section>

        <section className="panel card">
          <div className="row card-head">
            <span className="sq brand">
              <Icon name="users" />
            </span>
            <h2>3 · Who sees what</h2>
            <span className="meta">set per person on Identity</span>
          </div>
          <div className="strip small">
            {(["plain", "quasi", "sensitive"] as Detail[]).map((d) => (
              <div key={d} className={access ? "done" : undefined}>
                <span className="k">{d}</span>
                <span className="v">
                  {access ? n(counts[d]) : ""}
                  <small> {access ? (counts[d] === 1 ? "person" : "people") : caps.desk.mode === "off" ? "everyone here" : "people"}</small>
                </span>
                <span className="meta">{RECORD_WORDS[d].says}</span>
              </div>
            ))}
            <div>
              <span className="k">a job</span>
              <span className="v">as its person</span>
              <span className="meta">never reads more than who queued it</span>
            </div>
          </div>
        </section>

        <section className="panel card">
          <div className="row card-head">
            <span className="sq brand">
              <Icon name="release" />
            </span>
            <h2>4 · When it leaves</h2>
            <span className="meta">on top of the tree, written on every release</span>
          </div>
          <dl className="facts">
            <dt>dates</dt>
            <dd>
              <b>{onRelease?.dates === "shift" ? "shifted" : onRelease?.dates === "year" ? "cut to the year" : "kept"}</b>
              {onRelease?.dates === "shift" && (
                <>
                  , one offset per person, every date in the file <span className="meta">· the offset lives with the identifiers</span>
                </>
              )}
            </dd>
            <dt>UIDs</dt>
            <dd>
              <b>{onRelease?.uids === "remap" ? "remapped" : "kept"}</b>
              {onRelease?.uids === "remap" && (
                <>
                  {" "}
                  from the key <span className="meta">· shifted dates with kept UIDs is refused</span>
                </>
              )}
            </dd>
            <dt>faces</dt>
            <dd>{onRelease?.deface ? "removed by a pipeline over the released tree" : "kept · removing them is a pipeline over the released tree"}</dd>
          </dl>
        </section>
      </div>

      <div className="aside">
        <section className={heldFiles > 0 ? "panel card held" : "panel card"}>
          <div className="row card-head">
            <Icon name="alert" size="lg" />
            <h2>Held until mapped</h2>
          </div>
          {!heldServed && heldFiles === 0 && <p className="meta">This engine does not hold files for a map.</p>}
          {heldServed && heldFiles === 0 && <p className="meta">Nothing is held: every identifier seen is in the map.</p>}
          {groups.length > 0 && (
            <div className="reasons">
              {groups.map((g, i) => (
                <div key={g.shape} className="reason">
                  <span>{heldLine(g, i)}</span>
                  <b>
                    {n(g.files)} {g.files === 1 ? "file" : "files"}
                  </b>
                </div>
              ))}
            </div>
          )}
          {heldFiles > 0 && groups.length === 0 && <p className="meta">{n(heldFiles)} files held; this engine does not list them by shape.</p>}
          {heldFiles > 0 && (
            <span className="meta">
              {groups[0]?.since ? `since ${whenWords(groups[0].since)} · ` : ""}
              {groups.flatMap((g) => g.batches).length > 0 ? `batch ${[...new Set(groups.flatMap((g) => g.batches))].join(", ")} · ` : ""}they stay in the originals
            </span>
          )}
          {heldFiles > 0 && (
            <div className="row">
              {maps ? (
                <button type="button" className="button small" onClick={() => setOpened({ kind: "map" })}>
                  Provide a map
                </button>
              ) : (
                <span className="meta">Mapping them is Data work.</span>
              )}
              {works && served(caps, "POST /api/linkage/held/code") && (
                <button type="button" className="button quiet small" onClick={() => setOpened({ kind: "held" })}>
                  Ways out
                </button>
              )}
            </div>
          )}
        </section>
        <section className="panel card">
          <div className="row card-head">
            <Icon name="assistant" size="lg" />
            <h2>Ask the assistant</h2>
          </div>
          {checks ? (
            <>
              <button type="button" className="tail link-button" disabled={check.kind === "running"} onClick={() => ask(`Check the identity rule of ${dataset.name} against its originals: probe the rule in use and one candidate over @${dataset.name}/dcm-original, shapes and counts only.`)}>
                Check the identity rule against the originals
                <Icon name="chevron-right" />
              </button>
              <button type="button" className="tail link-button" disabled={check.kind === "running"} onClick={() => ask(`What shape do the held identifiers of ${dataset.name} have, and is one a second kind of identifier on this dataset? Shapes and counts only, never a value.`)}>
                What shape do the held identifiers have?
                <Icon name="chevron-right" />
              </button>
            </>
          ) : (
            <p className="meta">{assistantOffered(caps) ? "The assistant serves no identity-check station." : "The assistant is not here."}</p>
          )}
        </section>
        <section className="panel card">
          <div className="row card-head">
            <Icon name="review" size="lg" />
            <h2>Waiting</h2>
          </div>
          {waiting.length === 0 && pixelItems.length === 0 && <p className="meta">Nothing of this dataset waits on Review.</p>}
          {waiting.map((w) =>
            w.kind === "held" ? (
              // the held files are mapped here: the map, or the three ways out
              <button key={w.kind} type="button" className="tail link-button" onClick={() => setOpened({ kind: maps ? "map" : "held" })}>
                {w.words}
                <Icon name="chevron-right" />
              </button>
            ) : (
              <a key={w.kind} className="tail" href={href("review", "identifiers")}>
                {w.words}
                <Icon name="chevron-right" />
              </a>
            ),
          )}
          {pixelItems.length > 0 && (
            <a className="tail" href={href("review")}>
              {n(pixelItems.length)} {pixelItems.length === 1 ? "stack says" : "stacks say"} nothing about text in pixels
              <Icon name="chevron-right" />
            </a>
          )}
        </section>
      </div>

      {opened?.kind === "map" && (
        <MapDialog
          caps={caps}
          dataset={dataset}
          types={types?.types ?? []}
          onClose={() => setOpened(null)}
          onFiled={(words) => {
            setOpened(null);
            setSaid(words);
            read();
          }}
        />
      )}
      {opened?.kind === "held" && (
        <HeldDialog
          caps={caps}
          dataset={dataset}
          rows={held ?? []}
          onClose={() => setOpened(null)}
          onMap={() => setOpened({ kind: "map" })}
          onCode={() => {
            setOpened(null);
            codeHeld();
          }}
        />
      )}
      {opened?.kind === "change" && (
        <ChangeDialog
          dataset={dataset}
          onClose={() => setOpened(null)}
          onSaved={() => {
            setOpened(null);
            setSaid(`${dataset.name} is changed; the next bring-in reads it so.`);
            read();
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}

/** A review item of this dataset: its ref names the place, or names none. */
function ofDataset(i: ReviewItem, name: string): boolean {
  const ref = (i.ref ?? {}) as Record<string, unknown>;
  const place = ref.place ?? ref.dataset ?? ref.source ?? null;
  return place === null || place === name;
}

/* ---------------------------------------------------------------- the identity-check station's run */

function CheckPanel({ caps, dataset, check, onClose, onUsed }: { caps: Capabilities; dataset: Dataset; check: Check; onClose: () => void; onUsed: (words: string) => void }) {
  const [acting, setActing] = useState<{ kind: "idle" } | { kind: "working" } | { kind: "failed"; why: string }>({ kind: "idle" });
  if (check.kind === "idle") return null;
  const verdict = check.kind === "done" ? check.verdict : null;
  const result = (verdict?.result ?? {}) as Record<string, unknown>;
  const cards = verdict ? sawOf(result) : [];
  const proposed = verdict ? proposedRule(verdict) : null;
  const sentence = typeof result.sentence === "string" ? result.sentence : (verdict?.proposals[0]?.sentence ?? null);
  const probeJobs = Array.isArray(result.probe_jobs) ? (result.probe_jobs as number[]) : typeof result.job === "number" ? [result.job] : [];
  const canUse = proposed !== null && may(caps, "data:work") && may(caps, "places:work") && served(caps, "PUT /api/places/{id}");
  const state = check.kind === "running" ? (check.run?.state ?? "queued") : check.kind === "failed" ? "failed" : (check.run.state as string);
  const tone = state === "settled" ? "ok" : state === "failed" || state === "aborted" ? "blocked" : "brand";
  const use = () => {
    if (!proposed) return;
    setActing({ kind: "working" });
    datasets
      .set(dataset.id, { identity: proposed })
      .then(() => (served(caps, "POST /api/jobs") ? ops.enqueue(["bring-in", `@${dataset.name}`]) : Promise.resolve(null)))
      .then((j) => onUsed(j ? `The rule is set on ${dataset.name}; bringing it in again under it is queued as job ${j.job}.` : `The rule is set on ${dataset.name}; bring it in again to read it under the rule.`))
      .catch((e: unknown) => setActing({ kind: "failed", why: messageOf(e) }));
  };
  return (
    <section className="panel card check">
      <div className="row check-head">
        <span className="sq brand">
          <Icon name="assistant" />
        </span>
        <div className="grow">
          <h2>Check the identity rule of {dataset.name}</h2>
          <span className="meta">the identity-check station · asked by {caps.person.display_name || caps.person.subject} · shapes and counts only, never a value or a path</span>
        </div>
        <span className={`tag ${tone}`}>{state === "settled" ? (proposed ? "proposed" : "settled") : state}</span>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      {check.kind === "running" && <Wait phase={check.run?.state === "running" ? "probing the originals" : "waiting for the station"} since={check.since} />}
      {check.kind === "failed" && <p className="warn">{check.why}</p>}
      {check.kind === "done" && cards.length > 0 && (
        <div className="pair">
          {cards.map((c) => {
            const max = Math.max(...c.shapes.map((s) => s.files), 1);
            return (
              <section key={c.title} className="panel card">
                <div className="row card-head">
                  <h2>{c.title}</h2>
                  {c.meta && <span className="meta">{c.meta}</span>}
                </div>
                {c.shapes.length > 0 && (
                  <div className="bybase">
                    {c.shapes.map((s, i) => (
                      <SawBar key={s.shape} shape={s.shape} files={s.files} width={(s.files / max) * 100} unsure={i > 0} />
                    ))}
                  </div>
                )}
                {c.facts.length > 0 && (
                  <dl className="facts">
                    {c.facts.map(([k, v]) => (
                      <div key={k} className="facts-pair">
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            );
          })}
        </div>
      )}
      {check.kind === "done" && (
        <div className="note">
          <Icon name="info" />
          <div className="note-body">
            <p className="note-lead">What it found</p>
            <p className="note-detail">{sentence ?? check.run.reply?.text ?? "The station settled without a sentence."}</p>
          </div>
        </div>
      )}
      {check.kind === "done" && (
        <ul className="tl">
          <li className="done">
            <span>
              <b>Proposal</b>
              <span className="meta">{proposed ? ruleWords(proposed) : "The station proposed no rule."}</span>
            </span>
          </li>
          <li className="wait">
            <span>
              <b>Yours</b>
              <span className="meta">A changed rule means reading the source again under it. The station proposes; it never re-reads.</span>
            </span>
          </li>
        </ul>
      )}
      {check.kind === "done" && (
        <div className="row actions">
          {canUse && (
            <button type="button" className="button" disabled={acting.kind === "working"} onClick={use}>
              Use this rule and read again
            </button>
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            Keep the rule
          </button>
          <span className="grow" />
          {probeJobs.length > 0 && <span className="meta">the probe ran as {probeJobs.length === 1 ? `job ${probeJobs[0]}` : `jobs ${probeJobs.join(", ")}`}</span>}
          {acting.kind === "failed" && <span className="warn">{acting.why}</span>}
        </div>
      )}
    </section>
  );
}

function SawBar({ shape, files, width, unsure }: { shape: string; files: number; width: number; unsure: boolean }) {
  return (
    <>
      <span className="path">{shape}</span>
      <span className="bar">
        <i className={unsure ? "unsure" : undefined} style={{ width: `${Math.max(1, Math.round(width))}%` }} />
      </span>
      <span className="num">{n(files)}</span>
    </>
  );
}

/* ---------------------------------------------------------------- Provide a map */

type Rehearsal = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "report"; report: ImportReport } | { kind: "filed"; job: number } | { kind: "failed"; why: string };

interface Column {
  header: string;
  look: ColumnLook;
  guess: Guess;
  /** The description of a new type, typed here. */
  description: string;
}

/** A column's meaning, as the select names it. */
function roleValue(g: Guess): string {
  if (g.role === "identifier") return g.id_type ? `type:${g.id_type}` : "new";
  return g.role;
}

export function MapDialog({ caps, dataset, types, onClose, onFiled }: { caps: Capabilities; dataset: Dataset; types: IdType[]; onClose: () => void; onFiled: (words: string) => void }) {
  const [file, setFile] = useState<{ name: string; csv: Csv } | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [rehearsal, setRehearsal] = useState<Rehearsal>({ kind: "idle" });
  const sensitive = sees(caps, "sensitive");
  const makesTypes = served(caps, "POST /api/linkage/types");

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setWhy(null);
    setRehearsal({ kind: "idle" });
    f.text()
      .then((text) => {
        const csv = parseCsv(text);
        if (csv.header.length === 0 || csv.rows.length === 0) {
          setWhy("The file has no rows under a header.");
          return;
        }
        setFile({ name: f.name, csv });
        setColumns(
          csv.header.map((h, i) => {
            const look = lookAt(h, csv.rows.map((r) => r[i] ?? ""));
            return { header: h, look, guess: guessRole(h, look, types), description: "" };
          }),
        );
      })
      .catch((err: unknown) => setWhy(messageOf(err)));
  };

  const setGuess = (i: number, value: string) => {
    setRehearsal({ kind: "idle" });
    setColumns((was) =>
      was.map((c, j) => {
        if (j !== i) return c;
        if (value === "new") return { ...c, guess: { role: "identifier", id_type: null, new_type: typeName(c.header) || "identifier" } };
        if (value.startsWith("type:")) return { ...c, guess: { role: "identifier", id_type: value.slice(5), new_type: null } };
        return { ...c, guess: { role: value as Guess["role"], id_type: null, new_type: null } };
      }),
    );
  };

  const refusal = columns.length > 0 ? mapRefusal(columns.map((c) => c.guess)) : null;
  const newTypes = columns.filter((c) => c.guess.role === "identifier" && c.guess.new_type !== null);
  const newTypeRefusal = newTypes.length > 0 && !makesTypes ? "This engine does not make identifier types; choose one of the registry's." : newTypes.some((c) => c.description.trim() === "") ? "A new type is made with a description." : null;
  const body = (dryRun: boolean) => ({ place: dataset.name, columns: importColumns(columns.map((c) => c.header), columns.map((c) => c.guess)), rows: file?.csv.rows ?? [], dry_run: dryRun });

  const rehearse = () => {
    setRehearsal({ kind: "working", phase: "rehearsing the map", since: Date.now() });
    linkage
      .import(body(true))
      .then((r) => setRehearsal({ kind: "report", report: r }))
      .catch((e: unknown) => setRehearsal({ kind: "failed", why: messageOf(e) }));
  };

  const apply = async () => {
    setRehearsal({ kind: "working", phase: "filing the map", since: Date.now() });
    try {
      for (const c of newTypes) await linkage.addType(c.guess.new_type!, c.description.trim());
      const r = await linkage.import(body(false));
      const job = typeof r.job === "number" ? r.job : null;
      setRehearsal({ kind: "filed", job: job ?? 0 });
      onFiled(job !== null ? `The map is filed as job ${job}; held files it names are pseudonymised and brought in after.` : "The map is filed.");
    } catch (e) {
      setRehearsal({ kind: "failed", why: messageOf(e) });
    }
  };

  const report = rehearsal.kind === "report" ? rehearsal.report : null;
  const conflicts = report?.conflicts?.length ?? 0;
  const working = rehearsal.kind === "working";

  const foot = (
    <div className="row actions">
      <span className="meta grow">{sensitive ? "Filed under your detail, sensitive." : "Filing a map needs detail sensitive; this account sees less, so the engine will refuse it."}</span>
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      {report === null ? (
        <button type="button" className="button" disabled={file === null || refusal !== null || newTypeRefusal !== null || working} onClick={rehearse}>
          See what it will do
        </button>
      ) : (
        <button type="button" className="button" disabled={conflicts > 0 || working} onClick={apply}>
          File the map
        </button>
      )}
    </div>
  );

  return (
    <Dialog title={`Provide a map for ${dataset.name}`} icon="file" onClose={onClose} foot={foot}>
      <div className="field">
        <span className="label">File</span>
        <div className="field-row">
          {file ? (
            <>
              <span className="chip">
                <Icon name="file" />
                {file.name}
              </span>
              <span className="meta">
                {n(file.csv.rows.length)} rows · {n(file.csv.header.length)} columns · read on this machine, never kept
              </span>
            </>
          ) : (
            <span className="meta">A CSV of identifiers and who they belong to. It is read here and posted once to the engine.</span>
          )}
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={pick} aria-label="Choose a CSV" />
        </div>
        {why && <p className="warn">{why}</p>}
      </div>
      {columns.length > 0 && (
        <div className="field">
          <span className="label">What each column is</span>
          <div className="table-wrap">
            <table className="thin">
              <thead>
                <tr>
                  <th>Column</th>
                  <th>Looks like</th>
                  <th>Means</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((c, i) => (
                  <tr key={c.header}>
                    <td className="path">{c.header}</td>
                    <td className="meta">{c.look.words}</td>
                    <td>
                      <div className="column-role">
                        <div className="input">
                          <select value={roleValue(c.guess)} disabled={working} onChange={(e) => setGuess(i, e.target.value)} aria-label={`What ${c.header} means`}>
                            {types.map((t) => (
                              <option key={t.name} value={`type:${t.name}`}>
                                an identifier of type {t.name}
                              </option>
                            ))}
                            <option value="new">a new type: {c.guess.new_type ?? (typeName(c.header) || "identifier")}</option>
                            <option value="canonical">the number that stands for the person</option>
                            <option value="code">the code itself</option>
                            <option value="ignore">ignored</option>
                          </select>
                        </div>
                        {c.guess.role === "identifier" && c.guess.new_type !== null && (
                          <div className="input">
                            <input
                              value={c.description}
                              placeholder={`What a ${c.guess.new_type} is`}
                              disabled={working}
                              aria-label={`Describe the type ${c.guess.new_type}`}
                              onChange={(e) => setColumns((was) => was.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="meta">
            Any shape works: identifier to code, identifier to the person's number, or several identifiers in one row. A column may be ignored. A type is picked from the registry's list
            {types.length > 0 ? ` (${types.map((t) => t.name).join(", ")})` : ""} or made here, with a description.
          </span>
          {refusal && <p className="warn">{refusal}</p>}
          {!refusal && newTypeRefusal && <p className="warn">{newTypeRefusal}</p>}
        </div>
      )}
      {rehearsal.kind === "working" && <Wait phase={rehearsal.phase} since={rehearsal.since} />}
      {rehearsal.kind === "failed" && <p className="warn">{rehearsal.why}</p>}
      {report && (
        <div className="field">
          <span className="label">What it will do</span>
          <dl className="facts">
            {reportLines(report).map((l) => (
              <div key={l.label} className="facts-pair">
                <dt>{l.label}</dt>
                <dd className={l.tone === "caution" ? "warn" : undefined}>{l.words}</dd>
              </div>
            ))}
          </dl>
          {conflicts > 0 && (
            <div className="table-wrap">
              <table className="thin">
                <thead>
                  <tr>
                    <th className="num">Row</th>
                    <th>Conflict</th>
                  </tr>
                </thead>
                <tbody>
                  {report.conflicts.slice(0, 50).map((c) => (
                    <tr key={`${c.row}-${c.why}`}>
                      <td className="num">{c.row}</td>
                      <td>{c.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.conflicts.length > 50 && <span className="meta">The first 50 of {n(report.conflicts.length)} conflicts.</span>}
            </div>
          )}
        </div>
      )}
      <div className="note gated">
        <Icon name="lock" />
        <div className="note-body">
          <p className="note-detail">Filed in the sealed store beside the registry, never in it. From now on any of these identifiers arriving in any dataset lands on the same subject, without a map.</p>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- Held until mapped */

type Way = "map" | "code" | "reveal";

export function HeldDialog({ caps, dataset, rows, onClose, onMap, onCode }: { caps: Capabilities; dataset: Dataset; rows: HeldRow[]; onClose: () => void; onMap: () => void; onCode: () => void }) {
  const [way, setWay] = useState<Way>("map");
  const [revealed, setRevealed] = useState<{ kind: "idle" } | { kind: "working"; since: number } | { kind: "shown"; rows: Revealed[] } | { kind: "failed"; why: string }>({ kind: "idle" });
  const sensitive = sees(caps, "sensitive");
  const codes = served(caps, "POST /api/linkage/held/code");
  const reveals = served(caps, "POST /api/linkage/held/reveal") && sensitive;
  const reveal = () => {
    setRevealed({ kind: "working", since: Date.now() });
    linkage
      .reveal(dataset.name)
      .then((r) => setRevealed({ kind: "shown", rows: r }))
      .catch((e: unknown) => setRevealed({ kind: "failed", why: messageOf(e) }));
  };
  const choice = (id: Way, title: string, words: string, offered: boolean) => (
    <label className={offered ? "radio-row" : "radio-row off"}>
      <input type="radio" name="held-way" checked={way === id} disabled={!offered} onChange={() => setWay(id)} />
      <span>
        <b>{title}</b>
        <span className="meta">{words}</span>
      </span>
    </label>
  );
  const foot = (
    <div className="row actions">
      <span className="grow" />
      <button type="button" className="button secondary" onClick={onClose}>
        Close
      </button>
      {way === "map" && (
        <button type="button" className="button" onClick={onMap}>
          Upload a CSV
        </button>
      )}
      {way === "code" && (
        <button type="button" className="button" disabled={!codes} onClick={onCode}>
          Code them anyway
        </button>
      )}
      {way === "reveal" && (
        <button type="button" className="button" disabled={!reveals || revealed.kind === "working" || revealed.kind === "shown"} onClick={reveal}>
          Reveal them to me
        </button>
      )}
    </div>
  );
  return (
    <Dialog title={`Held until mapped · ${dataset.name}`} icon="alert" onClose={onClose} foot={foot}>
      <p className="lede held-lede">
        Files whose identifier the map does not know. They stay in <span className="path">dcm-original</span>, reach neither <span className="path">dcm-anon</span> nor the registry, and are counted on their batch until someone says who they are about.
      </p>
      <div className="table-wrap">
        <table className="thin">
          <thead>
            <tr>
              <th>Identifier</th>
              <th className="num">Files</th>
              <th>Looks like</th>
              <th>Batch</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="meta">
                  {dataset.held && dataset.held.files > 0 ? `${n(dataset.held.files)} files held; this engine does not list them by shape.` : "Nothing is held."}
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.shape}-${r.batch ?? ""}-${i}`}>
                <td>
                  <span className="path">{r.shape}</span> <span className="meta">shape only</span>
                </td>
                <td className="num">{n(r.files)}</td>
                <td className="meta">{i === 0 ? `${shapeWords(r.shape)}, an identifier the map does not have` : `${shapeWords(r.shape)}, another shape in the identifier field`}</td>
                <td className="path">{r.batch ?? ""}</td>
                <td className="num">{r.first_seen ? whenWords(r.first_seen) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="choices">
        {choice("map", "Provide a map", "A CSV naming these identifiers, their type, and the person's number or code. The files are pseudonymised and brought in as soon as it is filed.", served(caps, "POST /api/linkage/imports"))}
        {choice("code", "Code them anyway", "Each gets a code derived from its identifier and a subject marked unmapped. A later map merges them into the right person.", codes)}
        {choice("reveal", "Reveal them to me", sensitive ? "Show the identifiers themselves, once, audited." : "Show the identifiers themselves, once, audited. Needs detail sensitive, which this account does not hold.", reveals)}
      </div>
      {revealed.kind === "working" && <Wait phase="reading the identifiers" since={revealed.since} />}
      {revealed.kind === "failed" && <p className="warn">{revealed.why}</p>}
      {revealed.kind === "shown" && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Identifier</th>
                <th className="num">Files</th>
                <th>Batch</th>
              </tr>
            </thead>
            <tbody>
              {revealed.rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="meta">
                    The door answered with no identifier.
                  </td>
                </tr>
              )}
              {revealed.rows.map((r) => (
                <tr key={r.identifier}>
                  <td className="path">{r.identifier}</td>
                  <td className="num">{typeof r.files === "number" ? n(r.files) : ""}</td>
                  <td className="path">{r.batch ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <span className="meta">Shown once, and recorded in the audit as read by you.</span>
        </div>
      )}
      <div className="note">
        <Icon name="info" />
        <div className="note-body">
          <p className="note-detail">The assistant can say what these shapes are and whether one is a second kind of identifier on this dataset; it never sees a value.</p>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- Change */

export function ChangeDialog({ dataset, onClose, onSaved }: { dataset: Dataset; onClose: () => void; onSaved: () => void }) {
  const [arrives, setArrives] = useState<NonNullable<Dataset["arrives"]>>(dataset.arrives ?? (dataset.handling?.arrives === "deidentified" ? "deidentified" : "identified"));
  const [unmapped, setUnmapped] = useState<"hold" | "code">(dataset.unmapped ?? "hold");
  const [cohort, setCohort] = useState(dataset.cohort ?? "");
  const [demographics, setDemographics] = useState(dataset.tags?.keep_demographics ?? true);
  const [remove, setRemove] = useState((dataset.tags?.remove ?? []).join("\n"));
  const [keep, setKeep] = useState((dataset.tags?.keep ?? []).join("\n"));
  const [originals, setOriginals] = useState<NonNullable<Dataset["originals_kept"]>>(dataset.originals_kept ?? "kept");
  const [onRelease, setOnRelease] = useState<Handling["on_release"]>(dataset.handling?.on_release ?? { dates: "keep", uids: "remap", deface: false });
  const [why, setWhy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const refusal = leavingRefusal(onRelease);
  const release = (patch: Partial<Handling["on_release"]>) => setOnRelease((was) => ({ ...was, ...patch }));
  const save = () => {
    setSaving(true);
    setWhy(null);
    const patch: DatasetPatch = {
      arrives,
      unmapped,
      cohort: cohort.trim() || null,
      tags: { keep_demographics: demographics, remove: tagList(remove), keep: tagList(keep) },
      originals_kept: originals,
      handling: { arrives: arrives === "identified" ? "identified" : "deidentified", on_release: onRelease },
    };
    datasets
      .set(dataset.id, patch)
      .then(onSaved)
      .catch((e: unknown) => {
        setSaving(false);
        setWhy(messageOf(e));
      });
  };
  const radio = (name: string, checked: boolean, onPick: () => void, words: string) => (
    <label className="choice">
      <input type="radio" name={name} checked={checked} disabled={saving} onChange={onPick} />
      {words}
    </label>
  );
  const foot = (
    <div className="row actions">
      <button type="button" className="button" disabled={saving || refusal !== null} onClick={save}>
        Save
      </button>
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      {why && <span className="warn">{why}</span>}
    </div>
  );
  return (
    <Dialog title={`How ${dataset.name} is pseudonymised`} icon="pencil" onClose={onClose} foot={foot}>
      <div className="field">
        <span className="label">What arrives</span>
        {radio("arrives", arrives === "identified", () => setArrives("identified"), "Identified: pseudonymised into dcm-anon before anything reads it")}
        {radio("arrives", arrives === "deidentified", () => setArrives("deidentified"), "De-identified: moved into dcm-anon as sent, its identifiers mapped when read")}
        {radio("arrives", arrives === "coded", () => setArrives("coded"), "Coded: our codes already in PatientID, taken verbatim")}
      </div>
      <div className="field">
        <span className="label">An identifier the map does not know</span>
        {radio("unmapped", unmapped === "hold", () => setUnmapped("hold"), "Holds its files until a map names it")}
        {radio("unmapped", unmapped === "code", () => setUnmapped("code"), "Gets a code derived from the identifier, and a subject marked provisional")}
      </div>
      <div className="field">
        <label className="label" htmlFor="dataset-cohort">
          Feeds a cohort
        </label>
        <div className="input">
          <input id="dataset-cohort" value={cohort} disabled={saving} placeholder="none" onChange={(e) => setCohort(e.target.value)} />
        </div>
        <span className="meta">Every subject a digest of this dataset creates joins it. Taking it away keeps every member.</span>
      </div>
      <div className="field">
        <span className="label">Tags</span>
        <label className="choice">
          <input type="checkbox" checked={demographics} disabled={saving} onChange={(e) => setDemographics(e.target.checked)} />
          Keep sex, weight and size: covariates, not identifiers
        </label>
        <div className="fields2">
          <div className="field">
            <label className="label" htmlFor="dataset-remove">
              Also remove
            </label>
            <div className="input mono">
              <textarea id="dataset-remove" rows={3} value={remove} disabled={saving} placeholder="StudyDescription" onChange={(e) => setRemove(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="dataset-keep">
              Also keep
            </label>
            <div className="input mono">
              <textarea id="dataset-keep" rows={3} value={keep} disabled={saving} placeholder="one tag keyword a line" onChange={(e) => setKeep(e.target.value)} />
            </div>
          </div>
        </div>
        <span className="meta">The four groups go on every batch; these lists are this dataset's own, on top.</span>
      </div>
      <div className="field">
        <span className="label">The originals</span>
        {radio("originals", originals === "kept", () => setOriginals("kept"), "Kept: read by the pseudonymiser only")}
        {radio("originals", originals === "vaulted", () => setOriginals("vaulted"), "Vaulted: moved out of the way, not read")}
        {radio("originals", originals === "purged", () => setOriginals("purged"), "Purged: the pseudonymised tree is all that is left")}
      </div>
      <div className="field">
        <span className="label">Dates, when it leaves</span>
        {radio("dates", onRelease.dates === "keep", () => release({ dates: "keep" }), "Kept as recorded")}
        {radio("dates", onRelease.dates === "shift", () => release({ dates: "shift" }), "Shifted, by one offset per person")}
        {radio("dates", onRelease.dates === "year", () => release({ dates: "year" }), "Cut to the year")}
      </div>
      <div className="field">
        <span className="label">UIDs, when it leaves</span>
        {radio("uids", onRelease.uids === "remap", () => release({ uids: "remap" }), "Remapped from the key")}
        {radio("uids", onRelease.uids === "preserve", () => release({ uids: "preserve" }), "Kept")}
      </div>
      <label className="choice">
        <input type="checkbox" checked={onRelease.deface} disabled={saving} onChange={(e) => release({ deface: e.target.checked })} />
        Faces removed before it leaves, by a pipeline over the released tree
      </label>
      {refusal && <p className="warn">{refusal}</p>}
      <p className="meta">The tree is not rewritten by a change here; the next bring-in reads the dataset so, and a release reads the leaving policy of the files it takes.</p>
      <p className="meta">Now: {arrivesWords({ ...dataset, arrives })} · {leavingWords(onRelease)}</p>
    </Dialog>
  );
}
