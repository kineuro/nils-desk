// SPDX-License-Identifier: AGPL-3.0-only
// Clinical, under Data (gate T31, walkthrough step 22.8): the vocabulary of
// diseases and kinds of observation the registry holds, a vocabulary
// loaded, and clinical rows imported from a file under a mapping. An import
// is previewed first and applied only from its preview.

import { useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { clinical, clinicalActs, identifierRefusal, importFailure, loadedWords, reportWords, vocabularyWords, type ImportReport, type Vocabulary } from "./clinical";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; v: Vocabulary };

export function ClinicalPage({ caps, onChanged }: { caps: Capabilities; onChanged?: () => void }) {
  const acts = clinicalActs(caps);
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const [opened, setOpened] = useState<"load" | "import" | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const read = useCallback(() => {
    clinical.vocabulary().then(
      (v) => setLoad({ kind: "ready", v }),
      (e: unknown) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: messageOf(e) })),
    );
  }, []);
  useEffect(() => {
    if (acts.see) read();
  }, [acts.see, read]);
  const done = (words: string) => {
    setOpened(null);
    setSaid(words);
    read();
    onChanged?.();
  };
  if (!acts.see) return <p className="meta">This engine has no clinical doors.</p>;
  const v = load.kind === "ready" ? load.v : null;
  const empty = v !== null && v.observation_types.length === 0;
  return (
    <section className="data clinical-page">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Data</span>
          <h1>Clinical</h1>
        </div>
        {acts.load && (
          <button type="button" className={empty ? "button" : "button secondary"} onClick={() => setOpened("load")}>
            Load a vocabulary
          </button>
        )}
        {acts.import && !empty && (
          <button type="button" className="button" onClick={() => setOpened("import")}>
            <Icon name="upload" />
            Import a file
          </button>
        )}
      </div>
      {said && <p className="ok-words">{said}</p>}
      {load.kind === "loading" && <Wait phase="reading the vocabulary" since={load.since} size="panel" />}
      {load.kind === "failed" && <p className="warn">The vocabulary could not be read: {load.why}</p>}
      {v && <p className="meta">{vocabularyWords(v)}{empty && acts.load ? " Load one before importing rows." : ""}</p>}
      {v && v.observation_types.length > 0 && (
        <div className="table-wrap">
          <table className="thin">
            <thead>
              <tr>
                <th>Kind of observation</th>
                <th>Category</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {v.observation_types.map((k) => (
                <tr key={k.id}>
                  <td>
                    {k.name}
                    {k.primary && <span className="tag">primary</span>}
                    {k.sensitive && <span className="tag caution">sensitive</span>}
                  </td>
                  <td className="meta">{k.category}</td>
                  <td className="meta">{[k.value_type ?? "date", k.unit].filter(Boolean).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {opened === "load" && <LoadDialog onClose={() => setOpened(null)} onDone={done} />}
      {opened === "import" && <ImportDialog caps={caps} onClose={() => setOpened(null)} onDone={done} />}
    </section>
  );
}

/** A file the person picks, read as text, with its name. */
function PickFile({ label, hint, accept, file, onFile }: { label: string; hint: string; accept: string; file: { name: string; text: string } | null; onFile: (f: { name: string; text: string }) => void }) {
  return (
    <div className="field">
      <span className="label">
        {label}
        <Hint text={hint} />
      </span>
      <span className="row wrap">
        <label className="button quiet small file-pick">
          <Icon name="upload" />
          {file ? "Another file" : "Choose a file"}
          <input type="file" accept={accept} hidden aria-label={label} onChange={(e) => e.target.files?.[0]?.text().then((text) => onFile({ name: e.target.files?.[0]?.name ?? "", text }))} />
        </label>
        {file && <span className="path">{file.name}</span>}
      </span>
    </div>
  );
}

/** Load a vocabulary: the pack's own, or a file. */
function LoadDialog({ onClose, onDone }: { onClose: () => void; onDone: (words: string) => void }) {
  const [own, setOwn] = useState(true);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const go = () => {
    setBusy(Date.now());
    setWhy(null);
    (own ? clinical.load() : clinical.load(file?.text, file?.name)).then(
      (l) => onDone(loadedWords(l)),
      (e: unknown) => {
        setBusy(null);
        setWhy(messageOf(e));
      },
    );
  };
  const foot = (
    <div className="row actions">
      {busy !== null && <Wait phase="loading" since={busy} />}
      {why && <span className="warn">{why}</span>}
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button type="button" className="button" disabled={busy !== null || (!own && !file)} onClick={go}>
        Load
      </button>
    </div>
  );
  return (
    <Dialog title="Load a vocabulary" icon="upload" onClose={onClose} foot={foot}>
      <div className="choices">
        <label className="radio-row">
          <input type="radio" name="vocabulary" checked={own} onChange={() => setOwn(true)} />
          <span>
            <b>The pack&apos;s own</b>
            <span className="meta">clinical/vocabulary.yml, as the engine reads its packs</span>
          </span>
        </label>
        <label className="radio-row">
          <input type="radio" name="vocabulary" checked={!own} onChange={() => setOwn(false)} />
          <span>
            <b>A file</b>
            <span className="meta">a vocabulary.yml of the site&apos;s own</span>
          </span>
        </label>
      </div>
      {!own && <PickFile label="Vocabulary file" hint="What exists is updated by name, what is new is added, nothing is removed." accept=".yml,.yaml,text/yaml" file={file} onFile={setFile} />}
    </Dialog>
  );
}

/** How many reasons for refused rows the preview lists; the rest are counted. */
const REASONS = 8;

/** Import a file: the mapping and the CSV, previewed, then applied from the preview. */
function ImportDialog({ caps, onClose, onDone }: { caps: Capabilities; onClose: () => void; onDone: (words: string) => void }) {
  const [mapping, setMapping] = useState<{ name: string; text: string } | null>(null);
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState<{ phase: string; since: number } | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const refusal = mapping ? identifierRefusal(caps, mapping.text) : null;
  const run = (apply: boolean) => {
    if (!mapping || !csv) return;
    setBusy({ phase: apply ? "importing" : "reading the file", since: Date.now() });
    setWhy(null);
    clinical.import(mapping.text, csv.text, apply).then(
      (r) => {
        setBusy(null);
        if (apply) onDone(reportWords(r));
        else setPreview(r);
      },
      (e: unknown) => {
        setBusy(null);
        // the engine's refusal may list the file's first line; only names and places are printed
        setWhy(importFailure(messageOf(e), csv.text));
      },
    );
  };
  const pick = (set: (f: { name: string; text: string }) => void) => (f: { name: string; text: string }) => {
    set(f);
    setPreview(null);
  };
  // the reasons come in words that carry nothing of the file (clinical.ts), merged and the most rows first
  const refused = preview ? Object.entries(preview.refused) : [];
  const foot = (
    <div className="row actions">
      {busy && <Wait phase={busy.phase} since={busy.since} />}
      {(why ?? refusal) && <span className="warn">{why ?? refusal}</span>}
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      {preview === null ? (
        <button type="button" className="button" disabled={!mapping || !csv || busy !== null || refusal !== null} onClick={() => run(false)}>
          Preview
        </button>
      ) : (
        <button type="button" className="button" disabled={busy !== null || preview.changes === 0} onClick={() => run(true)}>
          Import
        </button>
      )}
    </div>
  );
  return (
    <Dialog title="Import clinical rows" icon="upload" onClose={onClose} foot={foot}>
      <PickFile label="Mapping" hint="The target, how a row names its subject, the columns and their parsers, and what to do with a row that exists." accept=".yml,.yaml,text/yaml" file={mapping} onFile={pick(setMapping)} />
      <PickFile label="Rows" hint="A CSV with a header line. A row the registry holds already is left as it is, so the same file twice changes nothing." accept=".csv,text/csv" file={csv} onFile={pick(setCsv)} />
      {preview && (
        <>
          <p className="lede">{reportWords(preview)}</p>
          {refused.length > 0 && (
            <ul className="preflight-missing" aria-label="refused rows">
              {refused.slice(0, REASONS).map(([w, c]) => (
                <li key={w}>
                  <b className="num">{c.toLocaleString("en-US")}</b> {w}
                </li>
              ))}
              {refused.length > REASONS && <li className="meta">and {(refused.length - REASONS).toLocaleString("en-US")} more reasons</li>}
            </ul>
          )}
        </>
      )}
    </Dialog>
  );
}
