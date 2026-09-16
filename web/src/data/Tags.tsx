// SPDX-License-Identifier: AGPL-3.0-only
// The tag chooser (record 27, R3a): all hundred tags the pseudonymiser
// removes, what each one is, and what becomes of it under this dataset. A
// search box and the four groups narrow the list; ticking a row keeps that
// tag, which is this dataset's own exception on top of the hundred; a tag the
// hundred do not hold can be named here and this dataset removes it too. The
// rows the engine settles itself say so and cannot be ticked: the identifier
// is replaced by the subject's code, the age is computed and written, and the
// two tags that make a file a file are never removed. The summary counts what
// leaves and what stays, from the same rules, so it can never read a hundred
// removed while four of them are kept. Saving writes the lists on the
// dataset's place, where they live; a person who may not change them reads
// the same page and is told so in words.

import { useState } from "react";
import { needsWork } from "../access";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import type { Dataset } from "./datasets";
import { datasets } from "./pseudonyms";
import {
  addRemoved,
  countWords,
  dropRemoved,
  GROUPS,
  GROUP_TAGS,
  keepTag,
  matches,
  sameTags,
  STANDARD_TOTAL,
  tagCounts,
  tagRows,
  tagsOf,
  type TagGroup,
  type TagRow,
} from "./tags";

type Only = TagGroup | "all";

/** What the rows of one fate read as, where the row's own words are not the whole of it. */
const TICK_LABEL = "Keep it";

export function TagsDialog({ caps, dataset, onClose, onSaved }: { caps: Capabilities; dataset: Dataset; onClose: () => void; onSaved: (words: string) => void }) {
  const [tags, setTags] = useState(() => tagsOf(dataset.tags));
  const [only, setOnly] = useState<Only>("all");
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

  const rows = tagRows(tags);
  const counts = tagCounts(tags);
  const shown = rows.filter((r) => (only === "all" || r.group === only) && matches(r, search));
  const untouched = sameTags(tags, tagsOf(dataset.tags));

  const add = () => {
    const asked = addRemoved(tags, adding);
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
          {GROUP_TAGS.map((g) => (
            <i key={g.group} className={g.group} style={{ width: `${(g.tags / STANDARD_TOTAL) * 100}%` }} />
          ))}
        </div>
        <details className="says">
          <summary>How these add up</summary>
          <p>
            The pseudonymiser removes {STANDARD_TOTAL} tags in four groups, the same on every dataset. {countWords(counts)}. Sex, weight and size are covariates and stay unless this dataset says
            otherwise; the age is worked out from the birth date before it goes and written back; the identifier becomes the subject's code; and the two tags that make a file a file are remapped when
            the scans leave, never removed. Keeping beats removing, so a tag cannot be on both lists.
          </p>
        </details>

        <div className="tagpick-find">
          <div className="input">
            <input value={search} placeholder="Find a tag or a name" aria-label="Find a tag or a name" onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="row presets">
            <button type="button" className={only === "all" ? "opt on" : "opt"} onClick={() => setOnly("all")}>
              all {STANDARD_TOTAL}
            </button>
            {GROUPS.map((g) => (
              <button key={g.group} type="button" className={only === g.group ? "opt on" : "opt"} title={g.what} onClick={() => setOnly(g.group)}>
                <i className={`dot ${g.group}`} />
                {g.group} {GROUP_TAGS.find((t) => t.group === g.group)?.tags ?? 0}
              </button>
            ))}
          </div>
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
                    No tag here answers to {search.trim() === "" ? "this group" : `"${search.trim()}"`}.
                  </td>
                </tr>
              )}
              {shown.map((r) => (
                <Row key={r.tag} row={r} disabled={!mayChange || saving} onKeep={(keep) => setTags(keepTag(tags, r.tag, keep))} onDrop={() => setTags(dropRemoved(tags, r.tag))} />
              ))}
            </tbody>
          </table>
        </div>

        {mayChange && (
          <div className="field">
            <label className="label" htmlFor="tag-add">
              A tag the hundred do not hold
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
            <span className="meta">Four hexadecimal digits, a comma, four more. This dataset removes it beside the hundred; every other dataset is untouched.</span>
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
  const group = row.group ?? (row.fate === "added" ? "this dataset's own" : "always");
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
      <td>{row.name ?? <span className="meta">no name in the standard</span>}</td>
      <td className="tag-group meta">{group}</td>
      <td className={row.fate === "removed" || row.fate === "added" ? undefined : "tag-stays"}>{row.words}</td>
    </tr>
  );
}
