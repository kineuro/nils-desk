// SPDX-License-Identifier: AGPL-3.0-only
// A campaign's suggestions from outside (record 50 R3): how many it carries
// and from whom, and for its maker a file to bring more in (v0's committed
// labels, a model's proposals with a confidence per class). A suggestion is
// never an answer: a person checks it in the gallery, and what a person
// accepted is the label.

import { useEffect, useState } from "react";
import type { Json } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { refused as refusedWords, type Campaign } from "./client";
import { gallery, R50, singleAxis } from "./gallery";

interface Summary {
  count: number;
  items: number;
  authors: { author: string; count: number; values: Record<string, number> }[];
}

export function summaryOf(raw: Json): Summary {
  const authors = Array.isArray(raw.authors) ? (raw.authors as Json[]) : [];
  return {
    count: typeof raw.count === "number" ? raw.count : 0,
    items: typeof raw.items === "number" ? raw.items : 0,
    authors: authors.map((a) => ({
      author: typeof a.author === "string" ? a.author : "?",
      count: typeof a.count === "number" ? a.count : 0,
      values: a.values && typeof a.values === "object" ? (a.values as Record<string, number>) : {},
    })),
  };
}

/** What an import brought in, in a line. */
export function importWords(r: Json): string {
  const n = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : 0);
  const parts = [`${r.dry_run ? "would bring" : "brought"} ${n("suggestions")} ${n("suggestions") === 1 ? "suggestion" : "suggestions"}`];
  if (n("replaced") > 0) parts.push(`${n("replaced")} replacing the same author's`);
  if (n("unmatched") > 0) parts.push(`${n("unmatched")} named nothing here`);
  if (n("sealed") > 0) parts.push(`${n("sealed")} of a sealed sample, left out`);
  if (n("refused_values") > 0) parts.push(`${n("refused_values")} with a value the axis does not take`);
  if (n("no_author") > 0) parts.push(`${n("no_author")} without an author`);
  return parts.join(" · ");
}

export function Suggestions({ caps, campaign: c }: { caps: Capabilities; campaign: Campaign }) {
  const [sum, setSum] = useState<Summary | null>(null);
  const [author, setAuthor] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reads = served(caps, R50.suggestions) && (c.question.kind === "axis" || c.question.kind === "axes");
  const brings = served(caps, R50.suggest) && c.status === "open" && (c.owner === caps.person.subject || may(caps, "review:work"));
  useEffect(() => {
    if (reads) gallery.suggestions(c.id).then((r) => setSum(summaryOf(r)), () => setSum(null));
  }, [reads, c.id]);
  if (!reads) return null;
  const bring = (file: File) => {
    setBusy(true);
    file
      .text()
      .then((tsv) => gallery.suggest(c.id, { tsv, source: file.name, ...(author.trim() ? { author: author.trim() } : {}) }))
      .then((r) => {
        setSaid(importWords(r));
        return gallery.suggestions(c.id).then((x) => setSum(summaryOf(x)));
      })
      .catch((e: unknown) => setSaid(refusedWords(e)))
      .finally(() => setBusy(false));
  };
  return (
    <div className="suggestions">
      <h2>Suggestions</h2>
      {sum && sum.count > 0 ? (
        <p className="meta">
          {sum.count} for {sum.items} {sum.items === 1 ? "item" : "items"}:{" "}
          {sum.authors.map((a) => `${a.author} ${a.count} (${Object.entries(a.values).map(([v, k]) => `${v} ${k}`).join(", ")})`).join(" · ")}
          {singleAxis(c.question) ? " Check them in the gallery." : ""}
        </p>
      ) : (
        <p className="meta">None from outside yet: the reader suggests the engine's own.</p>
      )}
      {brings && (
        <div className="row actions">
          <input className="input" placeholder="author: v0-model, v0-person or a model id" value={author} onChange={(e) => setAuthor(e.target.value)} aria-label="author" />
          <label className="button secondary small">
            Bring a file (TSV)
            <input type="file" accept=".tsv,.txt,text/tab-separated-values" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && bring(e.target.files[0])} />
          </label>
        </div>
      )}
      {brings && <p className="meta">The first line names the columns: stack_id, item or SeriesInstanceUID; value; author; and a p:&lt;value&gt; column per class. A stack of a sealed sample takes none.</p>}
      {said && <p className="meta said">{said}</p>}
    </div>
  );
}
