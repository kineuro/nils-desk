// SPDX-License-Identifier: AGPL-3.0-only
// Adding a model (record 23), a dialog on the Kvasir page: where the model
// is, its address and key, the models its server lists, and one short request
// to the model chosen. Add is offered only once that request answered for
// exactly what the dialog shows; Kvasir asks the model again before it holds
// it, and says what each model said when one did not answer.

import { useId, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import {
  addable,
  addedWords,
  addressHint,
  asksKey,
  CHECKED_FIRST,
  description,
  draft,
  findRefusal,
  fingerprint,
  listedWords,
  localityOf,
  pickFrom,
  PRESETS,
  refusedWords,
  stale,
  testRefusal,
  triedWords,
  WHERE,
  withPreset,
  type Draft,
  type Tested,
} from "./adding";
import { Acted, useActing } from "./common";
import { kvasir, type Locality, triedOf } from "./kvasir";

/** What an add held: the backend's id, where its prompts go, and its models. */
export interface Added {
  id: string;
  locality: Locality;
  models: string[];
}

export function AddModel({ onClose, onDone }: { onClose: () => void; onDone: (words: string, added: Added) => void }) {
  const id = useId();
  const [d, setD] = useState<Draft>(() => draft("here"));
  /** What the server lists: undefined until asked, null where it lists nothing it can say. */
  const [listed, setListed] = useState<string[] | null | undefined>(undefined);
  const [typing, setTyping] = useState(false);
  const [tested, setTested] = useState<Tested | null>(null);
  const [refused, setRefused] = useState<string[]>([]);
  // what was said for another place or provider is not said again once one is chosen
  const [round, setRound] = useState(0);
  const [findRound, setFindRound] = useState(-1);
  const [workRound, setWorkRound] = useState(-1);
  const finding = useActing();
  const working = useActing();
  const busy = finding.working || working.working;

  const edit = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }));
    setRefused([]);
  };
  // another place or provider starts the dialog again from there
  const begin = (next: Draft) => {
    setRound((r) => r + 1);
    setD(next);
    setListed(undefined);
    setTyping(false);
    setTested(null);
    setRefused([]);
  };

  const find = () => {
    setFindRound(round);
    finding.act("asking the server which models it serves", async () => {
      const r = await kvasir.test(description(d, false));
      const names = r.listed ?? null;
      setListed(names);
      if (names && names.length > 0) {
        setTyping(false);
        setD((x) => ({ ...x, model: pickFrom(names, x.model) }));
      }
      return listedWords(names);
    });
  };

  const test = () => {
    const asked = d;
    setWorkRound(round);
    working.act(`sending ${asked.model.trim()} one short request`, async () => {
      setRefused([]);
      const r = await kvasir.test(description(asked, true));
      const model = r.models.find((m) => m.id === asked.model.trim()) ?? r.models[0];
      if (!model) throw new Error("Kvasir answered without a word about the model.");
      setTested({ print: fingerprint(asked), model });
      return "";
    });
  };

  const add = () => {
    const asked = d;
    setWorkRound(round);
    working.act(`adding ${asked.model.trim()} to Kvasir`, async () => {
      try {
        const r = await kvasir.add(description(asked, true));
        onDone(addedWords(asked.model.trim(), r.backend.id, r.backend.locality), r.backend);
        return "";
      } catch (e) {
        const models = triedOf(e);
        if (!models) throw e;
        setTested(null);
        setRefused(refusedWords(models));
        throw new Error("Kvasir asked the model again before holding it, and did not add it.");
      }
    });
  };

  const found = listed !== undefined;
  const picking = Array.isArray(listed) && listed.length > 0 && !typing;
  const cannotFind = findRefusal(d);
  const cannotTest = found ? testRefusal(d) : null;
  const outcome = tested && !stale(d, tested) ? triedWords(tested.model) : null;
  const quiet = working.acting.kind === "done" && working.acting.words === "";

  const foot = (
    <>
      {outcome &&
        (outcome.answered ? (
          <p className="ok-words">{`${outcome.words} It can be added.`}</p>
        ) : (
          <div className="tried">
            <p className="warn">{outcome.words}</p>
            {outcome.detail && <p className="meta">{outcome.detail}</p>}
          </div>
        ))}
      {stale(d, tested) && <p className="meta">Something changed since the test, so test it again.</p>}
      {refused.length > 0 && (
        <ul className="tried-list">
          {refused.map((w) => (
            <li key={w} className="warn">
              {w}
            </li>
          ))}
        </ul>
      )}
      {!quiet && workRound === round && <Acted acting={working.acting} />}
      {cannotTest && <p className="meta">{cannotTest}</p>}
      <div className="row actions">
        <button type="button" className="button secondary" disabled={!found || cannotTest !== null || busy} onClick={test}>
          Test
        </button>
        <button type="button" className="button" disabled={!addable(d, tested) || busy} onClick={add}>
          Add
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return (
    <Dialog title="Add a model" icon="gateway" onClose={onClose} foot={foot}>
      <fieldset className="field plain-set">
        <legend className="label">Where it is</legend>
        <div className="choices">
          {WHERE.map((w) => (
            <label key={w.id} className="radio-row">
              <input type="radio" name={`${id}-where`} checked={d.where === w.id} disabled={busy} onChange={() => begin(draft(w.id))} />
              <span>
                <b>{w.title}</b>
                <span className="meta">{w.words}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {d.where === "provider" && (
        <div className="field">
          <label className="label" htmlFor={`${id}-provider`}>
            The provider
          </label>
          <div className="input">
            <select id={`${id}-provider`} value={d.preset} disabled={busy} onChange={(e) => begin(withPreset(d, e.target.value))}>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor={`${id}-address`}>
          Its address
        </label>
        <div className="input mono">
          <input id={`${id}-address`} value={d.baseUrl} inputMode="url" spellCheck={false} autoComplete="off" disabled={busy} onChange={(e) => edit({ baseUrl: e.target.value })} />
        </div>
        <span className="meta">{addressHint(d)}</span>
      </div>

      {d.where !== "provider" && (
        <label className="check-row">
          <input type="checkbox" checked={d.keyed} disabled={busy} onChange={(e) => edit({ keyed: e.target.checked, key: "" })} />
          It needs a key
        </label>
      )}
      {asksKey(d) && (
        <div className="field">
          <label className="label" htmlFor={`${id}-key`}>
            {d.where === "provider" ? "Your key for it" : "Its key"}
          </label>
          <div className="input mono">
            <input id={`${id}-key`} type="password" autoComplete="off" value={d.key} disabled={busy} onChange={(e) => edit({ key: e.target.value })} />
          </div>
          <span className="meta">Kvasir keeps it sealed, and never shows it again.</span>
        </div>
      )}

      <div className="field">
        <span className="label">The model</span>
        <div className="field-row">
          <button type="button" className="button secondary small" disabled={cannotFind !== null || busy} onClick={find}>
            Find its models
          </button>
          {cannotFind ? <span className="meta">{cannotFind}</span> : !found && <span className="meta">Kvasir asks the server which models it serves.</span>}
        </div>
        {findRound === round && <Acted acting={finding.acting} />}
        {found &&
          (picking ? (
            <div className="field-row">
              <div className="input mono">
                <select aria-label="The model" value={d.model} disabled={busy} onChange={(e) => edit({ model: e.target.value })}>
                  {(listed ?? []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="button quiet small" disabled={busy} onClick={() => setTyping(true)}>
                Type a name
              </button>
            </div>
          ) : (
            <div className="input mono">
              <input aria-label="The name the server knows the model by" value={d.model} spellCheck={false} autoComplete="off" disabled={busy} onChange={(e) => edit({ model: e.target.value })} />
            </div>
          ))}
      </div>

      {found && (
        <div className="fields2">
          <div className="field">
            <label className="label" htmlFor={`${id}-window`}>
              Context window
            </label>
            <div className="input">
              <input id={`${id}-window`} inputMode="numeric" value={d.contextWindow} disabled={busy} onChange={(e) => edit({ contextWindow: e.target.value })} />
            </div>
            <span className="meta">the tokens it reads at most</span>
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-longest`}>
              Longest answer
            </label>
            <div className="input">
              <input id={`${id}-longest`} inputMode="numeric" value={d.maxTokens} disabled={busy} onChange={(e) => edit({ maxTokens: e.target.value })} />
            </div>
            <span className="meta">the tokens it writes at most</span>
          </div>
        </div>
      )}

      {localityOf(d.where) === "local" && (
        <div className="note">
          <Icon name="shield" />
          <div className="note-body">
            <p className="note-detail">{CHECKED_FIRST}</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
