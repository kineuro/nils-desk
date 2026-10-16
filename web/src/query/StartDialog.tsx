// SPDX-License-Identifier: AGPL-3.0-only
// Start a query (Query > Cards > New card): from everyone, from cohorts, from
// a saved selection, from a kept result or from a list of IDs, each chosen
// from a list where the desk has one. Counting is asking and keeps nothing;
// Open as a card keeps it. The IDs pasted live in this dialog alone: they go
// to the engine's upload door, which keeps the list's shape and never a value.

import { useEffect, useState } from "react";
import { ask, results, type HandleRow, type Json, type Uploaded } from "../ask/client";
import { HELD_WHY } from "../ask/held";
import { countWords, startBody, type Started } from "../ask/start";
import type { Capabilities } from "../capabilities";
import { linkage, typeLabel, type IdType } from "../data/pseudonyms";
import { door as served } from "../deployment";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { keepingRefusal } from "./cards";
import { selections, type SelectionRow } from "./selections";
import { idsRefusal, pastedIds, resultWords, selectionRef, selectionWords, startableResults, startFrom, startRefusal, startsFromIds, startsFromResult, startsFromSelection, unmatchedWords, type StartKind } from "./start";

/** The lists the dialog chooses from, each read once, when its choice is first opened; null while it is read. */
function useLists(caps: Capabilities, kind: StartKind) {
  const [chosen, setChosen] = useState<SelectionRow[] | null>(null);
  const [kept, setKept] = useState<HandleRow[] | null>(null);
  const [types, setTypes] = useState<IdType[] | null>(null);
  useEffect(() => {
    if (kind === "selection") selections.list("", null, 200).then((r) => setChosen(r.selections), () => setChosen([]));
  }, [kind]);
  useEffect(() => {
    if (kind === "handle") results.handles().then((r) => setKept(startableResults(r.handles)), () => setKept([]));
  }, [kind]);
  useEffect(() => {
    if (kind === "values") {
      if (served(caps, "GET /api/linkage/types")) linkage.types().then((r) => setTypes(r.types), () => setTypes([]));
      else setTypes([]);
    }
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps -- the doors do not change while it is open
  return { selections: chosen, results: kept, types };
}

export function StartDialog({ caps, onClose }: { caps: Capabilities; onClose: () => void }) {
  const [kind, setKind] = useState<StartKind>("nothing");
  const [cohorts, setCohorts] = useState("");
  const [selection, setSelection] = useState("");
  const [handle, setHandle] = useState<number | null>(null);
  const [idType, setIdType] = useState("");
  const [ids, setIds] = useState("");
  const [started, setStarted] = useState<Started | null>(null);
  const [uploaded, setUploaded] = useState<Uploaded | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lists = useLists(caps, kind);
  // counting is asking; opening what was counted as a card keeps it
  const keeping = keepingRefusal(caps);
  const noIds = idsRefusal(caps);
  // the ID type shown first is the one sent until another is chosen
  const types = (lists.types ?? []).map((t) => ({ name: t.name, words: `${typeLabel(t)}${t.identifying ? " · leads to a person" : ""}` }));
  const typed = idType !== "" ? idType : (types[0]?.name ?? "");
  const pasted = pastedIds(typed, ids);
  const from = startFrom(kind, { cohorts, selection, handle });
  const ready = kind === "values" ? pasted !== null : from !== null;
  // a change of what it starts from makes the count stale
  const stale = () => {
    setStarted(null);
    setUploaded(null);
    setWhy(null);
  };
  const choose = (next: StartKind) => {
    setKind(next);
    stale();
  };

  const look = () => {
    setBusy(true);
    setWhy(null);
    const counted =
      kind === "values" && pasted
        ? ask.upload(pasted.values, pasted.type).then((u) => {
            setUploaded(u);
            return ask.start(startBody({ kind: "values", upload: u.upload_id }));
          })
        : from
          ? ask.start(startBody(from))
          : Promise.reject(new Error("choose what to start from"));
    counted
      .then((s) => setStarted(s as Started))
      .catch((e: unknown) => setWhy(startRefusal(e)))
      .finally(() => setBusy(false));
  };
  const open = () => {
    if (!started) return;
    setBusy(true);
    ask
      .store(started.document as Json)
      .then((d) => {
        location.hash = href("query", String(d.document));
      })
      .catch((e: unknown) => {
        setBusy(false);
        setWhy(startRefusal(e));
      });
  };
  const unmatched = uploaded ? unmatchedWords(uploaded) : null;
  return (
    <Dialog
      title="Start a query"
      icon="search"
      onClose={onClose}
      foot={
        <div className="row actions">
          {started ? (
            keeping === null && (
              <button type="button" className="button" disabled={busy} onClick={open}>
                Open as a card
              </button>
            )
          ) : (
            <button type="button" className="button" disabled={busy || !ready} onClick={look}>
              Count it
            </button>
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {why && <span className="warn">{why}</span>}
        </div>
      }
    >
      <div className="field">
        <span className="label">Start from</span>
        <div className="choices">
          <label className="radio-row">
            <input type="radio" name="from" checked={kind === "nothing"} onChange={() => choose("nothing")} />
            <span>Everyone the registry holds</span>
          </label>
          <label className="radio-row">
            <input type="radio" name="from" checked={kind === "cohorts"} onChange={() => choose("cohorts")} />
            <span>One or more cohorts</span>
          </label>
          {kind === "cohorts" && (
            <div className="input">
              <input
                value={cohorts}
                placeholder="cohort names, separated by commas"
                aria-label="Cohorts"
                onChange={(e) => {
                  setCohorts(e.target.value);
                  stale();
                }}
              />
            </div>
          )}
          {startsFromSelection(caps) && (
            <>
              <label className="radio-row">
                <input type="radio" name="from" checked={kind === "selection"} onChange={() => choose("selection")} />
                <span>A saved selection</span>
              </label>
              {kind === "selection" && (
                <div className="input">
                  <select
                    value={selection}
                    aria-label="Which selection"
                    onChange={(e) => {
                      setSelection(e.target.value);
                      stale();
                    }}
                  >
                    <option value="">{lists.selections === null ? "reading the selections" : lists.selections.length === 0 ? "no selection saved yet" : "choose a selection"}</option>
                    {(lists.selections ?? []).map((s) => (
                      <option key={s.id} value={selectionRef(s)}>
                        {selectionWords(s)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          {startsFromResult(caps) && (
            <>
              <label className="radio-row">
                <input type="radio" name="from" checked={kind === "handle"} onChange={() => choose("handle")} />
                <span>A kept result</span>
              </label>
              {kind === "handle" && (
                <div className="input">
                  <select
                    value={handle ?? ""}
                    aria-label="Which result"
                    onChange={(e) => {
                      setHandle(e.target.value === "" ? null : Number(e.target.value));
                      stale();
                    }}
                  >
                    <option value="">{lists.results === null ? "reading the results" : lists.results.length === 0 ? "no kept result yet" : "choose a result"}</option>
                    {(lists.results ?? []).map((h) => (
                      <option key={h.id} value={h.id}>
                        {resultWords(h)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          {startsFromIds(caps) && (
            <>
              <label className={noIds === null ? "radio-row" : "radio-row off"}>
                <input type="radio" name="from" checked={kind === "values"} disabled={noIds !== null} onChange={() => choose("values")} />
                <span>A list of IDs</span>
                {noIds !== null && <Hint text={noIds} />}
              </label>
              {kind === "values" && (
                <>
                  <div className="input">
                    <select
                      value={typed}
                      aria-label="What kind of ID"
                      onChange={(e) => {
                        setIdType(e.target.value);
                        stale();
                      }}
                    >
                      {lists.types === null && <option value="">reading the ID types</option>}
                      {lists.types !== null && types.length === 0 && <option value="">no ID type yet</option>}
                      {types.map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.words}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="input mono">
                    <textarea
                      value={ids}
                      rows={5}
                      spellCheck={false}
                      autoComplete="off"
                      aria-label="The IDs"
                      placeholder="one on each line, or separated by commas"
                      onChange={(e) => {
                        setIds(e.target.value);
                        stale();
                      }}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {started && (
        <p className="lede" title={started.count === null ? HELD_WHY : undefined}>
          {countWords(started)}
        </p>
      )}
      {unmatched && <p className="meta">{unmatched}</p>}
      {keeping !== null && <p className="meta">{keeping} Counting here keeps nothing.</p>}
    </Dialog>
  );
}
