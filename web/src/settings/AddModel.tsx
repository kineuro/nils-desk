// SPDX-License-Identifier: AGPL-3.0-only
// Add a model (records 23 and 25), the one dialog on the Kvasir page. It asks
// first where the model comes from, offering only what the person may add:
// downloading it to this machine, a model server of yours and a provider need
// Kvasir: Work, and a ChatGPT subscription of one's own needs the assistant
// with Kvasir: See (on a desk that signs nobody in, it is the install's). A
// server or a provider is added once one short request to the model chosen
// answered for exactly what the dialog shows; Kvasir asks the model again
// before it holds it, and says what each model said when one did not answer.

import { useId, useState } from "react";
import type React from "react";
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
  withPreset,
  type Draft,
  type Tested,
} from "./adding";
import { MarkSquare } from "./cards";
import { Acted, useActing } from "./common";
import { useDownload } from "./DownloadModel";
import { cardsOf, plainly } from "./gateway";
import { kvasir, type LocalModel, type LocalStatus, type Locality, type Subscription, triedOf } from "./kvasir";
import { choiceWords, type Choice } from "./models";
import { useSignInPart } from "./SubscriptionCard";
import type { Install } from "./supervise";

/** What an add held: the backend's id, where its prompts go, and its models. */
export interface Added {
  id: string;
  locality: Locality;
  models: string[];
}

/** Said under the address of a model server of yours, which may be on this machine or another. */
export const SERVER_HINT = "Its address as Kvasir reaches it, most often ending in /v1: this machine's server at its port, or another machine's address on your network.";

/** A model server of yours or a provider: its address and key, the models it lists, a test of the one chosen, and the add. */
function useServer(where: "here" | "provider", props: { onClose: () => void; onDone: (words: string, added: Added) => void }): { body: React.ReactNode; foot: React.ReactNode; busy: boolean } {
  const { onClose, onDone } = props;
  const id = useId();
  const [d, setD] = useState<Draft>(() => draft(where));
  /** What the server lists: undefined until asked, null where it lists nothing it can say. */
  const [listed, setListed] = useState<string[] | null | undefined>(undefined);
  const [typing, setTyping] = useState(false);
  const [tested, setTested] = useState<Tested | null>(null);
  const [refused, setRefused] = useState<string[]>([]);
  // what was said for another provider is not said again once one is chosen
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
  // another provider starts the form again from there
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
      try {
        const r = await kvasir.test(description(d, false));
        const names = r.listed ?? null;
        setListed(names);
        if (names && names.length > 0) {
          setTyping(false);
          setD((x) => ({ ...x, model: pickFrom(names, x.model) }));
        }
        return listedWords(names);
      } catch (e) {
        throw plainly(e);
      }
    });
  };

  const test = () => {
    const asked = d;
    setWorkRound(round);
    working.act(`sending ${asked.model.trim()} one short request`, async () => {
      setRefused([]);
      try {
        const r = await kvasir.test(description(asked, true));
        const model = r.models.find((m) => m.id === asked.model.trim()) ?? r.models[0];
        if (!model) throw new Error("Kvasir answered without a word about the model.");
        setTested({ print: fingerprint(asked), model });
        return "";
      } catch (e) {
        throw plainly(e);
      }
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
        if (!models) throw plainly(e);
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

  const body = (
    <>
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
        <span className="meta">{d.where === "provider" ? addressHint(d) : SERVER_HINT}</span>
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
    </>
  );

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

  return { body, foot, busy };
}

/**
 * The dialog. `choices` are what this person may add, the first chosen as it
 * opens; `local` and `install` feed the download, `subscription` and
 * `stations` the sign-in. A server or provider added calls `onDone`, a
 * download queued `onQueued`, a subscription changed `onSubscription`, and a
 * Hugging Face token set in the download `onToken`.
 */
export function AddModel(props: {
  choices: Choice[];
  local?: LocalStatus | null;
  install?: Install | null;
  subscription?: Subscription | null;
  stations?: string[];
  onClose: () => void;
  onDone: (words: string, added: Added) => void;
  onQueued?: (m: LocalModel) => void;
  onSubscription?: (s: Subscription) => void;
  onToken?: (set: boolean) => void;
}) {
  const { choices, local = null, install = null, subscription = null, stations = [], onClose, onDone, onQueued, onSubscription, onToken } = props;
  const id = useId();
  const [choice, setChoice] = useState<Choice | null>(choices[0] ?? null);
  const server = useServer("here", { onClose, onDone });
  const provider = useServer("provider", { onClose, onDone });
  const download = useDownload({
    token: local?.token ?? false,
    free: local?.free_bytes ?? null,
    cards: cardsOf(install),
    advice: install?.machine.advice ?? [],
    onClose,
    onDone: (m) => onQueued?.(m),
    onToken: (set) => onToken?.(set),
  });
  const signing = useSignInPart({ row: subscription, stations, follow: choice === "subscription", onChange: onSubscription, onClose });
  const part = choice === "download" ? download : choice === "server" ? server : choice === "provider" ? provider : choice === "subscription" ? signing : null;
  const busy = server.busy || provider.busy || download.busy || signing.busy;

  const foot = part?.foot ?? (
    <div className="row actions">
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
    </div>
  );

  return (
    <Dialog title="Add a model" icon="gateway" onClose={onClose} foot={foot}>
      <fieldset className="field plain-set">
        <legend className="label">Where it comes from</legend>
        <div className="choices">
          {choices.map((c) => {
            const w = choiceWords(c, { local, subscription });
            return (
              <label key={c} className={choice === c ? "pick on" : "pick"}>
                <MarkSquare mark={w.mark} />
                <b>{w.title}</b>
                <input type="radio" name={`${id}-from`} checked={choice === c} disabled={busy} onChange={() => setChoice(c)} />
                <span className="meta">{w.words}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {part?.body}
    </Dialog>
  );
}
