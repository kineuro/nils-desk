// SPDX-License-Identifier: AGPL-3.0-only
// Review, Main scans (record 55, decision 6 of 2026-10-10; the approved
// canvas, round 5): one dataset's or cohort's main scans, per role. The kind
// of scan first, as a trade-off of how many visits and subjects have one and
// how alike they are kept, then NILS picks within the kind per visit. The
// page shows the five numbers, the kinds, where they come from, the series
// and visit by visit, and the subjects of one group as cards (a visit opens
// its pick) or every subject as a strip with the group lit. Its rules sit in
// the panel beside it: a draft in the browser until it is saved, each change
// asked of the map door again, debounced. Nothing is asked of a person here.
// While the engine still reports pick questions of earlier runs, one quiet
// link leads to the old table.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { slotOf } from "../campaigns/values";
import { cohorts as cohortsDoor } from "../data/cohorts";
import { isRoot } from "../data/layout";
import { sources } from "../data/sources";
import { door as served } from "../deployment";
import { may } from "../grants";
import { ops } from "../ops/client";
import { href, narrow } from "../routes";
import { messageOf } from "../settings/common";
import { Empty } from "../ui/Empty";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { review } from "./client";
import {
  KEEP_ALIKE,
  MAP_DOOR,
  mainScansMissing,
  MAP_STRIPS_DOOR,
  MAP_SUBJECTS_DOOR,
  RULES_DOOR,
  canonical,
  edited,
  mainScans,
  paletteOf,
  roleWord,
  rolesOf,
  refusalWords,
  rulesOf,
  sameRules,
  saveRefusal,
  scopeKey,
  scopeOf,
  type Columns,
  type Group,
  type MapAnswer,
  type MapSubject,
  type MapVisit,
  type Order,
  type Rules,
  type RulesDoc,
  type Scope,
  type ScopeOf,
  type Strips,
  type SubjectsPage,
} from "./mainScans";
import { ByVisitBox, GroupBox, KindsBox, Numbers, SeriesBox, WhereBox, type Slot } from "./MainScansParts";
import { RulesPanel, StatusLine, type Status } from "./RulesPanel";
import { PICK_BORDER } from "./picks";
import { VisitPick } from "./VisitPick";
import "./mainScans.css";

const n = (v: number) => v.toLocaleString("en-US");

type Load<T> = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; value: T; busy: boolean; why: string | null };
const loading = <T,>(since = Date.now()): Load<T> => ({ kind: "loading", since });

/** The address of the old table of pick questions, narrowed to a dataset where the page is about one. */
export function earlierHref(scope: Scope | null): string {
  return narrow(href("review", "picks"), { earlier: 1, ...(scope ? { [scope.kind]: scope.name } : {}) });
}

/** How many pick questions of earlier runs are still open, for the scope where the engine narrows to it. */
function useEarlier(caps: Capabilities, scope: Scope | null): number {
  const [open, setOpen] = useState(0);
  const cohort = scope?.kind === "cohort" ? scope.name : undefined;
  const dataset = scope?.kind === "dataset" ? scope.name : undefined;
  useEffect(() => {
    if (!may(caps, "review:see")) return;
    let alive = true;
    const counted = served(caps, "GET /api/review/summary")
      ? review.summary(cohort, dataset).then((s) => s.by_kind[PICK_BORDER] ?? 0)
      : served(caps, "GET /api/review")
        ? ops.review("open", PICK_BORDER, 500, cohort, dataset).then((r) => r.items.filter((i) => i.status === "open").length)
        : Promise.resolve(0);
    counted.then(
      (v) => alive && setOpen(v),
      () => alive && setOpen(0),
    );
    return () => {
      alive = false;
    };
  }, [caps, cohort, dataset]);
  return open;
}

function EarlierLink({ open, scope }: { open: number; scope: Scope | null }) {
  if (open <= 0) return null;
  return (
    <a className="button quiet small" href={earlierHref(scope)}>
      {n(open)} pick {open === 1 ? "question" : "questions"} from earlier runs
    </a>
  );
}

/** A value settled: the latest one, once it stopped changing for a while. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

// ------------------------------------------------------------------ the draft, kept in the browser

/** A draft is kept by the scope the engine answered: its kind and id, so a renamed cohort keeps its draft. */
const draftKey = (s: ScopeOf) => `nils.mainScans.draft.${s.kind}:${s.id ?? s.name}`;

interface Draft {
  /** The version it was made from: a draft of an older version is let go. */
  base: number;
  rules: Rules;
}

function keptDraft(s: ScopeOf): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(s));
    if (!raw) return null;
    const d = JSON.parse(raw) as { base?: unknown; rules?: unknown };
    return typeof d.base === "number" ? { base: d.base, rules: rulesOf(d.rules) } : null;
  } catch {
    return null;
  }
}

function keepDraft(s: ScopeOf | null, d: Draft | null) {
  if (!s) return;
  try {
    if (d) sessionStorage.setItem(draftKey(s), JSON.stringify(d));
    else sessionStorage.removeItem(draftKey(s));
  } catch {
    // a browser that keeps nothing keeps the draft for this page only
  }
}

// ------------------------------------------------------------------ the chooser

interface Lists {
  datasets: string[];
  cohorts: string[];
}

/** The datasets and cohorts, read once and only once they are wanted: with no scope, or the chooser opened. A root holds datasets and is none. */
function useLists(caps: Capabilities, wanted: boolean): Lists | null {
  const [lists, setLists] = useState<Lists | null>(null);
  useEffect(() => {
    if (!wanted || lists !== null) return;
    let alive = true;
    const datasets = served(caps, "GET /api/sources") ? sources.list().then((r) => r.sources.filter((s) => !isRoot(s)).map((s) => s.name), () => [] as string[]) : Promise.resolve([] as string[]);
    const cohorts = served(caps, "GET /api/cohorts") ? cohortsDoor.list().then((l) => l.filter((c) => !c.retired_at).map((c) => c.name), () => [] as string[]) : Promise.resolve([] as string[]);
    Promise.all([datasets, cohorts]).then(([d, c]) => alive && setLists({ datasets: [...d].sort((a, b) => a.localeCompare(b)), cohorts: [...c].sort((a, b) => a.localeCompare(b)) }));
    return () => {
      alive = false;
    };
  }, [caps, wanted]);
  return lists;
}

const scopeHref = (s: Scope) => narrow(href("review", "picks"), { [s.kind]: s.name });

function ScopeLists({ lists, current }: { lists: Lists; current: Scope | null }) {
  if (lists.datasets.length + lists.cohorts.length === 0) return <Empty what="No dataset or cohort yet." back={{ label: "Datasets and cohorts", href: href("data", "datasets") }} />;
  const group = (kind: Scope["kind"], names: string[], title: string) =>
    names.length > 0 && (
      <div className="ms-choose">
        <span className="eyebrow">{title}</span>
        <div className="chips">
          {names.map((name) => {
            const on = current?.kind === kind && current.name === name;
            return (
              <a key={name} className={on ? "opt on" : "opt"} aria-current={on ? "page" : undefined} href={scopeHref({ kind, name })}>
                {name}
              </a>
            );
          })}
        </div>
      </div>
    );
  return (
    <>
      {group("dataset", lists.datasets, "Datasets")}
      {group("cohort", lists.cohorts, "Cohorts")}
    </>
  );
}

/** The chevron beside the title: every dataset and cohort the person may see, the page's own marked. */
function Chooser({ scope, lists, onOpen }: { scope: Scope; lists: Lists | null; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="ms-chooser" ref={box}>
      <button type="button" className="icon-button" aria-label="Another dataset or cohort" title="Another dataset or cohort" aria-expanded={open} onClick={() => {
          onOpen();
          setOpen((o) => !o);
        }}>
        <Icon name="chevron-down" />
      </button>
      {open && <div className="ms-pop">{lists === null ? <Wait phase="reading the datasets and cohorts" since={Date.now()} /> : <ScopeLists lists={lists} current={scope} />}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ the page

export function MainScansPage({ caps, query }: { caps: Capabilities; query?: Record<string, string> }) {
  // one scope object while the address names the same one, so what is read for it is read once
  const named = scopeOf(query);
  const kind = named?.kind ?? null;
  const name = named?.name ?? null;
  const scope = useMemo<Scope | null>(() => (kind && name ? { kind, name } : null), [kind, name]);
  const earlier = useEarlier(caps, scope);
  const [wanted, setWanted] = useState(false);
  const lists = useLists(caps, wanted || scope === null);
  const missing = mainScansMissing(caps);
  if (missing) {
    return (
      <section className="ms">
        <div className="ms-head">
          <div className="ms-title">
            <span className="eyebrow">Main scans</span>
            <h1>Which scan stands for each role</h1>
          </div>
        </div>
        <Empty what={missing} />
      </section>
    );
  }
  if (!served(caps, RULES_DOOR) || !served(caps, MAP_DOOR)) {
    return (
      <section className="ms">
        <div className="ms-head">
          <div className="ms-title">
            <span className="eyebrow">Main scans</span>
            <h1>Which scan stands for each role</h1>
          </div>
          <EarlierLink open={earlier} scope={scope} />
        </div>
        <Empty what="This engine does not draw a dataset's or cohort's main scans yet." />
      </section>
    );
  }
  if (!scope) {
    return (
      <section className="ms">
        <div className="ms-head">
          <div className="ms-title">
            <span className="eyebrow">Main scans</span>
            <h1>Which dataset or cohort</h1>
          </div>
          <EarlierLink open={earlier} scope={null} />
        </div>
        {lists === null ? <Wait phase="reading the datasets and cohorts" since={Date.now()} size="panel" /> : <ScopeLists lists={lists} current={null} />}
      </section>
    );
  }
  return <ScopePage key={scopeKey(scope)} caps={caps} scope={scope} earlier={earlier} lists={lists} onLists={() => setWanted(true)} />;
}

function ScopePage({ caps, scope, earlier, lists, onLists }: { caps: Capabilities; scope: Scope; earlier: number; lists: Lists | null; onLists: () => void }) {
  const [doc, setDoc] = useState<Load<RulesDoc>>(loading);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [following, setFollowing] = useState<{ version: number; job: number; since: number } | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [columns, setColumns] = useState<Columns>("scanner");
  const [group, setGroup] = useState<Group>({ by: "breaks" });
  const [order, setOrder] = useState<Order>("changes");
  const [page, setPage] = useState(0);
  const [view, setView] = useState<"cards" | "strips">("cards");
  const [rulesOpen, setRulesOpen] = useState(true);
  const [reload, setReload] = useState(0);
  const [map, setMap] = useState<{ at: string; load: Load<MapAnswer> }>({ at: "", load: loading() });
  const [subjects, setSubjects] = useState<{ at: string; load: Load<SubjectsPage> }>({ at: "", load: loading() });
  const [strips, setStrips] = useState<{ at: string; load: Load<Strips> }>({ at: "", load: loading() });
  const [palettes, setPalettes] = useState<Record<string, string[]>>({});
  const [visit, setVisit] = useState<{ role: string; subject: MapSubject; visit: MapVisit } | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const readRules = useCallback(
    () =>
      mainScans.rules(scope).then(
        (value) => {
          // a draft kept in this tab from before comes back with the rules it was made on
          setDraftState((d) => d ?? (value.scope ? keptDraft(value.scope) : null));
          setDoc({ kind: "ready", value, busy: false, why: null });
          return value;
        },
        (e: unknown) => {
          setDoc((was) => (was.kind === "ready" ? { ...was, why: messageOf(e) } : { kind: "failed", why: messageOf(e) }));
          return null;
        },
      ),
    [scope],
  );
  useEffect(() => {
    void readRules();
  }, [readRules]);

  const current = doc.kind === "ready" ? doc.value.current : null;
  const replied = doc.kind === "ready" ? doc.value.scope : null;
  const version = current?.version ?? null;
  const roles = current ? rolesOf(current.rules) : [];
  const shownRole = role !== null && roles.includes(role) ? role : (roles[0] ?? null);
  // a draft holds while it was made on the version saved now
  const live = draft !== null && current !== null && draft.base === current.version ? draft : null;
  const working = live?.rules ?? current?.rules ?? null;
  const dirty = live !== null;
  const asking = live?.rules ?? null;
  const settled = useSettled(asking, 300);
  const settledKey = settled ? canonical(settled) : "";
  // a change not yet asked of the map door: nothing is asked until the draft settles
  const pending = (asking ? canonical(asking) : "") !== settledKey;
  const changedRoles = live && current ? roles.filter((r) => canonical(live.rules.roles[r] ?? null) !== canonical(current.rules.roles[r] ?? null)) : [];

  // a draft made on an older version is never let go silently: it moves onto the version saved now, and says so
  useEffect(() => {
    if (draft === null || current === null || draft.base === current.version) return;
    const from = draft.base;
    const by = current.author ? ` by ${current.author}` : "";
    if (sameRules(draft.rules, current.rules)) {
      setDraftState(null);
      keepDraft(replied, null);
      setStatus({ tone: "ok", words: `Your changes were made on version ${from}; version ${current.version}, saved${by}, says the same.` });
      return;
    }
    const d = { base: current.version, rules: draft.rules };
    setDraftState(d);
    keepDraft(replied, d);
    setStatus({ tone: "warn", words: `Your changes were made on version ${from}; version ${current.version} is saved now${by}. The effect shows them against it.` });
  }, [draft, current, replied]);

  const setDraft = (next: Rules | null) => {
    if (!current) return;
    const d = next === null || sameRules(next, current.rules) ? null : { base: current.version, rules: next };
    setDraftState(d);
    keepDraft(replied, d);
  };

  // a save's pick run, followed until it ends, however the panel is opened or closed; then the page reads its picks again
  useEffect(() => {
    if (!following) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const { version: v, job, since } = following;
    const tick = () => {
      ops.job(job).then(
        (row) => {
          if (!alive) return;
          if (row.state === "done" || row.state === "failed" || row.state === "cancelled") {
            setStatus(
              row.state === "done"
                ? { tone: "ok", words: `Version ${v} saved; its picks are written.` }
                : { tone: "warn", words: `Version ${v} saved; its pick run ${row.state === "failed" ? "stopped" : "was cancelled"}${row.error ? `: ${row.error}` : "."}` },
            );
            setFollowing(null);
            setReload((x) => x + 1);
          } else {
            setStatus({ tone: "busy", words: `Version ${v} saved; picking with it (job ${job}, ${row.state})`, since });
            timer = setTimeout(tick, 2000);
          }
        },
        () => {
          if (alive) timer = setTimeout(tick, 4000);
        },
      );
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [following]);

  const save = async (reason: string): Promise<boolean> => {
    if (!live || !current || saving) return false;
    setSaving(true);
    setStatus(null);
    try {
      const done = await mainScans.save(scope, live.rules, reason, current.version);
      // the draft is what was saved: let it go before the new version is read, so it is not moved onto it
      setDraftState(null);
      keepDraft(replied, null);
      await readRules();
      const v = done.version || current.version + 1;
      if (done.job === null) {
        setStatus({ tone: "ok", words: `Version ${v} saved.` });
        setReload((x) => x + 1);
      } else if (!(may(caps, "pipelines:see") && served(caps, "GET /api/jobs/{id}"))) {
        setStatus({ tone: "ok", words: `Version ${v} saved; its pick run is queued (job ${done.job}).` });
        setReload((x) => x + 1);
      } else {
        const since = Date.now();
        setStatus({ tone: "busy", words: `Version ${v} saved; picking with it (job ${done.job})`, since });
        setFollowing({ version: v, job: done.job, since });
      }
      return true;
    } catch (e) {
      const r = saveRefusal(e);
      // someone saved first: the rules are read again, and the draft moves onto their version, said in one line
      if (r.kind === "stale") await readRules();
      else setStatus({ tone: "warn", words: refusalWords(r) });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const grow = useCallback(
    (r: string, kinds: (string | null)[]) => {
      const saved = current?.rules.roles[r]?.kinds_in_order ?? [];
      const held = kinds.filter((k): k is string => k !== null);
      setPalettes((p) => {
        const next = paletteOf(p[r] ?? [], saved, held);
        return next.length === (p[r] ?? []).length ? p : { ...p, [r]: next };
      });
    },
    [current],
  );

  // the map of the role, with the draft once it settles
  const mapAt = `${shownRole}|${columns}`;
  useEffect(() => {
    if (shownRole === null || version === null || pending) return;
    let alive = true;
    const at = `${shownRole}|${columns}`;
    setMap((m) => (m.at === at && m.load.kind === "ready" ? { at, load: { ...m.load, busy: true } } : { at, load: loading() }));
    mainScans.map(scope, shownRole, columns, settled).then(
      (value) => {
        if (!alive) return;
        setMap({ at, load: { kind: "ready", value, busy: false, why: null } });
        grow(shownRole, value.kinds.map((k) => k.key));
      },
      (e: unknown) => alive && setMap((m) => ({ at, load: m.at === at && m.load.kind === "ready" ? { ...m.load, busy: false, why: messageOf(e) } : { kind: "failed", why: messageOf(e) } })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the draft is asked by what it says, not by the object holding it
  }, [scope, shownRole, columns, settledKey, pending, reload, version, grow]);

  // the group's subjects, a page at a time
  // a page is shown only for the role, columns, group, order and page it was asked for; a draft's answer replaces the last one in place
  const subjectsAt = `${shownRole}|${columns}|${canonical(group)}|${order}|${page}`;
  useEffect(() => {
    if (shownRole === null || version === null || pending || !served(caps, MAP_SUBJECTS_DOOR) || view !== "cards") return;
    let alive = true;
    const at = `${shownRole}|${columns}|${canonical(group)}|${order}|${page}`;
    setSubjects((s) => (s.at === at && s.load.kind === "ready" ? { at, load: { ...s.load, busy: true } } : { at, load: loading() }));
    mainScans.subjects(scope, shownRole, columns, group, order, page, settled).then(
      (value) => {
        if (!alive) return;
        setSubjects({ at, load: { kind: "ready", value, busy: false, why: null } });
        grow(shownRole, value.subjects.flatMap((s) => s.visits.map((v) => v.kind)));
        // a group that shrank under a draft keeps a page that has subjects
        const last = Math.max(0, Math.ceil(value.total / (value.per_page || 24)) - 1);
        if (page > last) setPage(last);
      },
      (e: unknown) => alive && setSubjects({ at, load: { kind: "failed", why: messageOf(e) } }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the draft is asked by what it says
  }, [caps, scope, shownRole, columns, group, order, page, settledKey, pending, reload, version, view, grow]);

  // every subject's strips, while they are shown
  useEffect(() => {
    if (shownRole === null || version === null || pending || view !== "strips" || !served(caps, MAP_STRIPS_DOOR)) return;
    let alive = true;
    const at = `${shownRole}|${columns}`;
    setStrips((s) => (s.at === at && s.load.kind === "ready" ? { at, load: { ...s.load, busy: true } } : { at, load: loading() }));
    mainScans.strips(scope, shownRole, columns, settled).then(
      (value) => {
        if (!alive) return;
        setStrips({ at, load: { kind: "ready", value, busy: false, why: null } });
        grow(shownRole, value.kinds);
      },
      (e: unknown) => alive && setStrips({ at, load: { kind: "failed", why: messageOf(e) } }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the draft is asked by what it says
  }, [caps, scope, shownRole, columns, settledKey, pending, reload, version, view, grow]);

  if (doc.kind === "loading") return <Wait phase="reading the rules" since={doc.since} size="panel" />;
  if (doc.kind === "failed")
    return (
      <section className="ms">
        <div className="ms-head">
          <div className="ms-title">
            <span className="eyebrow">Main scans · {scope.kind}</span>
            <div className="ms-h1">
              <h1>{scope.name}</h1>
              <Chooser scope={scope} lists={lists} onOpen={onLists} />
            </div>
          </div>
        </div>
        <p className="warn">The rules could not be read: {doc.why}</p>
      </section>
    );

  const rulesDoc = doc.value;
  // the scope's own name as the engine answered it
  const title = rulesDoc.scope?.name || scope.name;
  const rr = shownRole !== null && working ? working.roles[shownRole] : undefined;
  const palette = shownRole !== null ? (palettes[shownRole] ?? []) : [];
  const slot: Slot = (k) => (k === null ? null : slotOf(palette, k));
  const m = map.at === mapAt ? map.load : loading<MapAnswer>();
  const mapValue = m.kind === "ready" ? m.value : null;
  // never a page of another role, columns or group: until its own answer comes, the cards wait
  const s = subjects.at === subjectsAt ? subjects.load : loading<SubjectsPage>(subjects.load.kind === "loading" ? subjects.load.since : Date.now());
  const st = strips.at === `${shownRole}|${columns}` ? strips.load : loading<Strips>();
  const change = (next: Rules) => setDraft(next);
  const chooseRole = (r: string) => {
    setRole(r);
    setGroup({ by: "breaks" });
    setPage(0);
  };
  const chooseGroup = (g: Group) => {
    setGroup(g);
    setPage(0);
    setView("cards");
  };
  const keep = rr?.keep_alike ?? "balanced";

  return (
    <section className="ms" aria-label={`Main scans of ${scope.name}`}>
      <div className="ms-layout">
        <div className="ms-main">
          <div className="ms-head">
            <div className="ms-title">
              <span className="eyebrow">Main scans · {scope.kind}</span>
              <div className="ms-h1">
                <h1>{title}</h1>
                <Chooser scope={scope} lists={lists} onOpen={onLists} />
              </div>
            </div>
            <EarlierLink open={earlier} scope={scope} />
            <button type="button" className="button secondary ms-rules-toggle" aria-expanded={rulesOpen} onClick={() => setRulesOpen((o) => !o)}>
              <Icon name="sliders" />
              Rules · version {rulesDoc.current.version}
              {dirty ? " · changed" : ""}
            </button>
          </div>

          <div className="ms-keys">
            <div className="chips" role="group" aria-label="Role">
              {roles.map((r) => (
                <button key={r} type="button" className={r === shownRole ? "opt on" : "opt"} aria-pressed={r === shownRole} onClick={() => chooseRole(r)}>
                  {roleWord(r)}
                  {changedRoles.includes(r) && <span className="ms-key-changed"> · changed</span>}
                </button>
              ))}
            </div>
            {rr && working && shownRole && (
              <div className="chips" role="group" aria-label="Keep alike">
                <span className="ms-label">Keep alike</span>
                {KEEP_ALIKE.map((k) => (
                  <button key={k.key} type="button" disabled={saving} className={keep === k.key ? "opt on" : "opt"} aria-pressed={keep === k.key} onClick={() => change(edited(working, (x) => void (x.roles[shownRole].keep_alike = k.key)))}>
                    {k.words}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="ms-line">{KEEP_ALIKE.find((k) => k.key === keep)?.line}</p>
          {!rulesOpen && <StatusLine status={status} />}
          {said && (
            <p className="meta ms-said" role="status">
              <Icon name="check" />
              {said}
            </p>
          )}
          {rulesDoc && doc.why && <p className="warn">The rules could not be read again: {doc.why}</p>}

          {m.kind === "loading" && <Wait phase="reading the main scans" since={m.since} size="panel" />}
          {m.kind === "failed" && <p className="warn">The main scans could not be read: {m.why}</p>}
          {m.kind === "ready" && shownRole && (
            <div className={m.busy ? "ms-map busy" : "ms-map"} aria-busy={m.busy}>
              {m.why && <p className="warn">The changes could not be shown: {m.why}</p>}
              <Numbers map={m.value} role={shownRole} keep={keep} />
              <div className="ms-pair">
                <KindsBox map={m.value} slot={slot} off={(k) => rr?.not_used.includes(k) ?? false} />
                <WhereBox map={m.value} slot={slot} group={group} onGroup={chooseGroup} columns={columns} onColumns={scope.kind === "cohort" ? setColumns : null} />
              </div>
              <div className="ms-pair">
                <SeriesBox map={m.value} slot={slot} group={group} onGroup={chooseGroup} />
                <ByVisitBox map={m.value} slot={slot} palette={palette} />
              </div>
              <GroupBox
                columns={columns}
                draft={dirty}
                group={group}
                onGroup={chooseGroup}
                view={view}
                onView={setView}
                order={order}
                onOrder={(o) => {
                  setOrder(o);
                  setPage(0);
                }}
                page={page}
                onPage={setPage}
                subjects={s.kind === "ready" ? s.value : null}
                subjectsSince={s.kind === "loading" ? s.since : null}
                subjectsBusy={s.kind === "ready" && s.busy}
                subjectsWhy={s.kind === "failed" ? s.why : served(caps, MAP_SUBJECTS_DOOR) ? null : "this engine does not list them yet"}
                strips={st.kind === "ready" ? st.value : null}
                stripsWhy={st.kind === "failed" ? st.why : served(caps, MAP_STRIPS_DOOR) ? null : "this engine does not list them yet"}
                slot={slot}
                onVisit={(subject, v) => shownRole && setVisit({ role: shownRole, subject, visit: v })}
              />
            </div>
          )}
        </div>

        {rulesOpen && working && shownRole && (
          <RulesPanel
            caps={caps}
            scope={scope}
            doc={rulesDoc}
            working={working}
            dirty={dirty}
            role={shownRole}
            roles={roles}
            onRole={chooseRole}
            map={mapValue}
            mapSince={m.kind === "loading" ? m.since : null}
            mapFailed={m.kind === "failed" ? m.why : null}
            mapBusy={pending || (m.kind === "ready" && m.busy)}
            mapStale={dirty && m.kind === "ready" ? m.why : null}
            effectReady={!pending && m.kind === "ready" && !m.busy && m.why === null}
            changedRoles={changedRoles}
            title={title}
            slot={slot}
            onChange={change}
            onRevert={() => setDraft(null)}
            onClose={() => setRulesOpen(false)}
            onSave={save}
            saving={saving}
            status={status}
          />
        )}
      </div>

      {visit && (
        <VisitPick
          caps={caps}
          scope={scope}
          role={visit.role}
          subject={visit.subject}
          visit={visit.visit}
          version={mapValue?.rules_version ?? rulesDoc.current.version}
          draft={dirty}
          slot={slot}
          onClose={() => setVisit(null)}
          onDone={(words) => {
            setVisit(null);
            setSaid(words);
            setReload((x) => x + 1);
          }}
        />
      )}
    </section>
  );
}
