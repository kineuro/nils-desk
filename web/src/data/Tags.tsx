// SPDX-License-Identifier: AGPL-3.0-only
// The tag chooser (record 27, R3a; record 28). Every tag the pseudonymiser
// acts on, read from the engine that owns the policy, and what becomes of
// each under this dataset. A search box and the groups narrow the list;
// ticking a row keeps that tag, which is this dataset's own exception on top
// of what the engine removes; a tag the engine does not remove can be named
// here and this dataset removes it too. The rows the engine settles itself
// carry its own words and cannot be ticked: the identifier is replaced by the
// subject's code, the age is computed and written in place, and the two tags
// that make a file a file are never removed. The summary counts what leaves
// and what stays by those same rules, so it can never read every tag removed
// while some are kept. Saving writes the lists on the dataset's place, where
// they live; a person who may not change them reads the same page and is told
// so in words.
//
// The desk supplies the names and nothing else. An engine that does not serve
// the policy leaves the list unknown, and the chooser says so in one sentence
// rather than showing a list the desk kept of its own: what this dataset keeps
// and removes is still shown and still edited, since that is the dataset's and
// its place still takes it.

import { useState } from "react";
import { needsWork } from "../access";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import type { Dataset } from "./datasets";
import { addRemoved, countWords, dropRemoved, keepTag, matches, sameTags, tagCounts, tagRows, tagsOf, type TagPolicy, type TagRow } from "./policy";
import { datasets } from "./pseudonyms";

/** What each group is, in the few words a filter can carry: the engine names them, the desk says what they are. */
const GROUP_WORDS: Record<string, string> = {
  patient: "who the patient is",
  provider: "who performed, referred, read and reported",
  trial: "which trial, arm, site and protocol",
  institution: "where it was done",
};

/** What the rows of one fate read as, where the row's own words are not the whole of it. */
const TICK_LABEL = "Keep it";

export function TagsDialog({
  caps,
  dataset,
  policy,
  onClose,
  onSaved,
}: {
  caps: Capabilities;
  dataset: Dataset;
  /** What the engine serves of its own policy, or null where it serves none and where it has not answered yet. */
  policy: TagPolicy | null;
  onClose: () => void;
  onSaved: (words: string) => void;
}) {
  const [tags, setTags] = useState(() => tagsOf(dataset.tags));
  const [only, setOnly] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState("");
  const [why, setWhy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const changing = needsWork(caps, "Choosing which tags go", [
    ["data:work", "the Data page"],
    ["places:work", "the Places page"],
  ]);
  const takes = served(caps, "PUT /api/places/{id}");
  const mayChange = changing === null && takes;

  const rows = tagRows(policy, tags);
  const counts = policy ? tagCounts(policy, tags) : null;
  const shown = rows.filter((r) => (only === "all" || r.category === only) && matches(r, search));
  const untouched = sameTags(tags, tagsOf(dataset.tags));
  // an engine that serves the policy has simply not answered yet; one that does not serve it never will
  const unknown = served(caps, "GET /api/pseudonymize/tags")
    ? "Reading what the pseudonymiser removes."
    : "This engine does not serve the list of tags the pseudonymiser removes, so the desk does not show one. It removes them all the same; what this dataset keeps and removes of its own is below.";

  const add = () => {
    const asked = addRemoved(policy, tags, adding);
    if ("refusal" in asked) {
      setWhy(asked.refusal);
      return;
    }
    setTags(asked.tags);
    setAdding("");
    setWhy(null);
  };

  const save = () => {
    setSaving(true);
    setWhy(null);
    datasets
      .set(dataset.id, { tags })
      .then(() => onSaved(`The tags of ${dataset.name} are changed; the next bring-in reads them so.`))
      .catch((e: unknown) => {
        setSaving(false);
        setWhy(messageOf(e));
      });
  };

  const foot = (
    <div className="row actions">
      {mayChange && (
        <button type="button" className="button" disabled={saving || untouched} onClick={save}>
          Save
        </button>
      )}
      <button type="button" className="button secondary" onClick={onClose}>
        {mayChange ? "Cancel" : "Close"}
      </button>
      <span className="grow" />
      {!mayChange && <span className="meta">{changing ?? "This engine does not take a change to a dataset here."}</span>}
      {why && <span className="warn">{why}</span>}
    </div>
  );

  return (
    <Dialog title={`Tags of ${dataset.name}`} icon="shield" onClose={onClose} foot={foot}>
      <div className="tagpick">
        {policy && counts ? (
          <>
            <div className="values">
              <div>
                <span className="k">removed</span>
                <span className="v">{counts.removed}</span>
              </div>
              <div>
                <span className="k">kept</span>
                <span className="v">{counts.kept}</span>
              </div>
              <div>
                <span className="k">this dataset's own</span>
                <span className="v">{counts.extra === 0 ? "none" : counts.extra}</span>
              </div>
            </div>
            <div className="tagbar" aria-label="the removed tags by group">
              {policy.categories.map((g) => (
                <i key={g.category} className={g.category} style={{ width: `${(g.count / policy.count) * 100}%` }} />
              ))}
            </div>
            <details className="says">
              <summary>How these add up</summary>
              <p>
                The pseudonymiser removes {policy.count} tags in {policy.categories.length} groups, the same on every dataset. {countWords(counts)}. What the engine keeps or settles itself says so on
                its own row, in the engine's words, and cannot be ticked away. Keeping beats removing, so a tag cannot be on both lists.
              </p>
            </details>
          </>
        ) : (
          <p className="meta">{unknown}</p>
        )}

        <div className="tagpick-find">
          <div className="input">
            <input value={search} placeholder="Find a tag or a name" aria-label="Find a tag or a name" onChange={(e) => setSearch(e.target.value)} />
          </div>
          {policy && (
            <div className="row presets">
              <button type="button" className={only === "all" ? "opt on" : "opt"} onClick={() => setOnly("all")}>
                all {policy.count}
              </button>
              {policy.categories.map((g) => (
                <button key={g.category} type="button" className={only === g.category ? "opt on" : "opt"} title={GROUP_WORDS[g.category]} onClick={() => setOnly(g.category)}>
                  <i className={`dot ${g.category}`} />
                  {g.category} {g.count}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="table-wrap">
          <table className="thin tagpick-table">
            <thead>
              <tr>
                <th className="tick">Keep</th>
                <th>Tag</th>
                <th>Name</th>
                <th className="tag-group">Group</th>
                <th>What happens to it</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="meta">
                    {rows.length === 0 ? "This dataset keeps and removes nothing of its own." : `No tag here answers to ${search.trim() === "" ? "this group" : `"${search.trim()}"`}.`}
                  </td>
                </tr>
              )}
              {shown.map((r) => (
                <Row key={r.tag} row={r} disabled={!mayChange || saving} onKeep={(keep) => setTags(keepTag(policy, tags, r.tag, keep))} onDrop={() => setTags(dropRemoved(tags, r.tag))} />
              ))}
            </tbody>
          </table>
        </div>

        {mayChange && (
          <div className="field">
            <label className="label" htmlFor="tag-add">
              A tag this dataset removes as well
            </label>
            <div className="tagpick-add">
              <div className="input mono">
                <input
                  id="tag-add"
                  value={adding}
                  placeholder="0008,1030"
                  disabled={saving}
                  onChange={(e) => {
                    setAdding(e.target.value);
                    setWhy(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      add();
                    }
                  }}
                />
              </div>
              <button type="button" className="button secondary" disabled={saving || adding.trim() === ""} onClick={add}>
                Remove it too
              </button>
            </div>
            <span className="meta">Four hexadecimal digits, a comma, four more. This dataset removes it beside the rest; every other dataset is untouched.</span>
          </div>
        )}

        <div className="note">
          <Icon name="info" />
          <div className="note-body">
            <p className="note-detail">
              The lists belong to the dataset, not to a run: the tree already written is not rewritten by a change here, and the next bring-in reads them. Pixels are untouched either way, private tags
              go bar the ones the pack names, and overlays and curves go with them.
            </p>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function Row({ row, disabled, onKeep, onDrop }: { row: TagRow; disabled: boolean; onKeep: (keep: boolean) => void; onDrop: () => void }) {
  const group = row.category ?? (row.fixed ? "always" : "this dataset's own");
  return (
    <tr className={row.kept && !row.fixed ? "kept" : undefined}>
      <td className="tick">
        {row.fixed ? (
          <Icon name="lock" />
        ) : row.fate === "added" ? (
          <button type="button" className="icon-button" aria-label={`Stop removing ${row.tag}`} disabled={disabled} onClick={onDrop}>
            <Icon name="x" />
          </button>
        ) : (
          <input type="checkbox" checked={row.kept} disabled={disabled} aria-label={`${TICK_LABEL} ${row.tag}`} onChange={(e) => onKeep(e.target.checked)} />
        )}
      </td>
      <td className="path">{row.tag}</td>
      <td>{row.name ?? <span className="meta">{row.name === null ? "no name in the standard" : "this desk has no name for it"}</span>}</td>
      <td className="tag-group meta">{group}</td>
      <td className={row.fate === "removed" || row.fate === "added" ? undefined : "tag-stays"}>{row.words}</td>
    </tr>
  );
}
