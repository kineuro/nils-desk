// SPDX-License-Identifier: AGPL-3.0-only
// Add a model (records 23 and 25), the one dialog on the Kvasir page. It asks
// first where the model comes from, offering only what the person may add:
// downloading it to this machine, a model server of yours and a provider need
// Kvasir: Work, and a ChatGPT subscription of one's own needs the assistant
// with Kvasir: See (on a desk that signs nobody in, it is the install's). A
// server or a provider is added once one short request to the model chosen
// answered for exactly what the dialog shows; Kvasir asks the model again
// before it holds it, and says what each model said when one did not answer.
// A model server (record 47) is asked for its list through Kvasir: its key is
// sealed there first and only named after (R4), every model shows its specs
// and whether it is loaded, and the ticked ones are admitted one by one, each
// with the result Kvasir reports.

import { useEffect, useId, useRef, useState } from "react";
import type React from "react";
import { Dialog } from "../ui/Dialog";
import {
  addable,
  addedWords,
  asksKey,
  description,
  draft,
  findRefusal,
  fingerprint,
  listedWords,
  localityOf,
  pickFrom,
  plainAddress,
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
import { cardsOf, listWords, plainly } from "./gateway";
import { KvasirError, kvasir, type LocalModel, type LocalStatus, type Locality, type Offer, type Subscription, type Ticked, triedOf } from "./kvasir";
import { choiceWords, type Choice } from "./models";
import { admittedWords, coldWords, listRefusal, resultTag, specWords, stageName, statusTag, tickable } from "./modelserver";
import { useSignInPart } from "./SubscriptionCard";
import type { Install } from "./supervise";

/** What an add held: the backend's id, where its prompts go, and its models. */
export interface Added {
  id: string;
  locality: Locality;
  models: string[];
}

/** Said under the address of a model server of yours, which may be on this machine or another. */
export const SERVER_HINT = "Most often ends in /v1.";

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
        {(d.where !== "provider" || d.preset === "other") && <span className="meta">{SERVER_HINT}</span>}
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
          <span className="meta">Sealed; never shown again.</span>
        </div>
      )}

      <div className="field">
        <span className="label">The model</span>
        <div className="field-row">
          <button type="button" className="button secondary small" disabled={cannotFind !== null || busy} onClick={find}>
            Find its models
          </button>
          {cannotFind && <span className="meta">{cannotFind}</span>}
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

      {localityOf(d.where) === "local" && <span className="meta">Checked with the admission suite before use.</span>}
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
      {stale(d, tested) && <p className="meta">Changed since the test; test it again.</p>}
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

/** A tag as the page draws it, with its detail as a hover title. */
function Tag({ tag }: { tag: { tone: string; words: string; title?: string | null } }) {
  return (
    <span className={tag.tone === "neutral" ? "tag" : `tag ${tag.tone}`} title={tag.title ?? undefined}>
      {tag.words}
    </span>
  );
}

/** Record 47: a server's models as Kvasir listed them, each with its specs and where it stands, ticked or not, and its result once admitted. */
export function ServerOffer(props: { offer: Offer; ticked: string[]; results: Ticked[] | null; busy?: boolean; onTick?: (model: string, on: boolean) => void }) {
  const { offer, ticked, results, busy = false, onTick } = props;
  return (
    <div className="found">
      {offer.models.length === 0 && <p className="meta">It lists no model.</p>}
      {offer.models.map((m) => {
        const held = !tickable(m);
        const on = ticked.includes(m.id);
        const result = results?.find((r) => r.id === m.id) ?? null;
        const status = statusTag(m.status);
        const meta = [m.default ? "default" : null, m.aliases.length > 0 ? `also ${m.aliases.join(", ")}` : null, specWords(m) || "no specs given"].filter(Boolean).join(" · ");
        return (
          <label key={m.id} className={on ? "file-row on" : "file-row"}>
            <input type="checkbox" aria-label={`Tick ${m.id}`} checked={on || held} disabled={busy || held || result?.answered === true} onChange={(e) => onTick?.(m.id, e.target.checked)} />
            <span className="local-name">
              <span className="path">{m.id}</span>
              <span className="meta">{meta}</span>
            </span>
            <span className="row">
              {status && <Tag tag={status} />}
              {held && !result && <Tag tag={{ tone: "neutral", words: `on ${m.held_by}` }} />}
              {result && <Tag tag={resultTag(result)} />}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** Where the dialog opens for a server Kvasir holds already: its address, and its backend, whose sealed key is named. */
export interface HeldServer {
  url: string;
  backend: string;
}

/**
 * Record 47: a model server by its address and key. The key goes to Kvasir's
 * credential door under a name made for this add and leaves the dialog at
 * once; Kvasir lists the server's models with it, admits the ticked ones on one
 * backend and moves the key under that backend. A key sealed for an add that
 * held nothing is forgotten when the dialog closes.
 */
function useModelServer(props: { from?: HeldServer | null; onClose: () => void; onDone: (words: string, added: Added) => void }): { body: React.ReactNode; foot: React.ReactNode; busy: boolean } {
  const { from = null, onClose, onDone } = props;
  const id = useId();
  const [url, setUrl] = useState(from?.url ?? "");
  const [key, setKey] = useState("");
  // the name the key typed here is sealed under; Kvasir takes it over once a model is held
  const [stage, setStage] = useState<string | null>(null);
  const staged = useRef<string | null>(null);
  // the sealed key the listing worked with, named by reference; null for a server that takes none
  const [ref, setRef] = useState<string | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const [results, setResults] = useState<Ticked[] | null>(null);
  const [held, setHeld] = useState<Added | null>(null);
  const listing = useActing();
  const admitting = useActing();
  const busy = listing.working || admitting.working;

  const restage = (name: string | null) => {
    staged.current = name;
    setStage(name);
  };
  // a key sealed for this add and never taken over goes with the dialog
  useEffect(
    () => () => {
      if (staged.current) void kvasir.forget(staged.current).catch(() => undefined);
    },
    [],
  );

  const address = plainAddress(url);
  const shortKey = key.trim().length > 0 && key.trim().length < 8;
  const cannotList = listRefusal(url) ?? (shortKey ? "a key has 8 characters or more" : null);

  const list = () => {
    listing.act("asking Kvasir for the server's models", async () => {
      try {
        let named = ref ?? stage ?? from?.backend ?? null;
        if (key.trim()) {
          const name = stageName();
          await kvasir.credential(name, key.trim());
          if (stage) void kvasir.forget(stage).catch(() => undefined);
          restage(name);
          setKey("");
          named = name;
        }
        let o: Offer;
        try {
          o = await kvasir.offered(address, named);
        } catch (e) {
          // a server Kvasir holds without a key has none sealed under its backend
          if (!(named !== null && named === from?.backend && e instanceof KvasirError && e.status === 404)) throw e;
          named = null;
          o = await kvasir.offered(address, null);
        }
        setRef(named);
        setOffer(o);
        setTicked([]);
        setResults(null);
        const n = o.models.length;
        return [n === 1 ? "It lists one model." : `It lists ${n.toLocaleString("en-GB")} models.`, o.note].filter(Boolean).join(" ");
      } catch (e) {
        throw plainly(e);
      }
    });
  };

  const admit = () => {
    const models = ticked;
    const cold = offer ? coldWords(offer, models) : null;
    admitting.act(`admitting ${listWords(models)}${cold ? "; a cold model loads first, which takes minutes" : ""}`, async () => {
      try {
        const r = await kvasir.admitServer({ url: offer?.url ?? address, models, ...(ref ? { key_ref: ref } : {}) });
        // each model keeps the last result Kvasir reported for it
        const all = [...(results ?? []).filter((x) => !r.results.some((y) => y.id === x.id)), ...r.results];
        setResults(all);
        setTicked([]);
        // Kvasir sealed the key under the backend, and let the staged name go
        if (r.backend) {
          restage(null);
          if (ref !== null) setRef(r.backend.id);
          setHeld({ id: r.backend.id, locality: "local", models: r.backend.models });
        }
        return admittedWords(r.backend?.id ?? null, all);
      } catch (e) {
        throw plainly(e);
      }
    });
  };

  const tick = (model: string, on: boolean) => setTicked((t) => (on ? [...t.filter((x) => x !== model), model] : t.filter((x) => x !== model)));
  const cold = offer ? coldWords(offer, ticked) : null;

  const body = (
    <>
      <div className="field">
        <label className="label" htmlFor={`${id}-url`}>
          Its address
        </label>
        <div className="input mono">
          <input
            id={`${id}-url`}
            value={url}
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            disabled={busy || from !== null}
            onChange={(e) => {
              setUrl(e.target.value);
              setOffer(null);
              setResults(null);
            }}
          />
        </div>
        <span className="meta">{SERVER_HINT}</span>
      </div>
      <div className="field">
        <label className="label" htmlFor={`${id}-key`}>
          Its key
        </label>
        <div className="input mono">
          <input id={`${id}-key`} type="password" autoComplete="off" value={key} disabled={busy} onChange={(e) => setKey(e.target.value)} />
        </div>
        <span className="meta">{ref ? "Sealed in Kvasir. Type another to replace it." : from ? "Kvasir uses the key it holds. Type one to replace it." : "Optional. Sealed in Kvasir; the desk keeps nothing."}</span>
      </div>
      <div className="field">
        <span className="label">Its models</span>
        <div className="field-row">
          <button type="button" className="button secondary small" disabled={cannotList !== null || busy} onClick={list}>
            List its models
          </button>
          {cannotList && <span className="meta">{cannotList}</span>}
        </div>
        <Acted acting={listing.acting} />
        {offer && <ServerOffer offer={offer} ticked={ticked} results={results} busy={busy} onTick={tick} />}
      </div>
      {offer && <span className="meta">Each ticked model answers one question, then the admission suite.</span>}
    </>
  );

  const foot = (
    <>
      {cold && <p className="warn">{cold}</p>}
      <Acted acting={admitting.acting} />
      <div className="row actions">
        {held ? (
          <button type="button" className="button" disabled={busy} onClick={() => onDone(admittedWords(held.id, results ?? []), held)}>
            Done
          </button>
        ) : null}
        <button type="button" className={held ? "button secondary" : "button"} disabled={!offer || ticked.length === 0 || busy} onClick={admit}>
          {ticked.length > 1 ? `Admit ${ticked.length}` : "Admit"}
        </button>
        {!held && (
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
        )}
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
  /** Record 47: a server Kvasir holds, whose models are listed again to tick more. */
  server?: HeldServer | null;
  onClose: () => void;
  onDone: (words: string, added: Added) => void;
  onQueued?: (m: LocalModel) => void;
  onSubscription?: (s: Subscription) => void;
  onToken?: (set: boolean) => void;
}) {
  const { choices, local = null, install = null, subscription = null, stations = [], server: from = null, onClose, onDone, onQueued, onSubscription, onToken } = props;
  const id = useId();
  const [choice, setChoice] = useState<Choice | null>(choices[0] ?? null);
  const listed = useModelServer({ from, onClose, onDone });
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
  const part = choice === "download" ? download : choice === "modelserver" ? listed : choice === "server" ? server : choice === "provider" ? provider : choice === "subscription" ? signing : null;
  const busy = listed.busy || server.busy || provider.busy || download.busy || signing.busy;

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
