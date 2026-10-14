// SPDX-License-Identifier: AGPL-3.0-only
// The Rules page (record 56, sections 6.4 and 6.5): the rule pack decides
// every answer, and errors are fixed in the rules, not scan by scan. Four
// tabs, each in the address (#review/rules/<tab>): the proposals, each with
// its stored effect and an approval card that says any answer it breaks with
// its scans, adopted with a press and its re-sort followed to its counts;
// the pack's quality (what it cannot rank, which rules win over which, and
// System 1's disagreements once served), each row with the change that
// would mend it; a form for each typed operation, whose effect is shown
// before it is proposed; and record 27's words, as they were. It opens on
// the proposals while one waits for a person, else on the quality. Opened
// for a dataset (?dataset=), the quality and the proposals are that
// dataset's.

import { useEffect, useMemo, useState } from "react";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { sources } from "../data/sources";
import { data as dataDoors, type ReviewItem } from "../ops/client";
import { href, narrow } from "../routes";
import { Wait } from "../ui/Wait";
import { refusalWords, type PackDoc } from "./client";
import type { Effect } from "./effect";
import type { Proposal, Status } from "./proposals";
import type { Draft } from "./quality";
import { formOfOp } from "./ruleOps";
import { WordsPage, type WordAt } from "./Rules";
import { RuleForm, type ScopeOptions } from "./RuleForm";
import { RuleProposals } from "./RuleProposals";
import { RuleQuality } from "./RuleQuality";
import { mayPropose, mayRehearse, readsProposals, rulesDoors, type PackChoices } from "./rulesDoors";
import "./rules.css";

export type RulesTab = "proposals" | "quality" | "change" | "words";

const TABS: RulesTab[] = ["proposals", "quality", "change", "words"];

const WORDS: Record<RulesTab, string> = { proposals: "Proposals", quality: "Quality", change: "Change a rule", words: "Words" };

/** The tab an address names, or null for the page's own landing. */
export function tabOf(arg: string | null | undefined): RulesTab | null {
  return TABS.find((t) => t === arg) ?? null;
}

/** The tabs this person and this engine have: the proposals where the engine keeps them, Change a rule where a change can be rehearsed, the words always. */
export function tabsFor(caps: Capabilities): RulesTab[] {
  return TABS.filter((t) => (t === "proposals" ? readsProposals(caps) : t === "change" ? mayRehearse(caps) : true));
}

/** Where the page opens: the tab the address names where the person has it; else the proposals while one waits; else the quality. */
export function landing(tabs: RulesTab[], tab: RulesTab | null, waiting: number | null): RulesTab | null {
  if (tab && tabs.includes(tab)) return tab;
  if (!tabs.includes("proposals")) return "quality";
  if (waiting === null) return null;
  return waiting > 0 ? "proposals" : "quality";
}

export interface RulesPageProps {
  caps: Capabilities;
  items: ReviewItem[];
  tab: RulesTab | null;
  /** The proposal the address opened: #review/rules/proposals/<id>. */
  opened?: number | null;
  /** One dataset's quality and proposals: #review/rules?dataset=NAME. */
  dataset?: string | null;
  wordAt: WordAt | null;
  onWordClose: () => void;
  onChanged: (words: string) => void;
  /** Why a scan is sorted so, opened from its picture. */
  onOpen?: (stack: number) => void;
}

const EMPTY_OPTIONS: ScopeOptions = { sites: [], datasets: [], scanners: [], batches: [] };

export function RulesPage({ caps, items, tab, opened = null, dataset = null, wordAt, onWordClose, onChanged, onOpen }: RulesPageProps) {
  const [pack, setPack] = useState<{ pack: PackDoc; choices: PackChoices } | null>(null);
  const [packWhy, setPackWhy] = useState<string | null>(null);
  const [since] = useState(() => Date.now());
  const [options, setOptions] = useState<ScopeOptions>(EMPTY_OPTIONS);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [counts, setCounts] = useState<Record<Status, number> | null>(null);
  const [countsWhy, setCountsWhy] = useState<string | null>(null);
  const tabs = tabsFor(caps);
  const proposals = tabs.includes("proposals");
  // where the page opens is chosen once, so adopting the last proposal waiting does not move the page away under the person
  const [landed, setLanded] = useState<RulesTab | null>(null);
  const lands = landed ?? landing(tabs, null, proposals ? (counts?.proposed ?? (countsWhy ? 0 : null)) : 0);
  useEffect(() => {
    if (landed === null && lands !== null) setLanded(lands);
  }, [landed, lands]);
  // a word to add opens the words, wherever the address pointed
  const shown: RulesTab | null = wordAt ? "words" : tab && tabs.includes(tab) ? tab : lands;
  const tabHref = (t: RulesTab) => narrow(href("review", "rules", t), { dataset: dataset ?? undefined });

  useEffect(() => {
    let alive = true;
    if (!served(caps, "GET /api/packs/{name}")) {
      setPackWhy("this engine serves no pack door");
      return;
    }
    const name = caps.engine?.packs[0]?.name;
    (name ? Promise.resolve(name) : dataDoors.packs().then((r) => r.packs[0]?.name ?? Promise.reject(new Error("no pack is loaded"))))
      .then((n) => rulesDoors.pack(n))
      .then((p) => alive && setPack(p))
      .catch((e: unknown) => alive && setPackWhy(refusalWords(e)));
    return () => {
      alive = false;
    };
  }, [caps]);

  // how many wait for a person, for the tab and where the page opens
  const packName = pack?.pack.pack ?? null;
  useEffect(() => {
    if (!proposals || !packName) return;
    let alive = true;
    // the counts are the pack's whatever the filter, so a dataset's are the proposals listed for it
    rulesDoors.proposals(packName, { status: "proposed", dataset, limit: dataset ? 500 : 1 }).then(
      (r) => alive && setCounts(dataset ? { ...r.counts, proposed: r.proposals.length } : r.counts),
      (e: unknown) => alive && setCountsWhy(refusalWords(e)),
    );
    return () => {
      alive = false;
    };
  }, [proposals, packName, dataset]);

  // what the scope chooser offers: the sites and datasets the sources door lists, the newest batches
  useEffect(() => {
    if (shown !== "change") return;
    let alive = true;
    if (served(caps, "GET /api/sources") && may(caps, "data:see"))
      sources.list(1).then(
        (r) => {
          if (!alive) return;
          const sites = new Set<string>();
          const datasets: string[] = [];
          for (const s of r.sources) {
            if (s.kind === "root") sites.add(s.name);
            else datasets.push(s.name);
            if (s.root) sites.add(s.root);
          }
          setOptions((o) => ({ ...o, sites: [...sites].sort(), datasets: datasets.sort() }));
        },
        () => undefined,
      );
    if (served(caps, "GET /api/batches"))
      dataDoors.batches(12).then(
        (r) => alive && setOptions((o) => ({ ...o, batches: r.batches.filter((b) => b.kind !== "pseudonymize").map((b) => ({ id: b.id, name: b.name })) })),
        () => undefined,
      );
    return () => {
      alive = false;
    };
  }, [caps, shown]);

  const mend = useMemo(
    () =>
      mayRehearse(caps)
        ? (d: Draft) => {
            setDraft(d);
            location.hash = tabHref("change");
          }
        : null,
    [caps, dataset], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Change it on a proposal: its one operation back in the form, its why kept, the proposal as its evidence
  const change =
    mayRehearse(caps) && mayPropose(caps)
      ? (p: Proposal) => {
          const f = p.operations.length === 1 ? formOfOp(p.operations[0]) : null;
          if (!f) return;
          setDraft({ form: f.form, scope: f.scope, reason: p.reason, evidence: { proposal: p.id } });
          location.hash = tabHref("change");
        }
      : undefined;
  const propose =
    mayPropose(caps) && packName
      ? (op: Json, _effect: Effect) =>
          rulesDoors.propose(packName, [op]).then((p) => {
            setDraft(null);
            setCounts((c) => (c ? { ...c, proposed: c.proposed + 1 } : c));
            onChanged(`Proposed: ${p.title || `change ${p.id}`}. It waits for a person to adopt it.`);
            location.hash = narrow(href("review", "rules", "proposals", String(p.id)), { dataset: dataset ?? undefined });
          })
      : undefined;

  return (
    <div className="rules">
      <div className="chips pages rules-tabs" role="tablist" aria-label="The rules">
        {tabs.map((t) => (
          <a key={t} role="tab" aria-selected={shown === t} className={shown === t ? "opt on" : "opt"} href={tabHref(t)}>
            {WORDS[t]}
            {t === "proposals" && counts && <b>{counts.proposed.toLocaleString("en-US")}</b>}
          </a>
        ))}
        <span className="grow" />
        <span className="meta rules-pack">{pack ? `${pack.pack.pack} ${pack.pack.version}` : ""}</span>
      </div>
      {!pack && !packWhy && shown !== "words" && <Wait phase="reading the pack" since={since} size="panel" />}
      {packWhy && shown !== "words" && <p className="warn">The pack could not be read: {packWhy}</p>}
      {shown === null && pack && <Wait phase="reading the proposals" since={since} size="panel" />}
      {shown === "proposals" && pack && (
        <RuleProposals
          caps={caps}
          pack={pack.pack}
          dataset={dataset}
          opened={opened}
          onChange={change}
          onOpen={onOpen}
          onDecided={(words, from, to) => {
            setCounts((c) => (c ? { ...c, [from]: Math.max(0, c[from] - 1), [to]: c[to] + 1 } : c));
            onChanged(words);
          }}
          onSaid={onChanged}
        />
      )}
      {shown === "quality" && pack && <RuleQuality caps={caps} pack={pack.pack} dataset={dataset} onMend={mend} onOpen={onOpen} />}
      {shown === "change" && pack && (
        <RuleForm
          caps={caps}
          pack={pack.pack}
          choices={pack.choices}
          options={options}
          draft={draft}
          onPropose={propose}
          noPropose={proposals ? "Proposing a change needs work on Review or Pipelines." : "Proposing a change waits for the engine to keep proposals."}
          onOpen={onOpen}
        />
      )}
      {shown === "words" && <WordsPage caps={caps} items={items} wordAt={wordAt} onWordClose={onWordClose} onChanged={onChanged} />}
    </div>
  );
}
