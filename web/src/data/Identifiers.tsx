// SPDX-License-Identifier: AGPL-3.0-only
// One subject's identifiers, on Pseudonyms (record 55, ruling 35 (c); gate
// T31, step 8.7): an admin names a subject by its code and sees its IDs by
// type, where each came from and whether it is kept; the kept values only
// with a why, which the audit keeps, and never one that reads as a
// personnummer; the linkages that name it, each reversible; a link to another
// subject; and a purge with the code typed. Shown values live in this panel
// alone and go when the subject changes or the page closes.

import { useEffect, useId, useState } from "react";
import type { Capabilities } from "../capabilities";
import { messageOf } from "../settings/common";
import { Dialog } from "../ui/Dialog";
import { Wait } from "../ui/Wait";
import { EVERY_SUBJECT, identifiers, identifiersWork, reasonRefusal, valueWords, type Purge, type Shown } from "./identifiers";

export function Identifiers({ caps, onChanged }: { caps: Capabilities; onChanged?: () => void }) {
  const [code, setCode] = useState("");
  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [why, setWhy] = useState("");
  const [opened, setOpened] = useState<"link" | "purge" | "purge-all" | null>(null);
  const ids = useId();
  // shown values go with the panel
  useEffect(() => () => setShown(null), []);
  if (!identifiersWork(caps)) return null;

  const read = (subject: string, withWhy?: string) => {
    setBusy(Date.now());
    setFailed(null);
    (withWhy ? identifiers.values(subject, withWhy) : identifiers.show(subject))
      .then((s) => {
        setShown(s);
        setAsking(false);
        setWhy("");
      })
      .catch((e: unknown) => setFailed(messageOf(e)))
      .finally(() => setBusy(null));
  };
  const look = () => {
    const c = code.trim();
    if (!c) return;
    setShown(null);
    setSaid(null);
    read(c);
  };
  const unlink = (id: number) => {
    if (!shown) return;
    identifiers
      .unlink(id)
      .then(() => {
        setSaid(`Linkage ${id} reversed.`);
        read(shown.subject);
      })
      .catch((e: unknown) => setFailed(messageOf(e)));
  };
  const done = (words: string) => {
    setOpened(null);
    setSaid(words);
    onChanged?.();
    if (shown) read(shown.subject);
  };

  return (
    <div className="ps-ids">
      <div className="dp-band-head">
        <span className="eyebrow">One subject&apos;s IDs</span>
        <span className="meta">an admin&apos;s; every look audited</span>
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          look();
        }}
      >
        <label className="label" htmlFor={`${ids}-code`}>
          Subject code
        </label>
        <span className="input mono">
          <input
            id={`${ids}-code`}
            value={code}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setCode(e.target.value);
              setShown(null);
            }}
          />
        </span>
        <button type="submit" className="button secondary small" disabled={!code.trim() || busy !== null}>
          Show
        </button>
        <button type="button" className="button quiet small" onClick={() => setOpened("purge-all")}>
          Purge every subject
        </button>
      </form>
      {busy !== null && <Wait phase="reading the IDs" since={busy} />}
      {failed && <p className="warn">{failed}</p>}
      {said && <p className="ok-words">{said}</p>}
      {shown && (
        <div className="ps-ids-shown">
          <p className="meta">
            <span className="path">{shown.subject}</span>
            {shown.merged_into && (
              <>
                {" "}
                merged into <span className="path">{shown.merged_into}</span>
              </>
            )}
            {" · "}
            {shown.identifiers.length === 1 ? "1 ID" : `${shown.identifiers.length} IDs`}
            {shown.withheld > 0 && ` · ${shown.withheld} not shown`}
          </p>
          {shown.identifiers.length > 0 && (
            <div className="table-wrap">
              <table className="thin">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>From</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.identifiers.map((i) => (
                    <tr key={i.identity}>
                      <td className="path">{i.label}</td>
                      <td className="meta">{i.source}</td>
                      <td className={i.value !== undefined ? "path" : "meta"} title={i.withheld}>
                        {valueWords(i, shown.values)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="row actions">
            {!shown.values && shown.identifiers.some((i) => i.kept) && !asking && (
              <button type="button" className="button quiet small" onClick={() => setAsking(true)}>
                Show the values
              </button>
            )}
            {!shown.merged_into && (
              <button type="button" className="button quiet small" onClick={() => setOpened("link")}>
                Link a subject
              </button>
            )}
            <button type="button" className="button quiet small" onClick={() => setOpened("purge")}>
              Purge
            </button>
          </div>
          {asking && (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (reasonRefusal(why) === null) read(shown.subject, why.trim());
              }}
            >
              <label className="label" htmlFor={`${ids}-why`}>
                Why
              </label>
              <span className="input grow">
                <input id={`${ids}-why`} value={why} autoComplete="off" onChange={(e) => setWhy(e.target.value)} />
              </span>
              <button type="submit" className="button small" disabled={reasonRefusal(why) !== null || busy !== null}>
                Show
              </button>
              <span className="meta">Kept in the audit.</span>
            </form>
          )}
          {shown.linkages.length > 0 && (
            <div className="table-wrap">
              <table className="thin">
                <thead>
                  <tr>
                    <th className="num">Linkage</th>
                    <th>With</th>
                    <th>Evidence</th>
                    <th>State</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.linkages.map((l) => (
                    <tr key={l.id}>
                      <td className="num">{l.id}</td>
                      <td>
                        {l.role === "canonical" ? "alias " : "canonical "}
                        <span className="path">{l.other}</span>
                      </td>
                      <td className="meta">{l.evidence}</td>
                      <td className="meta">{l.reversed_at ? `reversed by ${l.reversed_by ?? "someone"}` : `by ${l.by ?? "someone"}`}</td>
                      <td>
                        {!l.reversed_at && (
                          <button type="button" className="button quiet small" aria-label={`Unlink ${l.id}`} onClick={() => unlink(l.id)}>
                            Unlink
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {opened === "link" && shown && <LinkDialog canonical={shown.subject} onClose={() => setOpened(null)} onDone={done} />}
      {(opened === "purge" || opened === "purge-all") && <PurgeDialog subject={opened === "purge" && shown ? shown.subject : null} onClose={() => setOpened(null)} onDone={done} />}
    </div>
  );
}

/** Another subject recorded as this one's alias, and merged into it. */
function LinkDialog({ canonical, onClose, onDone }: { canonical: string; onClose: () => void; onDone: (words: string) => void }) {
  const [alias, setAlias] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const ids = useId();
  const refusal = !alias.trim() ? "the other subject's code" : alias.trim() === canonical ? "another subject" : reasonRefusal(evidence);
  const send = () => {
    if (refusal !== null || busy) return;
    setBusy(true);
    setFailed(null);
    identifiers
      .link(canonical, alias.trim(), evidence.trim())
      .then((r) => onDone(`Linkage ${r.linkage} made; ${alias.trim()} merges into ${canonical} as job ${r.job}.`))
      .catch((e: unknown) => {
        setBusy(false);
        setFailed(messageOf(e));
      });
  };
  return (
    <Dialog
      title={`Link to ${canonical}`}
      icon="users"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{refusal === null ? "One person: the other merges into this one." : `Needs ${refusal}.`}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" disabled={busy || refusal !== null} onClick={send}>
            Link
          </button>
        </div>
      }
    >
      <div className="field">
        <label className="label" htmlFor={`${ids}-alias`}>
          Other subject
        </label>
        <span className="input mono">
          <input id={`${ids}-alias`} value={alias} autoComplete="off" spellCheck={false} onChange={(e) => setAlias(e.target.value)} />
        </span>
      </div>
      <div className="field">
        <label className="label" htmlFor={`${ids}-evidence`}>
          Evidence
        </label>
        <span className="input">
          <input id={`${ids}-evidence`} value={evidence} autoComplete="off" onChange={(e) => setEvidence(e.target.value)} />
        </span>
      </div>
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}

/** A purge: what it removes first, then the code (or "every subject") typed. */
function PurgeDialog({ subject, onClose, onDone }: { subject: string | null; onClose: () => void; onDone: (words: string) => void }) {
  const [look, setLook] = useState<Purge | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const ids = useId();
  const words = subject ?? EVERY_SUBJECT;
  useEffect(() => {
    identifiers
      .purgeLook(subject)
      .then(setLook)
      .catch((e: unknown) => setFailed(messageOf(e)));
  }, [subject]);
  const ready = look !== null && typed.trim() === words;
  const send = () => {
    if (!ready || busy) return;
    setBusy(true);
    setFailed(null);
    identifiers
      .purge(subject, typed.trim())
      .then((p) => onDone(`Purged ${p.identities} ${p.identities === 1 ? "ID" : "IDs"} and ${p.linkages} ${p.linkages === 1 ? "linkage" : "linkages"}.`))
      .catch((e: unknown) => {
        setBusy(false);
        setFailed(messageOf(e));
      });
  };
  return (
    <Dialog
      title={subject ? `Purge ${subject}'s IDs` : "Purge every subject's IDs"}
      icon="alert"
      onClose={onClose}
      foot={
        <div className="row actions">
          <span className="meta grow">{ready ? "Gone for good." : `Type ${words} to purge.`}</span>
          <button type="button" className="button secondary" onClick={onClose}>
            Keep
          </button>
          <button type="button" className="button" disabled={busy || !ready} onClick={send}>
            Purge
          </button>
        </div>
      }
    >
      {look ? (
        <p className="meta">
          {look.identities} {look.identities === 1 ? "ID" : "IDs"} and {look.linkages} {look.linkages === 1 ? "linkage" : "linkages"}. The audit and the subjects stay; a file read again files its ID again.
        </p>
      ) : (
        !failed && <p className="meta">Counting.</p>
      )}
      <div className="field">
        <label className="label" htmlFor={`${ids}-confirm`}>
          Type {subject ? "the code" : EVERY_SUBJECT}
        </label>
        <span className="input mono">
          <input id={`${ids}-confirm`} value={typed} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} />
        </span>
      </div>
      {failed && <p className="warn">{failed}</p>}
    </Dialog>
  );
}
