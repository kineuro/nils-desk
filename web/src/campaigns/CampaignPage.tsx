// SPDX-License-Identifier: AGPL-3.0-only
// One campaign (record 45 S3, study A3): its source and question, who rates
// and who adjudicates, how far it is, how well the raters agree, its items by
// state, and its answers. Two acts: Close, which first shows what it will
// write, and Export, which writes a label set. Its Results view (record 55,
// ruling 35 (d)) is the maker's and an administrator's: the answers by rater,
// what was settled and written, the counts by value and the labels.

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may, mayAny } from "../grants";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Says, Values } from "../ui/Says";
import { useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { review } from "../review/client";
import {
  adjudicatorHas,
  agreementWords,
  answeredAxes,
  answerWords,
  campaigns,
  CLOSES_WORDS,
  closedWords,
  closeRefusal,
  closure,
  exportRefusal,
  itemTotal,
  kappa,
  pct,
  picturesOnly,
  principalOf,
  PURPOSE_WORDS,
  purposeOf,
  rateRefusal,
  refused as refusedWords,
  seesAnswers,
  sourceWords,
  STATES,
  stateWords,
  suggestOf,
  SUGGEST_WORDS,
  type Answer,
  type Assignment,
  type Campaign,
  type Closed,
  type Closure,
  type Item,
  type LabelSet,
} from "./client";
import { StateBar } from "./parts";
import type { RaterStats as Pace } from "./reader";
import { R48, statsFor } from "./readerDoors";
import { paceCaveat, RaterStats } from "./ReaderParts";
import { answerValueWords, headTone, itemName, ledeWords, nextAct, type ScanName } from "./page";
import { ensurePeople, nameOf, namesMap, peopleKept, type Named } from "./people";
import { galleryOffered } from "./gallery";
import { Suggestions } from "./Suggestions";
import { abServed, isAb } from "./ab";
import { AbPanel } from "./AbReader";
import { isPair, pairServed } from "./pair";
import { PairPanel } from "./PairReader";
import { anchoredServed, isAnchored } from "./anchored";
import { AnchoredPanel } from "./AnchoredReader";
import { checkAnswerLine, checkDecisionsWords, checkDoors, checkQuestionOf, checkServed, flagsParts, isCheck, type PartNames } from "./check";
import { CheckPanel, checkActs } from "./CheckPanel";
import { ratersRefusal, type RaterWarning } from "./raters";
import { RatersDialog } from "./RatersDialog";
import { namesRaters, raterNames, resultsRefusal } from "./results";
import { ResultsView } from "./Results";
import { aloneWords, closeStage, closingWords, isAxesGalleryLine, leaseLine, mayAskOneAxis, mayReadAllInBatches, missingModes, refusedLines, type LeaseLine } from "./upkeep";
import { AskOneDialog } from "./AskOneDialog";

const n = (v: number) => v.toLocaleString("en-US");
const ROWS = 200;

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; c: Campaign; answers: Answer[] | null; blind: boolean | null; sets: LabelSet[]; stats: Pace | null };

export function CampaignPage({ caps, id, missing = null }: { caps: Capabilities; id: string; missing?: number | null }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [acting, setActing] = useState<"close" | "export" | "raters" | "ask-one" | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [warned, setWarned] = useState<RaterWarning[]>([]);
  const readsSets = served(caps, "GET /api/label-sets") && mayAny(caps, "campaigns:see", "review:see");
  const read = useCallback(() => {
    const sets = readsSets ? campaigns.labelSets().catch(() => [] as LabelSet[]) : Promise.resolve([] as LabelSet[]);
    const stats = served(caps, R48.stats) ? statsFor(id).catch(() => null) : Promise.resolve(null);
    Promise.all([campaigns.one(id), campaigns.answersRead(id).catch(() => null), sets, stats])
      .then(([c, read, all, pace]) => setLoad({ kind: "ready", c, answers: read?.answers ?? null, blind: read?.blind ?? null, sets: all.filter((s) => s.campaign_id === c.id), stats: pace }))
      .catch((e: unknown) => setLoad({ kind: "failed", why: refusedWords(e) }));
  }, [readsSets, id, caps]);
  useEffect(() => read(), [read]);
  // people by name, read once a session (UX round 5)
  useEffect(() => ensurePeople(caps), [caps]);
  // a close running as a job: the page reads the campaign again until it is closed (2026-11-05)
  const closing = load.kind === "ready" && closeStage(load.c) === "running" && acting !== "close";
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(read, 2000);
    return () => clearTimeout(t);
  }, [closing, load, read]);
  const release = useCallback(
    (a: Assignment) => {
      campaigns
        .release(id, a.id)
        .then((r) => setSaid((r as Assignment & { words?: string }).words ?? `Gave back ${nameOf(namesMap(caps, peopleKept.get().value), a.principal).name}'s item.`))
        .catch((e: unknown) => setSaid(`Not given back: ${refusedWords(e)}`))
        .finally(read);
    },
    [id, read, caps],
  );
  const readAll = useCallback(() => {
    campaigns
      .holdBack(id, 0)
      .then((r) => setSaid(r.freed > 0 ? `Every item can now be read in batches and the gallery; ${n(r.freed)} set aside went back.` : "Every item can now be read in batches and the gallery."))
      .catch((e: unknown) => setSaid(`Not changed: ${refusedWords(e)}`))
      .finally(read);
  }, [id, read]);
  if (load.kind === "loading") return <Wait phase="reading the campaign" since={load.since} size="panel" />;
  if (load.kind === "failed") return <p className="warn">The campaign could not be read: {load.why}</p>;
  const c = load.c;
  return (
    <CampaignBody caps={caps} campaign={c} answers={load.answers} answersBlind={load.blind} sets={load.sets} stats={load.stats} said={said} warned={warned} missing={missing} onAct={setActing} onRelease={release} onReadAll={readAll} onAskOne={() => setActing("ask-one")}>
      {isCheck(c) && checkServed(caps) ? null : isAb(c) && abServed(caps) ? <AbPanel campaign={c} /> : isPair(c) && pairServed(caps) ? <PairPanel campaign={c} /> : isAnchored(c) && anchoredServed(caps) ? <AnchoredPanel campaign={c} /> : <Suggestions caps={caps} campaign={c} />}
      {acting === "close" && (
        <CloseDialog
          campaign={c}
          plan={closure(c, load.answers)}
          onClosed={read}
          onClose={() => {
            setActing(null);
            read();
          }}
          onDone={(w) => {
            setActing(null);
            setSaid(w);
            read();
          }}
        />
      )}
      {acting === "raters" && (
        <RatersDialog
          caps={caps}
          campaign={c}
          onClose={() => setActing(null)}
          onDone={(r, words) => {
            setActing(null);
            setSaid(words);
            setWarned(r.warnings);
            read();
          }}
        />
      )}
      {acting === "ask-one" && (
        <AskOneDialog
          campaign={c}
          onClose={() => setActing(null)}
          onDone={(words) => {
            setActing(null);
            setSaid(words);
            read();
          }}
        />
      )}
      {acting === "export" && (
        <ExportDialog
          campaign={c}
          onClose={() => setActing(null)}
          onDone={(set) => {
            setActing(null);
            setSaid(`Exported ${set.name} v${set.version}: ${n(set.rows)} ${set.rows === 1 ? "row" : "rows"}.`);
            read();
          }}
        />
      )}
    </CampaignBody>
  );
}

export interface CampaignBodyProps {
  caps: Capabilities;
  campaign: Campaign;
  answers: Answer[] | null;
  /** Whether the answers door answered blind (only the person's own), where it said. */
  answersBlind?: boolean | null;
  sets: LabelSet[];
  /** Each rater's pace, where the engine counts it (record 48 R1). */
  stats?: Pace | null;
  said?: string | null;
  /** Raters just added who already read these stacks in other campaigns, in the engine's words. */
  warned?: readonly RaterWarning[];
  /** The state the items table shows; all when null. */
  filter?: string | null;
  /** The view the page opens on: its items, or its results. */
  view?: "items" | "results";
  /** Stacks without their picture, as the make door counted them. */
  missing?: number | null;
  /** People by name, over what the desk's people door gave (UX round 5): for a page drawn without the door. */
  names?: ReadonlyMap<string, string>;
  /** Each scan's name where a door gave it, by stack; the page reads them where it may. */
  scans?: ReadonlyMap<number, ScanName>;
  onAct: (act: "close" | "export" | "raters") => void;
  /** Gives back a rater's live lease (2026-11-05). */
  onRelease?: (a: Assignment) => void;
  /** Sets none of each batch aside, where the campaign allows it (2026-11-05). */
  onReadAll?: () => void;
  /** Opens the confirm that moves the campaign to one asked axis, which brings the gallery. */
  onAskOne?: () => void;
  children?: React.ReactNode;
}

/** The most scans whose names the page reads, one small header read each. */
const NAMES_READ = 50;

/**
 * The names of the scans on the rows shown (UX round 5: a row reads as the
 * scan it is about, not "anchored:0"), from each stack's header door where the
 * person may read it: the series description, as the grid names a card. The
 * engine serves no door that names several stacks at once, so the page reads
 * at most {@link NAMES_READ} headers, a few at a time, and a campaign made to
 * show the pictures alone reads none.
 */
function useScanNames(enabled: boolean, stacks: readonly number[]): Map<number, ScanName> {
  const [names, setNames] = useState<Map<number, ScanName>>(() => new Map());
  // the stacks asked so far: each header is read once, however often the rows are drawn again while reads are out
  const asked = useRef(new Set<number>());
  // keyed on the rows' stacks, not on what is still unnamed: a name landing must not start the reads over
  const key = enabled ? stacks.join(",") : "";
  useEffect(() => {
    if (key === "") return;
    const queue = [...new Set(stacks)].filter((s) => !asked.current.has(s)).slice(0, Math.max(0, NAMES_READ - asked.current.size));
    if (queue.length === 0) return;
    for (const s of queue) asked.current.add(s);
    let alive = true;
    const read = async () => {
      while (alive) {
        const s = queue.shift();
        if (s === undefined) return;
        const h = await review.header(s).catch(() => null);
        const d = h?.texts?.series_description;
        const got: ScanName = { description: typeof d === "string" && d.trim() ? d.trim() : null, code: null };
        // merged as it lands, even when the rows changed meanwhile: the name is the stack's, whatever row shows it
        setNames((m) => new Map(m).set(s, got));
      }
    };
    void Promise.all(Array.from({ length: 6 }, read));
    return () => {
      alive = false;
      // not started yet: free to be asked by the rows drawn next
      for (const s of queue) asked.current.delete(s);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the stacks are read through `key`
  }, [key]);
  return names;
}

/** A person by name, the principal cut short on hover; never a whole hash. */
export function Who({ named }: { named: Named }) {
  return (
    <span className="who" title={named.title ?? undefined}>
      {named.name}
    </span>
  );
}

/** One campaign as it draws from what it read. */
export function CampaignBody({ caps, campaign: c, answers, answersBlind = null, sets, stats = null, said = null, warned = [], filter: initial = null, view: opened = "items", missing = null, names: given, scans: givenScans, onAct, onRelease, onReadAll, onAskOne, children }: CampaignBodyProps) {
  const [filter, setFilter] = useState<string | null>(initial);
  // record 55, ruling 35 (d): the results, where the person may read them
  const results = resultsRefusal(caps, c) === null;
  const [view, setView] = useState<"items" | "results">(opened);
  const items = c.items ?? [];
  const shown = filter ? items.filter((i) => i.state === filter) : items;
  const rate = rateRefusal(caps, c) === null && (c.counts.items.open ?? 0) > 0;
  // an A/B campaign (record 48) is settled on a page of its own, never in a gallery
  const ab = isAb(c) && abServed(caps);
  // a pair campaign (the post-contrast study) is read two stacks at a time, never in a gallery
  const pair = isPair(c) && pairServed(caps);
  // an anchored campaign is read a candidate beside its two anchors, never in a gallery
  const anchored = isAnchored(c) && anchoredServed(caps);
  const adjudicate = adjudicatorHas(caps, c);
  const close = closeRefusal(caps, c);
  // a close running as a job is followed, never started a second time; one that stopped part way is run again
  const stage = closeStage(c);
  const exp = exportRefusal(caps);
  const a = c.agreement;
  const blind = answersBlind ?? !seesAnswers(caps, c);
  // an open item's lease, for the campaign's maker and those who read every answer (2026-11-05)
  const leases = !blind || c.owner === principalOf(caps);
  const alone = aloneWords(c);
  // people by name (UX round 5): the desk's people, the person's own name, the pace door's names, and what the page was given
  const people = useKept(peopleKept).value;
  const accountNames = new Map((stats?.raters ?? []).flatMap((r) => (r.name ? [[r.principal, r.name] as [string, string]] : [])));
  const names = namesMap(caps, people, new Map([...accountNames, ...(given ?? [])]));
  const who = (p: string | null | undefined) => nameOf(names, p);
  // the raters by name to the maker and a Review worker, by number to anyone else
  const raterLabels = raterNames(answers ?? [], principalOf(caps), namesRaters(caps, c), names);
  const raterOf = (p: string): Named => (namesRaters(caps, c) || p === principalOf(caps) ? who(p) : { name: raterLabels.get(p) ?? who(p).name, title: null });
  // a check (job type 3) has one next action: go on checking while results are open, close and write the checks once none is
  const check = isCheck(c) && checkServed(caps) ? checkActs(caps, c) : null;
  const byItem = new Map<number, Answer[]>();
  for (const x of answers ?? []) byItem.set(x.item_id, [...(byItem.get(x.item_id) ?? []), x]);
  const rows = shown.slice(0, ROWS);
  const partNames = useCheckNames(isCheck(c) ? rows : [], byItem);
  // each row named by its scan: the series description from the stack's header, where the person may read it and the campaign shows header text
  const readsNames = served(caps, "GET /api/stacks/{stack}/header") && may(caps, "review:see") && !picturesOnly(c) && c.grain !== "session";
  const scanNames = useScanNames(readsNames && !givenScans, rows.flatMap((i) => (i.stack_id !== null && i.stack_id !== undefined && !i.blind ? [i.stack_id] : [])));
  const scanOf = (i: Item): ScanName | null => (i.stack_id === null || i.stack_id === undefined ? null : ((givenScans ?? scanNames).get(i.stack_id) ?? null));
  // a check's answer in words: the verdict and the flagged parts by name, never its form's fields; any other as the value's word
  const reasons = isCheck(c) ? checkQuestionOf(c).reasons : null;
  const words = (i: Item) => (x: Pick<Answer, "value" | "form" | "derivative_id">) => {
    if (reasons) return checkAnswerLine(x.value, x.form, reasons, i.derivative_id ? (partNames.get(i.derivative_id) ?? null) : null);
    if (x.form || (x.derivative_id !== null && x.derivative_id !== undefined)) return answerWords(x);
    return answerValueWords(c, x.value, () => answerWords(x));
  };
  const next = nextAct(caps, c, { results, href });
  const tone = headTone(c);
  const caveat = stats ? paceCaveat(stats) : null;
  return (
    <section className={`data campaign tone-${tone}`}>
      <div className="data-head campaign-head">
        <div className="grow">
          <span className="eyebrow">
            <a href={href("review")}>Review</a>
          </span>
          <h1>{c.name}</h1>
          <p className="lede">
            {ledeWords(caps, c, names)} <span className={c.status === "open" ? "tag ok" : c.status === "closing" ? "tag caution" : "tag"}>{c.status}</span>
          </p>
        </div>
        {check?.head}
        {(next.kind === "read" || next.kind === "settle") && (
          <a className="button next" href={next.href} title={ab ? "each item's candidates as A and B, blind to who gave which" : pair ? "two stacks side by side, nothing else of them: which is post" : anchored ? "a candidate beside a reference pre and a reference post, nothing else of them: which does it look like" : undefined}>
            {next.words}
          </a>
        )}
        {next.kind === "close" && (
          <button type="button" className="button next" onClick={() => onAct("close")}>
            Close
          </button>
        )}
        {next.kind === "close-again" && (
          <button type="button" className="button next" title="the close stopped part way; run again, it writes what the first did not" onClick={() => onAct("close")}>
            Run the close again
          </button>
        )}
        {next.kind === "results" && view !== "results" && (
          <button type="button" className="button next" onClick={() => setView("results")}>
            Results
          </button>
        )}
        {rate && !ab && !pair && !anchored && !check && galleryOffered(caps, c.question) && (
          <a className="button secondary small" href={href("review", "campaigns", String(c.id), "gallery")} title={suggestOf(c) === "none" ? "a hundred items at once, nothing suggested; give each its value and accept the page in one move" : "a hundred items at once, each with its suggestion; correct the wrong ones and accept the rest in one move"}>
            Gallery
          </a>
        )}
        {adjudicate && next.kind !== "settle" && (
          <a className="button secondary small" href={check ? `${href("review", "campaigns", String(c.id), "check")}?as=adjudicator` : href("review", "campaigns", String(c.id), "adjudicate")}>
            Adjudicate
          </a>
        )}
        {c.status === "open" && close === null && next.kind !== "close" && !check?.closes && (
          <button type="button" className={check ? "button quiet small" : "button secondary small"} onClick={() => onAct("close")}>
            Close
          </button>
        )}
        {check?.closes && c.status === "open" && close === null && (
          <button type="button" className="button" onClick={() => onAct("close")}>
            Close and write the checks
          </button>
        )}
        {c.status === "closed" && close === null && (
          <button type="button" className="button secondary small" title="a later close writes each refused item that can be written now, as any close does" onClick={() => onAct("close")}>
            Close again
          </button>
        )}
        {exp === null && (
          <button type="button" className="button secondary small" onClick={() => onAct("export")}>
            Export
          </button>
        )}
        {ratersRefusal(caps, c) === null && (
          <button type="button" className="button secondary small" aria-label="Change the raters" onClick={() => onAct("raters")}>
            Change raters
          </button>
        )}
      </div>
      {said && (
        <p className="meta said">
          <Icon name="check" />
          {said}
        </p>
      )}
      {stage === "running" && (
        <p className="meta said" role="status">
          <Icon name="clock" />
          Closing{c.close_job?.by ? ` (started by ${who(c.close_job.by).name})` : ""}: {closingWords(c)} The page follows it.
        </p>
      )}
      {stage === "stopped" && (
        <p className="warn">
          The close stopped part way{c.close_job?.error ? `: ${c.close_job.error}` : ""}. Run it again; it writes what the first did not.
        </p>
      )}
      {warned.map((w) => (
        <p key={w.principal} className="warn">
          {w.why}
        </p>
      ))}
      <StateBar counts={c.counts} />
      {c.status === "open" && (c.counts.items.open ?? 0) > 0 && missingModes(caps, c).map((w) => (
        <p key={w} className="meta mode-missing">
          {w}
          {onAskOne && isAxesGalleryLine(w) && mayAskOneAxis(caps, c) && (
            <button type="button" className="button quiet small" title="asks one axis from now on, the others derived from it where the rules can; answers given are kept" onClick={onAskOne}>
              Ask {answeredAxes(c.question)[0]} alone
            </button>
          )}
        </p>
      ))}
      {c.status === "open" && alone && (
        <p className="meta read-alone">
          {alone}
          {onReadAll && mayReadAllInBatches(caps, c) && (
            <button type="button" className="button quiet small" title="sets none aside from now on; the items set aside go back to the batches and the gallery" onClick={onReadAll}>
              Read all in batches
            </button>
          )}
        </p>
      )}
      {check && <CheckPanel caps={caps} campaign={c} />}
      {a?.unsure ? (
        <p className="meta">
          {n(a.unsure)} {a.unsure === 1 ? "answer" : "answers"} marked unsure, for a second look.
        </p>
      ) : null}
      {missing !== null && missing > 0 && (
        <div className="note">
          <Icon name="info" />
          <div className="note-body">
            <p className="note-lead">
              {n(missing)} of its stacks {missing === 1 ? "has" : "have"} no picture yet.
            </p>
            <p className="note-detail">Each is prepared when it is first opened.</p>
          </div>
        </div>
      )}
      <details className="campaign-details">
        <summary>Details</summary>
        <Values
          cells={[
            { k: "items", v: n(itemTotal(c.counts)) },
            { k: "raters each", v: String(c.raters_per_item) },
            { k: "answers", v: n(c.counts.answers) },
            { k: "exact", v: pct(a?.exact), title: agreementWords(a) },
            { k: "κ", v: kappa(a?.cohen_kappa ?? a?.fleiss_kappa), title: a?.cohen_kappa !== null && a?.cohen_kappa !== undefined ? "Cohen's kappa" : "Fleiss' kappa" },
          ]}
        />
        <dl className="facts">
          <div className="facts-pair">
            <dt>source</dt>
            <dd>
              {sourceWords(c.source)}
              {c.handle_id !== null && ` · handle ${c.handle_id}`} · {c.grain}s
            </dd>
          </div>
          <div className="facts-pair">
            <dt>raters</dt>
            <dd>{c.rater_policy.raters.length > 0 ? <People list={c.rater_policy.raters} who={who} /> : "anyone with work on Campaigns"}</dd>
          </div>
          <div className="facts-pair">
            <dt>adjudicators</dt>
            <dd>{c.rater_policy.adjudicators.length > 0 ? <People list={c.rater_policy.adjudicators} who={who} /> : "anyone with work on Campaigns"}</dd>
          </div>
          <div className="facts-pair">
            <dt>adjudicated</dt>
            <dd>
              {c.adjudication.when === "never" ? "never" : c.adjudication.when === "always" ? "always" : "on disagreement"} · {c.adjudication.metric}
              {c.adjudication.metric !== "exact" && c.adjudication.threshold !== null && c.adjudication.threshold !== undefined && ` below ${c.adjudication.threshold}`}
            </dd>
          </div>
          {(c.question.kind === "axis" || c.question.kind === "axes") && (
            <div className="facts-pair">
              <dt>suggests</dt>
              <dd>
                {SUGGEST_WORDS[suggestOf(c)].words} · {SUGGEST_WORDS[suggestOf(c)].says}
              </dd>
            </div>
          )}
          {purposeOf(c) !== "decide" && (
            <div className="facts-pair">
              <dt>for</dt>
              <dd>
                {PURPOSE_WORDS[purposeOf(c)].words} · {PURPOSE_WORDS[purposeOf(c)].says}
              </dd>
            </div>
          )}
          {c.planted && (
            <div className="facts-pair">
              <dt>planted</dt>
              <dd>
                {Math.round(c.planted.share * 100)} % of the items · {n(c.planted.count)} planted · {c.planted.opened ? "the list opened at the close" : "the list stays sealed until the close"}
              </dd>
            </div>
          )}
          {picturesOnly(c) && (
            <div className="facts-pair">
              <dt>shows</dt>
              <dd>the pictures alone · no series name, sequence or other header text beside them</dd>
            </div>
          )}
          <div className="facts-pair">
            <dt>closes into</dt>
            <dd>{CLOSES_WORDS[c.closes_into] ?? c.closes_into}</dd>
          </div>
          <div className="facts-pair">
            <dt>lease</dt>
            <dd>{Math.round(c.lease_seconds / 60)} min</dd>
          </div>
          <div className="facts-pair">
            <dt>made</dt>
            <dd>
              <Who named={who(c.owner)} /> · {day(c.created_at)}
              {c.pack_version && ` · ${c.pack_version}`}
            </dd>
          </div>
          {c.closed_at && (
            <div className="facts-pair">
              <dt>closed</dt>
              <dd>
                {c.closed_by ? <Who named={who(c.closed_by)} /> : ""} · {day(c.closed_at)}
              </dd>
            </div>
          )}
        </dl>
        {a?.per_axis && Object.keys(a.per_axis).length > 0 && (
          <p className="meta">
            By axis:{" "}
            {Object.entries(a.per_axis)
              .map(([axis, x]) => `${axis} ${pct(x.exact)}${x.cant_tell ? ` (${n(x.cant_tell)} can't tell)` : ""}`)
              .join(" · ")}
          </p>
        )}
        {close !== null && c.status !== "closed" && <p className="meta">{close}</p>}
        {sets.length > 0 && (
          <p className="meta">
            Label sets:{" "}
            {sets.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ", "}
                <a href={href("review", "label-sets", String(s.id))}>
                  {s.name} v{s.version}
                </a>
              </span>
            ))}
          </p>
        )}
        {caveat && <p className="meta pace-caveat">Pace: {caveat}.</p>}
      </details>
      {stats && stats.raters.length > 0 && <RaterStats stats={stats} who={(p) => raterOf(p)} caveat={false} />}
      {results && (
        <div className="chips" role="tablist">
          <button type="button" role="tab" className={view === "items" ? "opt on" : "opt"} aria-selected={view === "items"} onClick={() => setView("items")}>
            Items
          </button>
          <button type="button" role="tab" className={view === "results" ? "opt on" : "opt"} aria-selected={view === "results"} onClick={() => setView("results")}>
            Results
          </button>
        </div>
      )}
      {results && view === "results" ? (
        <ResultsView caps={caps} campaign={c} sets={sets} words={reasons ? words : undefined} />
      ) : (
        <>
      <h2>Items</h2>
      {refusedLine(c) && <p className="warn">{refusedLine(c)}</p>}
      <div className="chips">
        <button type="button" className={filter === null ? "opt on" : "opt"} onClick={() => setFilter(null)}>
          all <b>{n(items.length)}</b>
        </button>
        {STATES.filter((s) => (c.counts.items[s.state] ?? 0) > 0).map((s) => (
          <button key={s.state} type="button" className={filter === s.state ? "opt on" : "opt"} onClick={() => setFilter(s.state)}>
            {s.words} <b>{n(c.counts.items[s.state] ?? 0)}</b>
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="thin campaign-items">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Scan</th>
              <th>State</th>
              <th>Answers</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <ItemRow key={i.id} item={i} name={itemName(i, c, scanOf(i))} answers={byItem.get(i.id) ?? []} blind={blind} words={words(i)} check={reasons !== null} who={raterOf} lease={leases ? leaseLine(caps, c, i, Date.now(), (p) => who(p).name) : null} onRelease={onRelease} />
            ))}
          </tbody>
        </table>
      </div>
      {shown.length > ROWS && <p className="meta">The first {n(ROWS)} of {n(shown.length)} are listed.</p>}
      {answers === null && <p className="meta">The answers could not be read at this detail.</p>}
      {blind && <p className="meta">Raters rate blind: each answer shows here once the campaign closes, and to its adjudicators before.</p>}
        </>
      )}
      {check ? null : (
        <Says head="What closing does">
          Every agreed or adjudicated item becomes one decision through Review, {c.closes_into === "stage" ? "staged until a person commits it" : "in force"}; an item a model or an agent settled is staged
          whatever the campaign says. Items without an outcome stay open in the queue. Leases still out end. Every answer stays, and the agreement is kept.
        </Says>
      )}
      {children}
    </section>
  );
}

/** Several people by name, comma separated. */
function People({ list, who }: { list: readonly string[]; who: (p: string) => Named }) {
  return (
    <>
      {list.map((p, i) => (
        <span key={p}>
          {i > 0 && ", "}
          <Who named={who(p)} />
        </span>
      ))}
    </>
  );
}

/**
 * The names of the parts a check's answers flag, read from each result's
 * parts door once, for the rows on the page that flag any. A result whose
 * parts cannot be read keeps its parts by label.
 */
function useCheckNames(rows: Item[], byItem: Map<number, Answer[]>): Map<number, PartNames> {
  const [names, setNames] = useState<Map<number, PartNames>>(() => new Map());
  const wanted = [...new Map(rows.filter((i) => i.derivative_id && (flagsParts(i.outcome?.form) || (byItem.get(i.id) ?? []).some((a) => flagsParts(a.form)))).map((i) => [i.derivative_id!, i.part_set ?? ""])).entries()].filter(([d]) => !names.has(d));
  const key = wanted.map(([d, set]) => `${d}/${set}`).join(",");
  useEffect(() => {
    if (wanted.length === 0) return;
    let alive = true;
    void (async () => {
      for (const [d, set] of wanted) {
        const got = await checkDoors.parts(d, set).catch((): PartNames => ({ kind: null, names: new Map() }));
        if (!alive) return;
        setNames((m) => new Map(m).set(d, got));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return names;
}

function ItemRow({ item: i, name, answers, blind, words = answerWords, check = false, who, lease = null, onRelease }: { item: Item; name: { name: string; title: string }; answers: Answer[]; blind: boolean; words?: (a: Pick<Answer, "value" | "form" | "derivative_id">) => string; check?: boolean; who: (p: string) => Named; lease?: LeaseLine | null; onRelease?: (a: Assignment) => void }) {
  const tone = STATES.find((s) => s.state === i.state)?.tone ?? "";
  return (
    <tr className={`item-row s-${tone || "open"}`}>
      <td className="num">{i.position + 1}</td>
      <td>
        <span className="item-name" title={name.title}>
          {name.name}
        </span>
        {i.round > 1 && <span className="meta"> · round {i.round}</span>}
      </td>
      <td>
        <span className="item-state">{stateWords(i.state)}</span>
        {lease && (
          <span className="meta lease">
            {" "}
            {lease.words}
            {lease.release && onRelease && (
              <button type="button" className="button quiet small" title="gives the item back unanswered; it goes to the next claim" onClick={() => onRelease(lease.release!)}>
                Release
              </button>
            )}
          </span>
        )}
      </td>
      <td className="meta">
        {answers.length === 0
          ? ""
          : blind
            ? `${answers.length} ${answers.length === 1 ? "answer" : "answers"}`
            : answers.map((a) => (
              <span key={a.id} className={check ? "answer-chip is-check" : "answer-chip"} title={a.why ?? undefined}>
                <Who named={who(a.principal)} />
                {a.role === "adjudicator" ? " (adj.)" : ""} {words(a)}
                {a.unsure ? " · unsure" : ""}
              </span>
            ))}
      </td>
      <td>
        {i.state === "refused" ? (
          <span className="warn" title={i.refused?.at ? `refused ${day(i.refused.at)}` : undefined}>
            Not written: {i.refused?.why ?? "the close refused it"}
          </span>
        ) : i.outcome ? (
          words({ value: i.outcome.value, form: i.outcome.form ?? null, derivative_id: i.outcome.derivative_id ?? null })
        ) : (
          ""
        )}
        {i.state === "refused" ? null : check ? (
          i.outcome?.decisions && checkDecisionsWords(i.outcome.decisions) && <span className="meta"> · {checkDecisionsWords(i.outcome.decisions)}</span>
        ) : (
          <>
            {i.outcome?.decisions && <span className="meta"> · decisions {Object.values(i.outcome.decisions).join(", ")}</span>}
            {i.decision_id !== null && <span className="meta"> · decision {i.decision_id}</span>}
          </>
        )}
        {i.pick_id !== null && <span className="meta"> · pick {i.pick_id}</span>}
      </td>
    </tr>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** What the page says of the items a close refused, or null where there are none. */
export function refusedLine(c: Campaign): string | null {
  const k = c.counts.items.refused ?? 0;
  if (k === 0) return null;
  const which = k === 1 ? "1 item was refused at the close; nothing was written for it" : `${n(k)} items were refused at the close; nothing was written for them`;
  return `${which}, and the row says why.${c.close_again ? " Close again once the reason is gone." : ""}`;
}

/** The closure panel: what a close will write, counted before anything is written. */
export function ClosurePanel({ campaign: c, plan }: { campaign: Campaign; plan: Closure }) {
  return (
    <div className="closure">
      <p className="note-lead">
        Writes {n(plan.writes.n)} {plan.writes.words}.
      </p>
      {plan.staged > 0 && <p className="meta">{n(plan.staged)} of them a model or an agent answered, so they are staged whatever the campaign says, and a person commits them.</p>}
      {plan.already > 0 && <p className="meta">{n(plan.already)} {plan.already === 1 ? "is" : "are"} written already.</p>}
      {plan.unresolvedTotal > 0 ? (
        <p>
          Leaves {n(plan.unresolvedTotal)} unresolved: {plan.unresolved.map((u) => `${n(u.n)} ${u.words}`).join(", ")}. {c.closes_into === "check" ? "Their questions close with it; a later check asks them again." : "Their review items stay in the queue."}
        </p>
      ) : (
        <p>Leaves nothing unresolved.</p>
      )}
      {plan.leases > 0 && <p className="meta">Ends {n(plan.leases)} {plan.leases === 1 ? "lease" : "leases"} still out.</p>}
      <p className="meta">An item that cannot be written (a decision that outranks it stands, or its result or its outcome cannot be read) is left as it is and named as refused, with why. The campaign then takes no claim or answer.</p>
      {c.closes_into === "none" && <p className="meta">It writes no decision: the answers are the labels, to export.</p>}
    </div>
  );
}

type Closing = { kind: "ask" } | { kind: "running"; job: number | null; since: number; c: Campaign } | { kind: "done"; r: Closed | null } | { kind: "failed"; why: string };

/**
 * The close as it runs (2026-11-05: the dialog stayed on its button while a
 * close of 4,838 items ran for 40 s, and the page never followed it). The
 * close starts as a job; the dialog reads the campaign until the job is done,
 * says how far it is, then what it wrote and what it refused with why.
 */
export function CloseDialog({ campaign: c, plan, onClose, onDone, onClosed, every = 1500 }: { campaign: Campaign; plan: Closure; onClose: () => void; onDone: (words: string) => void; onClosed?: () => void; every?: number }) {
  const [at, setAt] = useState<Closing>(() => ({ kind: "ask" }));
  // the page under the dialog reads the campaign again once the close is done, so it stands closed behind the result
  const finished = at.kind === "done";
  useEffect(() => {
    if (finished) onClosed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);
  const go = () => {
    setAt({ kind: "running", job: null, since: Date.now(), c });
    campaigns
      .closeInBackground(c.id)
      .then((r) => {
        // an engine before the close job closes in the one answer
        if ("decisions" in r) setAt({ kind: "done", r });
        else setAt((s) => (s.kind === "running" ? { ...s, job: r.job } : s));
      })
      .catch((e: unknown) => setAt({ kind: "failed", why: refusedWords(e) }));
  };
  const job = at.kind === "running" ? at.job : null;
  useEffect(() => {
    if (job === null) return;
    let alive = true;
    const look = () => {
      campaigns
        .one(c.id)
        .then((now) => {
          if (!alive) return;
          const j = now.close_job;
          if (j && j.id === job && j.state === "done") return setAt({ kind: "done", r: j.result });
          if (j && j.id === job && (j.state === "failed" || j.state === "cancelled")) return setAt({ kind: "failed", why: `Not closed: ${j.error ?? "the close stopped"}` });
          if (!j && now.status === "closed") return setAt({ kind: "done", r: null });
          setAt((s) => (s.kind === "running" ? { ...s, c: now } : s));
          timer = setTimeout(look, every);
        })
        .catch(() => {
          if (alive) timer = setTimeout(look, every * 2);
        });
    };
    let timer = setTimeout(look, every);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [job, c.id, every]);
  // what the close was asked as, kept while the page behind it reads the campaign closed
  const [again] = useState(() => c.status === "closed");
  const [rerun] = useState(() => c.status === "closing");
  const words = at.kind === "done" ? (at.r ? closedWords(at.r, c.closes_into) : "Closed.") : null;
  return (
    <Dialog
      title={again ? `Close ${c.name} again` : `Close ${c.name}`}
      icon="check"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="grow" />
          {at.kind === "ask" && (
            <>
              <button type="button" className="button secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="button" onClick={go}>
                {again ? "Close it again" : rerun ? "Run the close again" : "Close the campaign"}
              </button>
            </>
          )}
          {at.kind === "running" && (
            <button type="button" className="button secondary" title="the close goes on; the page follows it" onClick={onClose}>
              Hide
            </button>
          )}
          {at.kind === "done" && (
            <button type="button" className="button" onClick={() => onDone(words ?? "Closed.")}>
              Done
            </button>
          )}
          {at.kind === "failed" && (
            <button type="button" className="button secondary" onClick={onClose}>
              Close this
            </button>
          )}
        </div>
      }
    >
      {at.kind === "ask" && <ClosurePanel campaign={c} plan={plan} />}
      {at.kind === "running" && (
        <div className="closing" role="status">
          <Wait phase="closing" since={at.since} size="line" />
          <p className="meta">{closingWords(at.c)}</p>
        </div>
      )}
      {at.kind === "done" && (
        <div className="closed-result" role="status">
          <p className="note-lead">{words}</p>
          {at.r && at.r.refused.length > 0 && (
            <ul className="refused-list">
              {refusedLines(at.r).map((l) => (
                <li key={l} className="warn">
                  {l}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {at.kind === "failed" && <p className="warn">{at.why}</p>}
    </Dialog>
  );
}

function ExportDialog({ campaign: c, onClose, onDone }: { campaign: Campaign; onClose: () => void; onDone: (set: LabelSet) => void }) {
  const [of, setOf] = useState<"outcomes" | "answers" | "counts">("outcomes");
  const [name, setName] = useState(c.name);
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const go = () => {
    setBusy(true);
    setWhy(null);
    campaigns
      .export(c.id, { of, ...(name.trim() && name.trim() !== c.name ? { name: name.trim() } : {}), ...(place.trim() ? { place: place.trim() } : {}) })
      .then(onDone)
      .catch((e: unknown) => {
        setBusy(false);
        setWhy(refusedWords(e));
      });
  };
  return (
    <Dialog
      title={`Export ${c.name}`}
      icon="release"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">A name taken gets its next version; nothing is written over.</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy} onClick={go}>
            Write the label set
          </button>
        </div>
      }
    >
      <div className="chips">
        <button type="button" className={of === "outcomes" ? "opt on" : "opt"} aria-pressed={of === "outcomes"} onClick={() => setOf("outcomes")}>
          Outcomes
        </button>
        <button type="button" className={of === "answers" ? "opt on" : "opt"} aria-pressed={of === "answers"} onClick={() => setOf("answers")}>
          Every answer
        </button>
        {purposeOf(c) === "verify" && (
          <button type="button" className={of === "counts" ? "opt on" : "opt"} aria-pressed={of === "counts"} onClick={() => setOf("counts")}>
            Counts
          </button>
        )}
      </div>
      <p className="meta">{of === "outcomes" ? "A row per resolved item: the decision it became, or the answer that settled it." : of === "answers" ? "A row per answer, for an agreement study or a two-rater reference." : "Counts, digests, the agreement and the catch rate, for a paper: no header text, no path, no subject code."}</p>
      <div className="fields2">
        <label className="field">
          <span className="label">Name</span>
          <span className="input mono">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </span>
        </label>
        <label className="field">
          <span className="label">Export place · optional</span>
          <span className="input mono">
            <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="the one there is" />
          </span>
        </label>
      </div>
      {why && <p className="warn">{why}</p>}
    </Dialog>
  );
}
