// SPDX-License-Identifier: AGPL-3.0-only
// The Pseudonymisation page of a dataset (record 27, R1): the value, not the
// sentence. Identity holds the two trees, what a file's identifier is read
// from and what the map knows; Tags holds the removed tags by group and what
// this dataset adds to them; When it leaves holds the dates, the UIDs and the
// faces. What used to stand in grey beside every value is behind one
// disclosure a card. At the side: the files held until mapped with their
// three ways out, where the originals stand with the acts on them, the two
// questions the identity-check station answers, and what waits on Review.
// Provide a map reads a CSV on this machine, guesses each column, rehearses
// the import and files it; Change edits the dataset's fields through its
// place, and where the originals stand is not among them, since only the act
// that moves or removes the files writes that. What a dialog was told is held
// here, by the page, so that reading the dataset again under an open dialog
// never loses an answer. Every control is gated on the door behind it: an
// engine without the door leaves one line in its place.

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { needsWork } from "../access";
import { stations, stationsServed, type StationRun, type Verdict } from "../assistant/stations";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, sees } from "../grants";
import { objects } from "../objects/client";
import { ops, type ReviewItem } from "../ops/client";
import { href } from "../routes";
import { assistantOffered } from "../sections";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { useKept } from "../ui/kept";
import {
  actEnded,
  arrivesWords,
  bytesWords,
  changePatch,
  csvRefusal,
  datasets,
  guessRole,
  heldGroups,
  heldLine,
  importColumns,
  leavingRefusal,
  leavingWords,
  linkage,
  lookAt,
  mapRefusal,
  MAX_MAP_ROWS,
  reportOf,
  NOTHING_ASKED,
  NOTHING_TYPED,
  originals as originalsDoor,
  originalsActs,
  originalsWords,
  parseCsv,
  proposedRule,
  reportLines,
  ruleWords,
  sawOf,
  shapeWords,
  typeName,
  vaultedInto,
  waitingLines,
  type ColumnLook,
  type ColumnRole,
  type Csv,
  type Dataset,
  type Guess,
  type HeldRow,
  type IdType,
  type ImportReport,
  type OriginalsActs,
  type OriginalsLook,
  type PlaceRow,
  type PurgeAsk,
  type Revealed,
  type TypesDoc,
  type VaultAsk,
} from "./pseudonyms";
import { countWords } from "./datasets";
import { PurgeDialog, VaultDialog } from "./Originals";
import { policyKept } from "./policy";
import { sources, whenWords, type Handling } from "./sources";
import { TagsDialog } from "./Tags";

// the whole sources answer is held, not the one dataset alone: a vault goes into no dataset's folder or trees, another's as much as this one's
type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; dataset: Dataset | null; datasets: Dataset[] };
// what a dialog has been told is held here, by the page, so that reading the dataset again under an open dialog never takes a person's answers away
type Opened = { kind: "map" } | { kind: "held" } | { kind: "change" } | { kind: "tags" } | { kind: "vault"; ask: VaultAsk } | { kind: "purge"; ask: PurgeAsk } | null;
type Check = { kind: "idle" } | { kind: "running"; question: string; since: number; run: StationRun | null } | { kind: "done"; question: string; run: StationRun; verdict: Verdict | null } | { kind: "failed"; question: string; why: string };

/** A fact as its value: what it is in small letters, then the value alone. */
type Cell = { k: string; v: string; title?: string };

const n = (v: number) => v.toLocaleString("en-US");

/** A tree's files, or that the engine has not counted them yet. */
const filesWords = (files: number | null | undefined) => (typeof files === "number" ? `${n(files)} ${files === 1 ? "file" : "files"}` : countWords(files));

function Values({ cells }: { cells: Cell[] }) {
  return (
    <div className="values">
      {cells.map((c) => (
        <div key={c.k} title={c.title}>
          <span className="k">{c.k}</span>
          <span className="v">{c.v}</span>
        </div>
      ))}
    </div>
  );
}

/** The sentence that used to stand beside every value, closed until it is asked for. */
function Says({ head, children }: { head: string; children: string }) {
  return (
    <details className="says">
      <summary>{head}</summary>
      <p>{children}</p>
    </details>
  );
}

export function PseudonymsPage({ caps, name, onChanged, onOpenTags }: { caps: Capabilities; name: string; onChanged?: () => void; onOpenTags?: () => void }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [types, setTypes] = useState<TypesDoc | null>(null);
  const [held, setHeld] = useState<HeldRow[] | null>(null);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [opened, setOpened] = useState<Opened>(null);
  const [check, setCheck] = useState<Check>({ kind: "idle" });
  const [said, setSaid] = useState<{ words: string; failed: boolean } | null>(null);
  const [look, setLook] = useState<OriginalsLook | null>(null);
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  /** What the pseudonymiser does to the standard elements it acts on, as the engine that owns it serves it (record 28). */
  const policy = useKept(policyKept);
  const removedTags = policy.value;
  /** Where the originals went, as this desk saw them go; the engine keeps the state, not the place. */
  const [vaulted, setVaulted] = useState<string | null>(null);
  const [acting, setActing] = useState<{ job: number; did: "vault" | "purge"; into: string | null } | null>(null);
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
      .then((r) => {
        const all = r.sources as Dataset[];
        const found = all.find((s) => s.name === name) ?? null;
        setLoad({ kind: "ready", dataset: found, datasets: all });
        // what an act on the originals would do, as the engine answers it, without doing any of it
        if (found && served(caps, "GET /api/places/{id}/originals")) originalsDoor.look(found.id).then(setLook, () => setLook(null));
      })
      .catch((e: unknown) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: messageOf(e) })));
    if (served(caps, "GET /api/pseudonymize/tags")) void policyKept.ensure();
    if (served(caps, "GET /api/linkage/types")) linkage.types().then(setTypes, () => setTypes(null));
    if (heldServed) linkage.held(name).then(setHeld, () => setHeld(null));
    if (served(caps, "GET /api/review") && may(caps, "review:see")) ops.review("open", undefined, 500).then((r) => setReview(r.items), () => undefined);
    if (served(caps, "GET /api/places") && may(caps, "places:see")) objects.places().then((r) => setPlaces(r.places), () => setPlaces([]));
  }, [name, caps, heldServed]);

  // the dataset is read again whenever the desk's capabilities change; only another dataset blanks the page, since blanking it takes down whatever is open over it and a dialog's answers with it
  const showing = useRef<string | null>(null);
  useEffect(() => {
    if (showing.current !== name) {
      showing.current = name;
      setLoad({ kind: "loading", since: Date.now() });
      setOpened(null);
      setLook(null);
    }
    read();
  }, [name, read]);

  // an act on the originals is a job like any other: Now and Pipelines show it while it runs, and the card says the new state once it ends
  useEffect(() => {
    if (acting === null) return;
    let alive = true;
    const t = setInterval(() => {
      ops.job(acting.job).then(
        (row) => {
          if (!alive || row.state === "queued" || row.state === "running" || row.state === "cancelling") return;
          setActing(null);
          // a stop is not a failure: the act says so in its own words, and the card goes on offering it
          const ended = actEnded(acting.did, row, acting.into);
          if (ended.end === "done" && acting.did === "vault") setVaulted(acting.into);
          setSaid({ words: ended.words, failed: ended.end === "failed" });
          read();
        },
        () => undefined,
      );
    }, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [acting, read]);

  const dataset = load.kind === "ready" ? load.dataset : null;
  const datasets = load.kind === "ready" ? load.datasets : [];

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
        setSaid({ words: `The held files get codes derived from their identifiers, as job ${j.job}; a later map merges them into the right person.`, failed: false });
        read();
      })
      .catch((e: unknown) => setSaid({ words: messageOf(e), failed: true }));
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
  const acts = originalsActs(caps, dataset);
  const identityItems = review.filter((i) => /^(identity|linkage)[.:]/.test(i.kind) && ofDataset(i, name));
  const waiting = waitingLines(identityItems, dataset.held?.files ?? null);
  const pixelItems = review.filter((i) => /pixel|burn/.test(i.kind) && ofDataset(i, name));
  const arrives = dataset.arrives ?? (dataset.handling?.arrives === "deidentified" ? "deidentified" : "identified");
  const onRelease = dataset.handling?.on_release;
  const batches = [...new Set(groups.flatMap((g) => g.batches))];

  // who a file is about: where the identifier is read, and what kind of identifier it is
  const rule = dataset.identity ?? null;
  const from = rule?.from?.[0];
  const readFrom = from?.field ? from.field : from?.path ? `folder ${from.path.segment} of the path` : "PatientID";
  const verbatim = rule?.code === "verbatim" || arrives === "coded";
  const originalsTree = dataset.trees?.originals ?? null;
  const anonTree = dataset.trees?.anon ?? null;
  const tags = dataset.tags ?? null;
  // the chooser shows all hundred by group, what becomes of each and what this dataset keeps; a person who may not change them still reads it
  const openTags = onOpenTags ?? (() => setOpened({ kind: "tags" }));

  const mapCells: Cell[] = [];
  if (types === null) mapCells.push({ k: "the map", v: served(caps, "GET /api/linkage/types") ? "not read" : "not listed here" });
  else if (types.types.length === 0) mapCells.push({ k: "the map", v: "nothing filed yet" });
  else {
    const filed = types.filed && types.filed.length > 0 ? `filed ${types.filed.slice(-3).map((d) => whenWords(d)).join(", ")}` : undefined;
    if (typeof types.identifiers === "number") mapCells.push({ k: "identifiers", v: n(types.identifiers), title: filed });
    mapCells.push({
      k: types.types.length === 1 ? "type" : "types",
      v: types.types.map((t) => `${t.name}${typeof t.identifiers === "number" ? ` ${n(t.identifiers)}` : ""}`).join(" · "),
      title: typeof types.several === "number" ? `${n(types.several)} subjects carry more than one` : undefined,
    });
    if (typeof types.subjects === "number") mapCells.push({ k: "subjects", v: n(types.subjects) });
  }

  const identityCells: Cell[] = [
    { k: "read from", v: readFrom },
    { k: "identifier", v: verbatim ? "taken as the code" : (rule?.id_type ?? "through the map") },
    ...mapCells,
    { k: "an unknown one", v: dataset.unmapped === "code" ? "coded from itself" : "held until mapped" },
    ...(types === null
      ? []
      : [
          {
            k: "merged",
            v: types.merged && types.merged.subjects > 0 ? `${n(types.merged.subjects)} subjects` : "none",
            title: types.merged?.last ? `last ${whenWords(types.merged.last)}` : undefined,
          },
        ]),
  ];

  const tagCells: Cell[] = [
    // what the pseudonymiser removes is the engine's to say: an engine that does not say it leaves the line out rather than carry a number of the desk's own
    ...(removedTags ? [{ k: "removed", v: `${removedTags.count} tags` }] : []),
    { k: "PatientID", v: "the code" },
    { k: "kept on purpose", v: tags?.keep_demographics === false ? "none, by this dataset" : "sex, weight, size" },
    { k: "written", v: "PatientAge", title: "computed before the birth date goes" },
    { k: "kept", v: "dates, times, UIDs" },
    { k: "private tags", v: "dropped, bar the pack's own" },
    { k: "overlays, curves", v: "dropped" },
    { k: "also removed", v: tags && tags.remove.length > 0 ? tags.remove.join(", ") : "none" },
    { k: "also kept", v: tags && tags.keep.length > 0 ? tags.keep.join(", ") : "none" },
    { k: "pixels", v: "untouched" },
    { k: "re-runs", v: "only what changed" },
  ];

  const leavingCells: Cell[] = [
    { k: "dates", v: onRelease?.dates === "shift" ? "shifted" : onRelease?.dates === "year" ? "cut to the year" : "kept" },
    { k: "UIDs", v: onRelease?.uids === "remap" ? "remapped from the key" : "kept" },
    { k: "faces", v: onRelease?.deface ? "removed" : "kept" },
  ];

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
            <p className="lede">
              Arrives {arrives === "identified" ? "identified" : arrives === "deidentified" ? "de-identified" : "coded"} · {heldFiles > 0 ? `${n(heldFiles)} files held` : "nothing held"}
            </p>
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
        {said && <p className={said.failed ? "warn" : "meta"}>{said.words}</p>}
        {changing !== null && <p className="meta">{changing}</p>}
        {check.kind !== "idle" && (
          <CheckPanel
            caps={caps}
            dataset={dataset}
            check={check}
            onClose={() => setCheck({ kind: "idle" })}
            onUsed={(words) => {
              setSaid({ words, failed: false });
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
            <h2>Identity</h2>
            {heldFiles > 0 && <span className="tag caution">{n(heldFiles)} held</span>}
          </div>
          <div className="flow-two">
            <div className="tree-card">
              <div className="row">
                <Icon name="lock" />
                <b className="path">{originalsTree?.path ?? "derivatives/dcm-original"}</b>
              </div>
              <div className="row">
                <b>{originalsTree ? filesWords(originalsTree.files) : "none"}</b>
                <span className="meta">{originalsTree ? "locked" : "it arrives with no identifiers"}</span>
              </div>
            </div>
            <Icon name="arrow" />
            <div className="tree-card on">
              <div className="row">
                <Icon name="shield" />
                <b className="path">{anonTree?.path ?? dataset.path}</b>
              </div>
              <div className="row">
                <b>{filesWords(anonTree?.files)}</b>
                <span className="meta">the registry's source{anonTree?.last_written ? ` · written ${whenWords(anonTree.last_written)}` : ""}</span>
              </div>
            </div>
          </div>
          <Values cells={identityCells} />
          <Says head="Where the identifiers are kept">
            Sealed in the store beside the registry, never in it, and every reading recorded. A code comes from the map and the key, so one person is one code in every dataset. The tree is laid out
            code, study, series, instance.
          </Says>
          {may(caps, "identity:see") && (
            <a className="tail" href={href("settings", "identity")}>
              Who sees what, on Identity
              <Icon name="chevron-right" />
            </a>
          )}
        </section>

        <section className="panel card">
          <div className="row card-head">
            <span className="sq brand">
              <Icon name="shield" />
            </span>
            <h2>Tags</h2>
          </div>
          {removedTags && (
            <>
              <div className="tagbar" aria-label="the removed tags by group">
                {removedTags.categories.map((g) => (
                  <i key={g.category} className={g.category} style={{ width: `${(g.count / removedTags.count) * 100}%` }} />
                ))}
              </div>
              <div className="row legend">
                {removedTags.categories.map((g) => (
                  <span key={g.category}>
                    <i className={`dot ${g.category}`} />
                    {g.category} {g.count}
                  </span>
                ))}
              </div>
            </>
          )}
          <Values cells={tagCells} />
          <div className="row">
            <button type="button" className="button secondary small" onClick={openTags}>
              Choose tags
            </button>
          </div>
          <Says head="Why the UIDs are kept">
            Dates, times and UIDs stay in the file, so the same study brought in twice is one study and not two. What becomes of them when the scans leave is the card below.
          </Says>
        </section>

        <section className="panel card">
          <div className="row card-head">
            <span className="sq brand">
              <Icon name="release" />
            </span>
            <h2>When it leaves</h2>
          </div>
          <Values cells={leavingCells} />
          <Says head="What is refused">
            Dates that move cannot keep the original UIDs, and that pair is refused. A shift is one offset a person, kept with the identifiers. Faces go by a pipeline over the released tree.
          </Says>
        </section>
      </div>

      <div className="aside">
        <section className={heldFiles > 0 ? "panel card held" : "panel card"}>
          <div className="row card-head">
            <Icon name="alert" size="lg" />
            <h2>Held until mapped</h2>
          </div>
          {heldFiles === 0 && <p className="meta">{heldServed ? "Nothing held." : "This engine holds no files for a map."}</p>}
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
              {n(heldIds)} {heldIds === 1 ? "identifier" : "identifiers"}
              {groups[0]?.since ? ` · since ${whenWords(groups[0].since)}` : ""}
              {batches.length > 0 ? ` · batch ${batches.join(", ")}` : ""}
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
            <Icon name="lock" size="lg" />
            <h2>The originals</h2>
          </div>
          <Values
            cells={[
              { k: "where they stand", v: originalsWords(dataset.originals_kept, vaulted ?? vaultedInto(dataset)) },
              ...(typeof originalsTree?.bytes === "number" ? [{ k: "size", v: bytesWords(originalsTree.bytes) }] : []),
            ]}
          />
          {(acts.vault || acts.purge) && (
            <div className="row">
              {acts.vault && (
                <button type="button" className="button quiet small" onClick={() => setOpened({ kind: "vault", ask: NOTHING_ASKED })}>
                  Vault it
                </button>
              )}
              {acts.purge && (
                <button type="button" className="button quiet small" onClick={() => setOpened({ kind: "purge", ask: NOTHING_TYPED })}>
                  Purge it
                </button>
              )}
            </div>
          )}
          {acts.refusal !== null && <span className="meta">{acts.refusal}</span>}
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
            setSaid({ words, failed: false });
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
      {opened?.kind === "tags" && (
        <TagsDialog
          caps={caps}
          dataset={dataset}
          policy={removedTags}
          onClose={() => setOpened(null)}
          onSaved={(words) => {
            setOpened(null);
            setSaid({ words, failed: false });
            read();
            onChanged?.();
          }}
        />
      )}
      {opened?.kind === "change" && (
        <ChangeDialog
          dataset={dataset}
          acts={acts}
          onAct={(did) => setOpened(did === "vault" ? { kind: "vault", ask: NOTHING_ASKED } : { kind: "purge", ask: NOTHING_TYPED })}
          onTags={openTags}
          onClose={() => setOpened(null)}
          onSaved={() => {
            setOpened(null);
            setSaid({ words: `${dataset.name} is changed; the next bring-in reads it so.`, failed: false });
            read();
            onChanged?.();
          }}
        />
      )}
      {opened?.kind === "vault" && (
        <VaultDialog
          caps={caps}
          dataset={dataset}
          look={look}
          places={places}
          datasets={datasets}
          ask={opened.ask}
          onAsk={(ask) => setOpened((was) => (was?.kind === "vault" ? { kind: "vault", ask } : was))}
          onClose={() => setOpened(null)}
          onQueued={(job, into) => {
            setOpened(null);
            setActing({ job, did: "vault", into });
            setSaid({ words: `Vaulting the originals of ${dataset.name} into ${into} is queued as job ${job}; Now and Pipelines show it while it runs.`, failed: false });
            read();
          }}
        />
      )}
      {opened?.kind === "purge" && (
        <PurgeDialog
          caps={caps}
          dataset={dataset}
          look={look}
          ask={opened.ask}
          onAsk={(ask) => setOpened((was) => (was?.kind === "purge" ? { kind: "purge", ask } : was))}
          onClose={() => setOpened(null)}
          onQueued={(job) => {
            setOpened(null);
            setActing({ job, did: "purge", into: null });
            setSaid({ words: `Purging the originals of ${dataset.name} is queued as job ${job}; Now and Pipelines show it while it runs.`, failed: false });
            read();
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
  /** The first values under the header, as the file has them. */
  first: string[];
  /** The description of a new type, typed here. */
  description: string;
}

/** What a column can be, in the order the select offers them. The engine takes these four and no others. */
const ROLES: { value: ColumnRole; words: string }[] = [
  { value: "identifier", words: "an identifier" },
  { value: "canonical", words: "the number the code comes from" },
  { value: "code", words: "the code itself" },
  { value: "ignore", words: "not read" },
];

/** Whether a column of this role files under a type of the site's. */
function typed(role: ColumnRole): boolean {
  return role === "identifier" || role === "canonical";
}

/** The type a column files under, as the type select names it. */
function typeValue(g: Guess): string {
  return g.id_type !== null ? `type:${g.id_type}` : "new";
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
        // what the engine will not read is said here, before a row of it is posted anywhere
        const refused = csvRefusal(csv);
        if (refused !== null) {
          setFile(null);
          setColumns([]);
          setWhy(refused);
          return;
        }
        setFile({ name: f.name, csv });
        setColumns(
          csv.header.map((h, i) => {
            const values = csv.rows.map((r) => r[i] ?? "");
            const look = lookAt(h, values);
            return { header: h, look, guess: guessRole(h, look, types), first: values.filter((v) => v.trim() !== "").slice(0, 3), description: "" };
          }),
        );
      })
      .catch((err: unknown) => setWhy(messageOf(err)));
  };

  // a column changed, so what the rehearsal said no longer stands for these columns: it is asked again before anything can be filed
  const change = (i: number, patch: (c: Column) => Column) => {
    setRehearsal({ kind: "idle" });
    setColumns((was) => was.map((c, j) => (j === i ? patch(c) : c)));
  };

  const setRole = (i: number, role: ColumnRole) =>
    change(i, (c) => {
      if (!typed(role)) return { ...c, guess: { role, id_type: null, new_type: null } };
      if (c.guess.id_type !== null || c.guess.new_type !== null) return { ...c, guess: { ...c.guess, role } };
      const g = guessRole(c.header, c.look, types);
      return { ...c, guess: { role, id_type: g.id_type, new_type: g.new_type ?? (typeName(c.header) || "identifier") } };
    });

  const setType = (i: number, value: string) =>
    change(i, (c) =>
      value === "new" ? { ...c, guess: { ...c.guess, id_type: null, new_type: typeName(c.header) || "identifier" } } : { ...c, guess: { ...c.guess, id_type: value.slice(5), new_type: null } },
    );

  const guesses = columns.map((c) => c.guess);
  const refusal = columns.length > 0 ? mapRefusal(guesses) : null;
  const newTypes = columns.filter((c) => typed(c.guess.role) && c.guess.new_type !== null);
  const newTypeRefusal =
    newTypes.length === 0
      ? null
      : !makesTypes
        ? "This engine makes no new types; choose one the site already has."
        : newTypes.some((c) => c.description.trim() === "")
          ? "A new type is made with a description: say in a few words what one of them is."
          : null;
  // the types a column names that the site has not got are made by the import itself; without that word the engine refuses the whole file rather than reading it
  const body = (dryRun: boolean) => ({
    place: dataset.name,
    columns: importColumns(columns.map((c) => c.header), guesses),
    rows: file?.csv.rows ?? [],
    dry_run: dryRun,
    make_types: newTypes.length > 0,
  });

  const rehearse = () => {
    setRehearsal({ kind: "working", phase: "rehearsing the map", since: Date.now() });
    linkage
      .import(body(true))
      .then((r) => setRehearsal({ kind: "report", report: reportOf(r) }))
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
  const conflicts = report === null ? 0 : report.conflicts.length;
  const working = rehearsal.kind === "working";
  const ready = file !== null && refusal === null && newTypeRefusal === null && !working;

  const foot = (
    <div className="row actions">
      <span className="meta grow">{sensitive ? "Read on this machine, posted once, and recorded as filed by you." : "Filing a map means reading identifiers, and you are not cleared to; the engine will refuse it."}</span>
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      {report === null ? (
        <button type="button" className="button" disabled={!ready} onClick={rehearse}>
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
      <div className="mapsteps">
        <div className="field">
          <span className="label">1 &middot; The file</span>
          <div className="field-row">
            {file ? (
              <>
                <span className="chip">
                  <Icon name="file" />
                  {file.name}
                </span>
                <span className="meta">
                  {n(file.csv.rows.length)} rows &middot; {n(file.csv.header.length)} columns
                </span>
              </>
            ) : (
              <span className="meta">A CSV: commas, one header row naming the columns, and a row for each person or identifier.</span>
            )}
            <input type="file" accept=".csv,text/csv,text/plain" onChange={pick} aria-label="Choose a CSV" />
          </div>
          <span className="meta">Up to {n(MAX_MAP_ROWS)} rows at once. It is read here in the browser and posted once to the engine; nothing of it is kept on this machine.</span>
          {why && <p className="warn">{why}</p>}
        </div>

        {columns.length > 0 && (
          <div className="field">
            <span className="label">2 &middot; What each column is</span>
            <MapColumns columns={columns} types={types} working={working} onRole={setRole} onType={setType} onDescription={(i, text) => change(i, (x) => ({ ...x, description: text }))} />
            <span className="meta">
              Several identifier columns in one row are several identifiers of one person. One column at most is the code and one at most is the number the code comes from; the rest are identifiers or
              are not read. Every identifier column files under a type of the site&rsquo;s{types.length > 0 ? ` (${types.map((t) => t.name).join(", ")})` : ""}, or under a new one made here with a
              description.
            </span>
            {refusal && <p className="warn">{refusal}</p>}
            {!refusal && newTypeRefusal && <p className="warn">{newTypeRefusal}</p>}
          </div>
        )}

        {columns.length > 0 && (
          <div className="field">
            <span className="label">3 &middot; The rehearsal</span>
            {rehearsal.kind === "idle" && (
              <span className="meta">
                The engine reads the whole file and writes nothing: how many subjects it knows and how many are new, the identifiers it would file, the held files it would release, and every conflict.
                Nothing can be filed until it has run and come back clean.
              </span>
            )}
            {rehearsal.kind === "working" && <Wait phase={rehearsal.phase} since={rehearsal.since} />}
            {rehearsal.kind === "failed" && <p className="warn">{rehearsal.why}</p>}
            {report && (
              <>
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
                    {report.conflicts.length > 50 && <span className="meta">The first 50 of {n(report.conflicts.length)}.</span>}
                  </div>
                )}
                <span className="meta">
                  {conflicts > 0
                    ? "The map is read whole and applied whole: while one conflict stands, nothing at all is written. Mend those rows and rehearse it again."
                    : "The map is read whole and applied whole, so what is above is what will happen. Filing it queues the work; held files it names are pseudonymised and brought in after."}
                </span>
              </>
            )}
          </div>
        )}

        <div className="note gated">
          <Icon name="lock" />
          <div className="note-body">
            <p className="note-detail">
              The identifiers go to the sealed store beside the registry, never into the registry itself, and filing a map is recorded against you. From now on any of these identifiers arriving in any
              dataset lands on the same person, with no map at all.
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * The columns the file was found to have, each with the first values under it
 * and what it means. The roles are written out one by one rather than looped
 * over: a select whose children come out of a loop as a fragment is not laid
 * out as options everywhere, and a role the engine does not take would be a
 * refusal of the whole file.
 */
export function MapColumns({
  columns,
  types,
  working,
  onRole,
  onType,
  onDescription,
}: {
  columns: Column[];
  types: IdType[];
  working: boolean;
  onRole: (i: number, role: ColumnRole) => void;
  onType: (i: number, value: string) => void;
  onDescription: (i: number, text: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="thin map-cols">
        <thead>
          <tr>
            <th>Column</th>
            <th className="col-look">Looks like</th>
            <th>Means</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((c, i) => (
            <tr key={c.header}>
              <td>
                <span className="path">{c.header}</span>
                <div className="col-first">{c.first.length > 0 ? c.first.join(", ") : "empty"}</div>
              </td>
              <td className="meta col-look">{c.look.words}</td>
              <td>
                <div className="column-role">
                  <div className="input">
                    <select value={c.guess.role} disabled={working} onChange={(e) => onRole(i, e.target.value as ColumnRole)} aria-label={`What ${c.header} means`}>
                      <option value="identifier">{ROLES[0].words}</option>
                      <option value="canonical">{ROLES[1].words}</option>
                      <option value="code">{ROLES[2].words}</option>
                      <option value="ignore">{ROLES[3].words}</option>
                    </select>
                  </div>
                  {typed(c.guess.role) && (
                    <div className="input">
                      <select value={typeValue(c.guess)} disabled={working} onChange={(e) => onType(i, e.target.value)} aria-label={`The type of ${c.header}`}>
                        {types.map((t) => (
                          <option key={t.name} value={`type:${t.name}`}>
                            of type {t.name}
                          </option>
                        ))}
                        <option value="new">a new type: {c.guess.new_type ?? (typeName(c.header) || "identifier")}</option>
                      </select>
                    </div>
                  )}
                  {typed(c.guess.role) && c.guess.new_type !== null && (
                    <div className="input">
                      <input
                        value={c.description}
                        placeholder={`What a ${c.guess.new_type} is`}
                        disabled={working}
                        aria-label={`Describe the type ${c.guess.new_type}`}
                        onChange={(e) => onDescription(i, e.target.value)}
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
  );
}

/* ---------------------------------------------------------------- Held until mapped */

type Way = "map" | "code" | "reveal";

export function HeldDialog({ caps, dataset, rows, onClose, onMap, onCode }: { caps: Capabilities; dataset: Dataset; rows: HeldRow[]; onClose: () => void; onMap: () => void; onCode: () => void }) {
  const [way, setWay] = useState<Way>("map");
  const [revealed, setRevealed] = useState<{ kind: "idle" } | { kind: "working"; since: number } | { kind: "shown"; rows: Revealed[] } | { kind: "failed"; why: string }>({ kind: "idle" });
  const sensitive = sees(caps, "sensitive");
  const maps = served(caps, "POST /api/linkage/imports");
  const codes = served(caps, "POST /api/linkage/held/code");
  const reveals = served(caps, "POST /api/linkage/held/reveal") && sensitive;
  const groups = heldGroups(rows);
  const files = dataset.held?.files ?? rows.reduce((s, r) => s + r.files, 0);
  const identifiers = dataset.held?.identifiers ?? rows.length;
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
        <button type="button" className="button" disabled={!maps} onClick={onMap}>
          Provide a map
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
      <div className="note caution">
        <Icon name="alert" />
        <div className="note-body">
          <p className="note-lead">
            {n(files)} {files === 1 ? "file" : "files"}, {n(identifiers)} {identifiers === 1 ? "identifier" : "identifiers"} the map does not know
          </p>
          <p className="note-detail">
            They stay in <span className="path">dcm-original</span>. They reach neither <span className="path">dcm-anon</span> nor the registry, no one is counted as their subject, and nothing of
            them is lost: they wait here until someone says who they are about.
          </p>
        </div>
      </div>
      <div className="field">
        <span className="label">The shapes they have</span>
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Shape</th>
                <th className="num">Files</th>
                <th className="num">Identifiers</th>
                <th>Batch</th>
                <th>First seen</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td colSpan={5} className="meta">
                    {files > 0 ? `${n(files)} files held; this engine does not list them by shape.` : "Nothing is held."}
                  </td>
                </tr>
              )}
              {groups.map((g) => (
                <tr key={g.shape}>
                  <td>
                    <span className="path">{g.shape}</span> <span className="meta">{shapeWords(g.shape)}</span>
                  </td>
                  <td className="num">{n(g.files)}</td>
                  <td className="num">{n(g.identifiers)}</td>
                  <td className="path">{g.batches.join(", ")}</td>
                  <td className="num">{g.since ? whenWords(g.since) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="meta">A shape, never a value: every digit shows as 9 and every letter as A.</span>
      </div>
      <div className="field">
        <span className="label">Three ways out</span>
        <div className="choices">
          {choice(
            "map",
            "Provide a map",
            "A CSV naming these identifiers and who they belong to. The files are pseudonymised and brought in as soon as it is filed, and the same identifiers arriving again land on the same people.",
            maps,
          )}
          {choice(
            "code",
            "Code them anyway",
            "Each gets a code worked out from its own identifier, and its subject is marked as coded without a map. The files come in at the next run; a later map folds them into the right person.",
            codes,
          )}
          {choice(
            "reveal",
            "Reveal them to me",
            sensitive
              ? "The identifiers themselves, shown once and never written down here. Each one is recorded as read by you."
              : "The identifiers themselves. Only someone cleared to see identifiers may ask for this, and you are not.",
            reveals,
          )}
        </div>
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

export function ChangeDialog({
  dataset,
  acts,
  onAct,
  onTags,
  onClose,
  onSaved,
}: {
  dataset: Dataset;
  acts: OriginalsActs;
  onAct: (did: "vault" | "purge") => void;
  /** To the chooser, which owns the tag lists this form used to hold too. */
  onTags: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [arrives, setArrives] = useState<NonNullable<Dataset["arrives"]>>(dataset.arrives ?? (dataset.handling?.arrives === "deidentified" ? "deidentified" : "identified"));
  const [unmapped, setUnmapped] = useState<"hold" | "code">(dataset.unmapped ?? "hold");
  const [cohort, setCohort] = useState(dataset.cohort ?? "");
  const [onRelease, setOnRelease] = useState<Handling["on_release"]>(dataset.handling?.on_release ?? { dates: "keep", uids: "remap", deface: false });
  const [why, setWhy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const refusal = leavingRefusal(onRelease);
  const release = (patch: Partial<Handling["on_release"]>) => setOnRelease((was) => ({ ...was, ...patch }));
  const save = () => {
    setSaving(true);
    setWhy(null);
    // where the originals stand is not among the fields: only the act that moves or removes the files writes that word. Nor are the tag
    // lists, which the chooser owns: a form that sent them would undo what the chooser wrote since this one was opened
    const patch = changePatch({ arrives, unmapped, cohort, on_release: onRelease });
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
        <span className="meta">
          Which tags this dataset keeps and removes, on top of the four groups that go on every batch, is chosen in Choose tags, where all hundred are listed with what becomes of each.
        </span>
        <div className="row">
          <button type="button" className="button quiet small" disabled={saving} onClick={onTags}>
            Choose tags
          </button>
        </div>
      </div>
      <div className="field">
        <span className="label">The originals</span>
        <p className="meta">{originalsWords(dataset.originals_kept, vaultedInto(dataset))}</p>
        <span className="meta">
          What becomes of them is not settled here. They are vaulted into another place or purged, and the act itself moves or removes the files; only that act writes the word the card reads, so it
          can never say purged while the files are still on disk.
        </span>
        {(acts.vault || acts.purge) && (
          <div className="row">
            {acts.vault && (
              <button type="button" className="button quiet small" disabled={saving} onClick={() => onAct("vault")}>
                Vault it
              </button>
            )}
            {acts.purge && (
              <button type="button" className="button quiet small" disabled={saving} onClick={() => onAct("purge")}>
                Purge it
              </button>
            )}
          </div>
        )}
        {acts.refusal !== null && <span className="meta">{acts.refusal}</span>}
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
