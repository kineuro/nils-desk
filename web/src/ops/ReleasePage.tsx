// SPDX-License-Identifier: AGPL-3.0-only
// The Release page: every release the registry holds as a table, and New
// release: of a cohort or of a query card's complete answer at stack grain,
// named for what it is of and the day, in a layout, leaving under each
// dataset's own leaving policy, into an export place. Select first says what
// it reaches without writing anything; Release queues the job.

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { desk, results, type DeskRecord, type HandleRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { cohorts, leavingLines, policyWords, reachesWords, releases, releaseSessionNaming, sessionsPhrase, suggestedName, type Cohort, type CohortDetail, type Release, type Selected } from "../data/cohorts";
import { DATES_KEPT, sources, whenWords, type Source } from "../data/sources";
import { door as served } from "../deployment";
import { may } from "../grants";
import { placesKept } from "../objects/kept";
import type { Place } from "../objects/client";
import { surface } from "../results/state";
import { href } from "../routes";
import { sizeWords } from "../settings/database";
import { freeWords } from "../settings/places";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { DATASETS_OWN, overrideNote, releaseBody, type ReleaseSource } from "./release";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; list: Release[] };

const n = (v: number) => v.toLocaleString("en-US");

export function ReleasePage({ caps, page, arg }: { caps: Capabilities; page: string | null; arg: string | null }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [said, setSaid] = useState<string | null>(null);
  const lists = served(caps, "GET /api/releases");
  const read = () => {
    if (!lists) {
      setLoad({ kind: "ready", list: [] });
      return;
    }
    releases
      .list()
      .then((r) => setLoad({ kind: "ready", list: r.releases }))
      .catch((e: Error) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: e.message })));
  };
  useEffect(read, [lists]); // eslint-disable-line react-hooks/exhaustive-deps
  const making = page === "new";
  const close = () => {
    location.hash = href("release");
  };
  return (
    <ReleasesBody caps={caps} list={load.kind === "ready" ? load.list : null} since={load.kind === "loading" ? load.since : null} why={load.kind === "failed" ? load.why : null} said={said} lists={lists} onNew={() => (location.hash = href("release", "new"))}>
      {making && (
        <NewReleaseDialog
          caps={caps}
          cohort={arg}
          existing={load.kind === "ready" ? load.list : []}
          onClose={close}
          onDone={(words) => {
            setSaid(words);
            close();
            read();
          }}
        />
      )}
    </ReleasesBody>
  );
}

export interface ReleasesBodyProps {
  caps: Capabilities;
  list: readonly Release[] | null;
  since?: number | null;
  why: string | null;
  said?: string | null;
  /** Whether the engine lists releases at all. */
  lists?: boolean;
  now?: number;
  onNew: () => void;
  children?: React.ReactNode;
}

/** Why a new release is not offered, or null when it is. */
export function releasingRefusal(caps: Capabilities): string | null {
  if (!served(caps, "POST /api/releases")) return "This engine has no release door.";
  return may(caps, "release:work") ? null : "Releasing needs work on the Release page.";
}

/** The page as it draws from what it read. */
export function ReleasesBody({ caps, list, since = null, why, said = null, lists = true, now = Date.now(), onNew, children }: ReleasesBodyProps) {
  const today = new Date(now);
  const refusal = releasingRefusal(caps);
  return (
    <section className="data releases">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Release</span>
          <h1>Releases</h1>
          <p className="lede">What left the registry: each release as a dataset written to an export place, under the leaving policy of the datasets its files came from, and whether it was handed over.</p>
        </div>
        {refusal === null && (
          <button type="button" className="button" onClick={onNew}>
            <Icon name="release" />
            New release
          </button>
        )}
      </div>
      {refusal !== null && <p className="meta">{refusal}</p>}
      {said && <p className="ok-words">{said}</p>}
      {list === null && !why && <Wait phase="reading the releases" since={since ?? now} size="panel" />}
      {why && <p className="warn">The releases could not be read: {why}</p>}
      {list !== null && list.length === 0 && <p className="meta">{lists ? "No release yet." : "This engine does not list its releases; a new one is still made from here."}</p>}
      {list !== null && list.length > 0 && (
        <div className="table-wrap">
          <table className="thin releases">
            <thead>
              <tr>
                <th>Name</th>
                <th>Version</th>
                <th>Layout</th>
                <th>Dates</th>
                <th>UIDs</th>
                <th className="num">Subjects</th>
                <th className="num">Sessions</th>
                <th>When</th>
                <th>By</th>
                <th>Handed over</th>
                <th>Withdrawn</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const policy = policyWords(r);
                // a row keeps the policy it was released under: one from before record 38 S3 may read shifted or cut to the year, and numbered its sessions in date order
                const naming = releaseSessionNaming(r);
                return (
                  <tr key={r.id} className={r.withdrawn_at ? "withdrawn" : undefined}>
                    <td>
                      <b className="path">{r.name}</b>
                    </td>
                    <td className="num">{r.version}</td>
                    <td>{r.layout ?? ""}</td>
                    <td>{policy.dates}</td>
                    <td>{policy.uids}</td>
                    <td className="num">{r.subjects !== null ? n(r.subjects) : ""}</td>
                    <td className="num">
                      {typeof r.sessions === "number" ? n(r.sessions) : ""}
                      {naming && <span className="meta">{naming}</span>}
                    </td>
                    <td className="nowrap">{whenWords(r.started_at, today)}</td>
                    <td>{r.actor ?? ""}</td>
                    <td>{r.handed_over ? whenWords(r.handed_over, today) : "not yet"}</td>
                    <td>{r.withdrawn_at ? [whenWords(r.withdrawn_at, today), r.withdrawn_by, r.withdrawn_why].filter(Boolean).join(" · ") : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {children}
    </section>
  );
}

interface Card {
  handle: HandleRow;
  name: string;
}

/** The kept cards a release may be of: complete answers at stack grain the person may release. */
export function releasableCards(handles: HandleRow[], record: DeskRecord, epoch: number, grants: readonly string[]): Card[] {
  return surface(handles, record, epoch, grants, false)
    .filter((s) => s.release.enabled && s.handle.grain === "stack")
    .map((s) => ({ handle: s.handle, name: s.handle.name ?? `handle ${s.handle.id}` }));
}

/** New release: of a cohort or a card's answer, its name, layout, how it leaves per dataset, where it is written. */
export function NewReleaseDialog({ caps, cohort: chosen, existing, onClose, onDone }: { caps: Capabilities; cohort: string | null; existing: readonly Release[]; onClose: () => void; onDone: (words: string) => void }) {
  const [of, setOf] = useState<"cohort" | "card">("cohort");
  const [cohort, setCohort] = useState(chosen ?? "");
  const [handle, setHandle] = useState<number | null>(null);
  const [list, setList] = useState<Cohort[] | null>(null);
  const [detail, setDetail] = useState<CohortDetail | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [srcs, setSrcs] = useState<Source[] | null>(null);
  const [named, setNamed] = useState<string | null>(null);
  const [layout, setLayout] = useState("bids");
  const [scheme, setScheme] = useState("");
  // record 26 section 13: the UIDs are each dataset's own until a person overrides them here, and nothing is sent for them until then.
  // The dates are no choice: every release keeps the real date (record 38 S3)
  const [uids, setUids] = useState(DATASETS_OWN);
  const [windowDays, setWindowDays] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState<number | null>(null);
  const [out, setOut] = useState("");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [busy, setBusy] = useState<{ phase: string; since: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const places = useKept(placesKept);
  const epoch = caps.engine?.registry.epoch ?? 0;

  useEffect(() => {
    if (served(caps, "GET /api/places")) placesKept.ensure();
    if (served(caps, "GET /api/cohorts")) cohorts.list().then((l) => setList(l.filter((c) => !c.retired_at)), () => setList([]));
    else setList([]);
    if (served(caps, "GET /api/ask/handles"))
      Promise.all([results.handles(), desk.results()]).then(
        ([h, r]) => setCards(releasableCards(h.handles, r, epoch, caps.person.grants)),
        () => setCards([]),
      );
    else setCards([]);
    if (served(caps, "GET /api/sources"))
      sources.list().then(
        (r) => {
          setSrcs(r.sources);
          setWindowDays(typeof r.window_days === "number" ? r.window_days : null);
        },
        () => setSrcs([]),
      );
    else setSrcs([]);
  }, [caps, epoch]);

  useEffect(() => {
    setDetail(null);
    setSelected(null);
    if (of !== "cohort" || cohort === "" || !served(caps, "GET /api/cohorts/{name}")) return;
    let alive = true;
    cohorts.get(cohort).then(
      (d) => alive && setDetail(d),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [of, cohort, caps]);

  const card = cards?.find((c) => c.handle.id === handle) ?? null;
  const suggested = useMemo(() => suggestedName(of === "cohort" ? cohort : (card?.name ?? "card"), existing), [of, cohort, card, existing]);
  const name = named ?? suggested;
  const exports = (places.value?.places ?? []).filter((p) => p.role === "export" && p.retired_at === null);
  const place: Place | null = exports.find((p) => p.id === placeId) ?? exports[0] ?? null;
  const written = place ? `${place.path.replace(/\/+$/, "")}/${name}` : out.trim();
  const src: ReleaseSource = of === "cohort" ? { kind: "hand", cohorts: cohort ? [cohort] : [] } : { kind: "handle", handle: card?.handle };
  const built = releaseBody(src, { name, out: written, layout, scheme_name: scheme || undefined, uids }, []);
  const lines = srcs ? leavingLines(srcs, of === "cohort" ? (detail?.sources_holding ?? null) : null) : [];
  const override = overrideNote(uids);
  const waiting = of === "cohort" ? (detail?.waiting ?? list?.find((c) => c.name === cohort)?.waiting ?? 0) : 0;
  const selects = of === "cohort" && cohort !== "" && served(caps, "POST /api/select");

  const selectFirst = () => {
    setBusy({ phase: "reading what it reaches", since: Date.now() });
    setFailed(null);
    releases
      .select({ cohorts: [cohort] })
      .then((s) => setSelected(s))
      .catch((e: Error) => setFailed(e.message))
      .finally(() => setBusy(null));
  };
  const release = () => {
    if (!built.ok) return;
    setBusy({ phase: "queueing the release", since: Date.now() });
    setFailed(null);
    releases
      .make(built.body)
      .then((j) => onDone(`Release ${name} is queued as job ${j.job}: ${built.summary}, written to ${written}.`))
      .catch((e: Error) => {
        setBusy(null);
        setFailed(e.message);
      });
  };

  const summary = (c: Cohort) => `${n(c.subjects)} subjects · ${sessionsPhrase(c.sessions)} · ${n(c.stacks)} stacks${c.waiting > 0 ? `, ${n(c.waiting)} still waiting on Review` : ""}`;
  const chosenCohort = list?.find((c) => c.name === cohort) ?? null;

  return (
    <Dialog
      title="New release"
      icon="release"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{built.ok ? "Select first says what it reaches without writing anything." : `Needs ${built.why}.`}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {selects && (
            <button type="button" className="button secondary" disabled={busy !== null} onClick={selectFirst}>
              Select first
            </button>
          )}
          <button type="button" className="button" disabled={busy !== null || !built.ok} onClick={release}>
            Release
          </button>
        </div>
      }
    >
      <div className="field">
        <span className="label">Of</span>
        <div className="choices">
          <label className="radio-row">
            <input type="radio" name="of" checked={of === "cohort"} onChange={() => setOf("cohort")} />
            <span>
              <b>A cohort{chosenCohort && of === "cohort" ? <>: <span className="path">{chosenCohort.name}</span></> : ""}</b>
              <span className="meta">{chosenCohort ? summary(chosenCohort) : "every current member, and every stack of theirs"}</span>
            </span>
          </label>
          {of === "cohort" && (
            <span className="input">
              <select value={cohort} onChange={(e) => setCohort(e.target.value)} aria-label="Which cohort">
                <option value="">{list === null ? "reading the cohorts" : list.length === 0 ? "no cohort yet" : "choose a cohort"}</option>
                {(list ?? []).map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </span>
          )}
          <label className="radio-row">
            <input type="radio" name="of" checked={of === "card"} onChange={() => setOf("card")} />
            <span>
              <b>A query card&apos;s answer</b>
              <span className="meta">a complete answer at stack grain, kept on this desk and not stale</span>
            </span>
          </label>
          {of === "card" && (
            <span className="input">
              <select value={handle ?? ""} onChange={(e) => setHandle(e.target.value === "" ? null : Number(e.target.value))} aria-label="Which card">
                <option value="">{cards === null ? "reading the cards" : cards.length === 0 ? "no complete answer at stack grain is kept" : "choose a card"}</option>
                {(cards ?? []).map((c) => (
                  <option key={c.handle.id} value={c.handle.id}>
                    {c.name} · {n(c.handle.row_count)} stacks
                  </option>
                ))}
              </select>
            </span>
          )}
        </div>
      </div>
      <div className="fields2">
        <label className="field">
          <span className="label">Name</span>
          <span className="input mono">
            <input value={name} onChange={(e) => setNamed(e.target.value)} />
          </span>
        </label>
        <label className="field">
          <span className="label">Layout</span>
          <span className="input">
            <select value={layout} onChange={(e) => setLayout(e.target.value)}>
              <option value="bids">BIDS</option>
              <option value="descriptive">Descriptive</option>
            </select>
          </span>
        </label>
      </div>
      <div className="field">
        <span className="label">How it leaves</span>
        <dl className="facts">
          {lines.map((l) => (
            <div key={l.dataset} className="facts-pair">
              <dt>from {l.dataset}</dt>
              <dd>
                {l.words}
                {l.note && <span className="meta"> · {l.note}</span>}
              </dd>
            </div>
          ))}
          {lines.length === 0 && (
            <div className="facts-pair">
              <dt>datasets</dt>
              <dd className="meta">{srcs === null ? "reading the datasets" : of === "cohort" && cohort === "" ? "choose a cohort" : "no dataset read; each dataset's own handling applies to its files"}</dd>
            </div>
          )}
          <div className="facts-pair">
            <dt>sessions</dt>
            <dd>
              <span className="input scheme">
                <input value={scheme} placeholder="the registry's scheme, as bound today" onChange={(e) => setScheme(e.target.value)} aria-label="Session scheme" />
              </span>
              <span className="meta">{[windowDays === null ? null : `The session cache was built under a ${n(windowDays)}-day window.`, DATES_KEPT].filter(Boolean).join(" ")}</span>
            </dd>
          </div>
          <div className="facts-pair">
            <dt>override</dt>
            <dd>
              <span className="row wrap">
                <span className="input">
                  <select value={uids} onChange={(e) => setUids(e.target.value)} aria-label="UIDs for every file">
                    <option value={DATASETS_OWN}>UIDs: each dataset&apos;s own</option>
                    <option value="remap">UIDs remapped</option>
                    <option value="preserve">UIDs kept</option>
                  </select>
                </span>
              </span>
              <span className={override === null ? "meta" : "warn"}>{override ?? "Each dataset's own leaving policy applies to its own files. Nothing is sent for the UIDs unless you override them here."}</span>
            </dd>
          </div>
          <div className="facts-pair">
            <dt>written to</dt>
            <dd>
              {exports.length > 0 ? (
                <span className="row wrap">
                  <span className="input">
                    <select value={place?.id ?? ""} onChange={(e) => setPlaceId(Number(e.target.value))} aria-label="Export place">
                      {exports.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </span>
                  {place && <span className="meta">{[place.path, freeWords(place) ? `${freeWords(place)} free` : null].filter(Boolean).join(" · ")}</span>}
                </span>
              ) : (
                <span className="input mono">
                  <input value={out} placeholder="a directory under an export place, on the engine's host" onChange={(e) => setOut(e.target.value)} aria-label="Where to write" />
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>
      {waiting > 0 && (
        <div className="note caution">
          <Icon name="alert" />
          <div className="note-body">
            <p className="note-detail">
              {n(waiting)} stacks of this cohort wait on Review. They leave with the rules&apos; verdict as it stands, marked unsure in the dataset&apos;s report. Sort them first to release them settled.
            </p>
          </div>
        </div>
      )}
      {busy && <Wait phase={busy.phase} since={busy.since} />}
      {selected && <p className="ok-words">{reachesWords(selected, sizeWords)}</p>}
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}
