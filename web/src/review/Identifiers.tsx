// SPDX-License-Identifier: AGPL-3.0-only
// The identity questions (record 27, R5d): two codes that share one
// identifier, files held until the map names their identifier, subjects coded
// from an identifier the map does not know. Each kind says its remedy in a
// phrase; what settles it at length is one disclosure. A collision is decided
// or merged; held files are mapped on the dataset's Pseudonymisation page and
// never decided here; a provisional subject is merged into the one it stands
// for.

import { useState } from "react";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { door as served } from "../deployment";
import type { ReviewItem } from "../ops/client";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Says } from "../ui/Says";
import { acts, datasetOf, familyOf, identityActs, itemWords, refusalWords, review } from "./client";
import { kindOf, sortByCost } from "./triage";

const n = (v: number) => v.toLocaleString("en-US");

export interface IdentifiersProps {
  caps: Capabilities;
  items: ReviewItem[];
  onDecide: (item: ReviewItem) => void;
  onChanged: (words: string) => void;
}

const KINDS: { what: string; title: string; remedy: string }[] = [
  { what: "collision", title: "may be one person twice", remedy: "merge them, or decide they are two" },
  { what: "unmapped", title: "held until mapped", remedy: "map them on the dataset" },
  { what: "provisional", title: "coded without a map", remedy: "merge into the subject it stands for" },
];

/** The identity items by what they are: the three kinds record 26 names, and anything else the engine raised. */
export function byKind(items: ReviewItem[]): { what: string; items: ReviewItem[] }[] {
  const open = items.filter((i) => i.status === "open" && familyOf(i.kind) === "identity");
  const out = KINDS.map((k) => ({ what: k.what, items: sortByCost(open.filter((i) => kindOf(i.kind).what === k.what)) }));
  const rest = open.filter((i) => !KINDS.some((k) => kindOf(i.kind).what === k.what));
  if (rest.length > 0) out.push({ what: "other", items: sortByCost(rest) });
  return out;
}

export function IdentifiersPage({ caps, items, onDecide, onChanged }: IdentifiersProps) {
  const may = acts(caps);
  const merges = may.merge && served(caps, "POST /api/linkage/merge");
  const [merging, setMerging] = useState<ReviewItem | null>(null);
  const groups = byKind(items);
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  return (
    <>
      <div className="needs">
        {groups
          .filter((g) => g.what !== "other")
          .map((g) => {
            const k = KINDS.find((x) => x.what === g.what)!;
            const datasets = [...new Set(g.items.map(datasetOf).filter((d): d is string => d !== null))];
            return (
              <div key={g.what} className={g.items.length === 0 ? "need quiet" : "need"}>
                <span className="value">{n(g.items.length)}</span>
                <span>{k.title}</span>
                <span className="meta">{g.items.length === 0 ? "nothing waits" : k.remedy}</span>
                {g.items.length > 0 && datasets.length > 0 && <span className="meta">{datasets.join(", ")}</span>}
              </div>
            );
          })}
      </div>
      {total === 0 && <p className="lede">Nothing waits here.</p>}
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => {
          const k = KINDS.find((x) => x.what === g.what);
          return (
            <section key={g.what} className="stack roomy">
              <div className="section-head rule-top">
                <h2>{k ? k.title.charAt(0).toUpperCase() + k.title.slice(1) : "Other identity questions"}</h2>
                <span className="meta">{k ? k.remedy : ""}</span>
              </div>
              <div className="table-wrap">
                <table className="thin">
                  <thead>
                    <tr>
                      <th>What</th>
                      <th>Dataset</th>
                      <th>Since</th>
                      <th className="acts" />
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((i) => {
                      const dataset = datasetOf(i);
                      const ev = (i.evidence ?? {}) as Json;
                      return (
                        <tr key={i.id}>
                          <td>
                            {itemWords(i)}
                            {typeof ev.shape === "string" && g.what !== "unmapped" && (
                              <span className="meta">
                                {" "}
                                · shaped <span className="path">{ev.shape}</span>
                              </span>
                            )}
                          </td>
                          <td className="path">{dataset ?? ""}</td>
                          <td className="num">{whenWords(i.created_at)}</td>
                          <td className="acts">
                            <span className="row-actions">
                              {identityActs(i).map && dataset && (
                                <a className="button secondary small" href={href("data", "datasets", dataset, "pseudonymisation")}>
                                  Map them
                                </a>
                              )}
                              {identityActs(i).merge && merges && (
                                <button type="button" className="button secondary small" onClick={() => setMerging(i)}>
                                  Merge
                                </button>
                              )}
                              {may.decide && identityActs(i).decide && (
                                <button type="button" className="button small" onClick={() => onDecide(i)}>
                                  Decide
                                </button>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      <Says head="What settles each of them">
        A collision is merged, or decided to be two. Held files are mapped on the dataset&apos;s Pseudonymisation page, and the next bring-in writes them. Nothing is decided here. A subject coded without a
        map is merged into the one it stands for, by a merge or by a map that names its identifier. The map and a merge read identifiers, so they need work on the Data page and records in full; the shapes
        and counts here are open to anyone who may see this page, and an identifier itself never appears on it.
      </Says>
      {merging && <MergeDialog item={merging} onClose={() => setMerging(null)} onDone={(w) => { setMerging(null); onChanged(w); }} />}
    </>
  );
}

/** A merge: the alias re-pointed to the canonical subject, in one transaction, as a job. */
export function MergeDialog({ item, onClose, onDone }: { item: ReviewItem; onClose: () => void; onDone: (words: string) => void }) {
  const ev = (item.evidence ?? {}) as Json;
  const codes = Array.isArray(ev.codes) ? (ev.codes as unknown[]).filter((c): c is string => typeof c === "string") : [];
  const [canonical, setCanonical] = useState(codes[0] ?? "");
  const [alias, setAlias] = useState(codes[1] ?? "");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const go = () => {
    setBusy(true);
    setRefused(null);
    review
      .merge(canonical.trim(), alias.trim(), why.trim())
      .then((r) => onDone(`Merging ${alias.trim()} into ${canonical.trim()} as job ${r.job}.`))
      .catch((e: unknown) => {
        setBusy(false);
        setRefused(refusalWords(e));
      });
  };
  const ready = canonical.trim() !== "" && alias.trim() !== "" && canonical.trim() !== alias.trim() && why.trim() !== "";
  return (
    <Dialog
      title="Merge two subjects"
      icon="users"
      onClose={onClose}
      foot={
        <div className="row actions">
          <button type="button" className="button" disabled={busy || !ready} onClick={go}>
            Merge
          </button>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="lede">{itemWords(item)}</p>
      <div className="fields2">
        <div className="field">
          <span className="label">The subject that stays</span>
          <span className="input mono">
            <input value={canonical} placeholder="canonical code" aria-label="The canonical subject" onChange={(e) => setCanonical(e.target.value)} />
          </span>
        </div>
        <div className="field">
          <span className="label">The alias merged into it</span>
          <span className="input mono">
            <input value={alias} placeholder="alias code" aria-label="The alias" onChange={(e) => setAlias(e.target.value)} />
          </span>
        </div>
      </div>
      <div className="field">
        <span className="label">Why</span>
        <span className="input">
          <input value={why} placeholder="what says they are one person" aria-label="Why" onChange={(e) => setWhy(e.target.value)} />
        </span>
      </div>
      <Says head="What a merge moves">
        Every row of the alias, its studies, stacks, memberships, identities and decisions, moves to the subject that stays. The alias&apos;s code is filed on it as an identifier, and the alias is marked
        merged and leaves every list. The audit records it.
      </Says>
    </Dialog>
  );
}
