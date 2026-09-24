// SPDX-License-Identifier: AGPL-3.0-only
// The Kvasir page (Wave 4c sections 8.3 to 8.6, records 23 to 25), as the
// chosen design draws it. Where each station goes leads: a line a station,
// from its name and what it carries to the box of the model it goes to, where
// that runs and whether its prompts leave; for a person with Kvasir: Work the
// box opens the drawer that moves it, and a provider just added names the
// stations it does not answer yet. Under it the models as cards: those Kvasir
// holds, checked, keyed and removed with Kvasir: Work; the models Kvasir
// downloads, with their progress and what may be done with them; and the
// person's own ChatGPT subscription where they may use the assistant and see
// Kvasir, or the install's where nobody signs in. One Add a model offers what
// the person may add, and one line holds the machine, where downloads go and
// the Hugging Face token. A model server (record 47) is one card whose
// models are removed one by one, and its models are listed again to tick more.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { may } from "../grants";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { AddModel, type HeldServer } from "./AddModel";
import { BackendCard, ModelServerCard } from "./cards";
import { ClosedStations } from "./ClosedStations";
import { Acted, Head, Health, messageOf, useActing, type Acting } from "./common";
import { answersWords, checkWords, gatewayHealth, listWords, plainly, removalWords, routes, subscribedStations, viewerOf, type CatalogueModel } from "./gateway";
import { backendsKept } from "./kept";
import { kvasir, RUNTIME_BACKEND, type AdmissionRecord, type Backend, type PurposeRow, type Subscription } from "./kvasir";
import { localOrder, servedAdmission, started } from "./local";
import { LocalModelCard, MachineLine, useLocalModels } from "./LocalModels";
import { addChoices, backendCards, serverCards, type ModelCard } from "./models";
import { modelRemovalWords } from "./modelserver";
import { MoveDrawer, StationRoutes } from "./Stations";
import { SubscriptionCard } from "./SubscriptionCard";
import type { Install } from "./supervise";

/** What an act said, unless it ended with nothing to say. */
function Said({ acting }: { acting: Acting }) {
  return acting.kind === "done" && acting.words === "" ? null : <Acted acting={acting} />;
}

/** Admissions still settling: the page reads Kvasir again until they do. */
const SETTLING = new Set(["being checked", "being added", "warming"]);

export function GatewayPage({ caps, install }: { caps: Capabilities; install: Install | null }) {
  const [backends, setBackends] = useState<Backend[] | null>(null);
  const [purposes, setPurposes] = useState<PurposeRow[] | null>(null);
  const [admissions, setAdmissions] = useState<AdmissionRecord[] | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [moving, setMoving] = useState<PurposeRow | null>(null);
  // the provider a move starts on, where it opened from the stations a provider does not answer, and the provider just added
  const [toward, setToward] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Backend | null>(null);
  const [letting, setLetting] = useState<{ backend: Backend; model: string } | null>(null);
  const [more, setMore] = useState<HeldServer | null>(null);
  const [keying, setKeying] = useState<Backend | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const acting = useActing();
  const catalogue = (caps.kvasir?.["models"] as CatalogueModel[] | undefined) ?? [];
  const version = (caps.kvasir?.["kvasir"] as { version?: string } | undefined)?.version ?? null;
  const own = subscriptions?.find((s) => s.provider === "chatgpt") ?? null;
  const viewer = viewerOf(caps, own);

  const load = () => {
    setNow(Date.now());
    kvasir
      .backends()
      .then((b) => {
        setBackends(b.backends);
        backendsKept.put(b.backends);
        setWhy(null);
      })
      .catch((e: unknown) => setWhy(messageOf(plainly(e))));
    kvasir
      .purposes()
      .then((p) => setPurposes(p.purposes))
      .catch(() => setPurposes(null));
    kvasir
      .admission(100)
      .then((a) => setAdmissions(a.records))
      .catch(() => setAdmissions(null));
  };

  const local = useLocalModels({ enabled: viewer.work, onRun: load, onSaid: setSaid });

  useEffect(() => {
    load();
    // the subscription's card follows its own sign-in once it is drawn
    kvasir
      .subscriptions()
      .then((s) => setSubscriptions(s?.subscriptions ?? null))
      .catch(() => setSubscriptions(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once when the page opens; what is done on it reads again
  }, []);

  const lines = purposes && backends ? routes(purposes, backends, { viewer, admissions, subscription: own }) : null;
  const locals = local.status ? localOrder(local.status.models) : [];
  const served = locals.map((m) => (m.run ? servedAdmission(m.run, backends, admissions, now) : null));
  const drawn = locals.filter(started).map((m) => m.run?.model ?? "");
  const cards = backends ? backendCards(backends, { viewer, catalogue, admissions, purposes, now, checking, drawn }) : [];
  const servers = backends ? serverCards(backends, { viewer, catalogue, admissions, purposes, now, checking }) : [];

  // a model added in the last hour, or loaded on llama.cpp, is read again until its admission settles
  const settling =
    cards.some((c) => checking !== c.backend.id && SETTLING.has(c.tag.words)) ||
    servers.some((c) => checking !== c.backend.id && c.models.some((m) => SETTLING.has(m.tag.words))) ||
    served.some((a) => a !== null && SETTLING.has(a.words));
  useEffect(() => {
    if (!settling) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only sets what it read
  }, [settling]);

  const runCheck = (b: Backend) => {
    setSaid(null);
    setChecking(b.id);
    acting.act(`checking ${listWords(b.models)} with the admission suite`, async () => {
      try {
        const found = checkWords((await kvasir.admit(b.id)).records);
        if (!found.passed) throw new Error(found.words);
        return found.words;
      } catch (e) {
        throw plainly(e);
      } finally {
        setChecking(null);
        load();
      }
    });
  };

  const forget = (b: Backend) => {
    setSaid(null);
    acting.act(`forgetting the key for ${b.id}`, async () => {
      try {
        await kvasir.forget(b.id);
      } catch (e) {
        throw plainly(e);
      }
      load();
      return `Kvasir no longer holds a key for ${b.id}.`;
    });
  };

  const health = backends ? gatewayHealth(backends) : null;
  const stations = subscribedStations(purposes, backends);
  const provider = opened && backends ? (backends.find((b) => b.id === opened && b.locality === "remote" && b.builtin !== true) ?? null) : null;
  // a person's own subscription is theirs to sign in with the assistant and Kvasir: See; the install's is on the page where nobody signs in
  const mine = own && (own.for === "system" || viewer.subscribes) ? own : null;
  const choices = addChoices(viewer, { local: local.status, subscription: own });
  const runtime = local.status?.runtime ?? null;
  const onMachine = backends?.find((b) => b.id === RUNTIME_BACKEND) ?? null;
  const change = (s: Subscription) => setSubscriptions((all) => (all ?? []).map((x) => (x.provider === s.provider ? s : x)));
  const subscription = mine && <SubscriptionCard key="subscription" row={mine} stations={stations} follow={!adding} onChange={change} />;
  const anything = cards.length > 0 || servers.length > 0 || locals.length > 0;
  const backendCard = (c: ModelCard) => (
    <BackendCard
      key={c.key}
      card={c}
      work={viewer.work}
      busy={acting.working}
      onCheck={() => runCheck(c.backend)}
      onKey={() => {
        setSaid(null);
        setKeying(c.backend);
      }}
      onForget={() => forget(c.backend)}
      onRemove={() => {
        setSaid(null);
        setRemoving(c.backend);
      }}
    />
  );

  return (
    <div className="settings">
      <Head
        title="Kvasir"
        under={may(caps, "install:see")}
        lede="Which model each station goes to."
      >
        {health && <Health tone={health.tone} words={health.words} />}
        {viewer.work && <span className="meta">{[health?.streams, version ? `version ${version}` : null].filter(Boolean).join(" · ")}</span>}
      </Head>
      {why && <p className="warn">{why}</p>}

      {lines && purposes && (
        <section className="stack roomy">
          <div className="section-head rule-top">
            <h2>Where each station goes</h2>
          </div>
          {viewer.work && provider && (
            <ClosedStations
              provider={provider}
              purposes={purposes}
              onChange={(p) => {
                setToward(provider.id);
                setMoving(p);
              }}
            />
          )}
          {lines.length > 0 ? (
            <StationRoutes
              routes={lines}
              onChange={
                viewer.work
                  ? (p) => {
                      setToward(null);
                      setMoving(p);
                    }
                  : undefined
              }
            />
          ) : (
            <p className="meta">No station yet.</p>
          )}
          <div className="note gated">
            <Icon name="lock" />
            <div className="note-body">
              <p className="note-detail">Identifiers never leave; rows leave only with a written reason.</p>
            </div>
          </div>
        </section>
      )}

      <section className="stack roomy">
        <div className="section-head rule-top">
          <h2>Models</h2>
          {choices.length > 0 && (
            <button
              type="button"
              className="button small"
              onClick={() => {
                setSaid(null);
                setOpened(null);
                setAdding(true);
              }}
            >
              <Icon name="plus" />
              Add a model
            </button>
          )}
        </div>
        {said && <p className="ok-words">{said}</p>}
        {local.status && local.missed && <p className="warn">{`Could not read the downloads again: ${local.missed}`}</p>}
        {(anything || subscription) && (
          <div className="mgrid">
            {!viewer.work && subscription}
            {locals.map((m, i) => (
              <LocalModelCard
                key={`local-${m.id}`}
                model={m}
                busy={local.working}
                runtime={runtime !== null}
                admission={served[i]}
                answers={answersWords(RUNTIME_BACKEND, purposes)}
                onPause={() => local.pause(m)}
                onResume={() => local.resume(m)}
                onRemove={() => local.remove(m)}
                onStart={() => local.start(m)}
                onStop={() => local.stop(m)}
                onCheck={onMachine ? () => runCheck(onMachine) : undefined}
              />
            ))}
            {cards.filter((c) => c.kind === "runtime").map(backendCard)}
            {servers.map((c) => (
              <ModelServerCard
                key={c.key}
                card={c}
                work={viewer.work}
                busy={acting.working}
                onCheck={() => runCheck(c.backend)}
                onMore={() => {
                  setSaid(null);
                  setMore({ url: c.backend.base_url ?? "", backend: c.backend.id });
                }}
                onKey={() => {
                  setSaid(null);
                  setKeying(c.backend);
                }}
                onRemoveModel={(model) => {
                  setSaid(null);
                  setLetting({ backend: c.backend, model });
                }}
                onRemove={() => {
                  setSaid(null);
                  setRemoving(c.backend);
                }}
              />
            ))}
            {cards.filter((c) => c.kind !== "runtime").map(backendCard)}
            {viewer.work && subscription}
          </div>
        )}
        {backends !== null && !anything && <p className="meta">No model yet.</p>}
        <Said acting={acting.acting} />
        <Said acting={local.acting} />
        {viewer.work && local.status && <MachineLine install={install} status={local.status} onLocate={local.locate} onToken={local.token} />}
      </section>

      {adding && (
        <AddModel
          choices={choices}
          local={local.status ?? null}
          install={install}
          subscription={own}
          stations={stations}
          onClose={() => setAdding(false)}
          onDone={(words, added) => {
            setAdding(false);
            setSaid(words);
            // a provider added answers no station until one is moved there, which the stations offer
            setOpened(added.locality === "remote" ? added.id : null);
            load();
          }}
          onQueued={(m) => {
            setAdding(false);
            local.queued(m);
          }}
          onSubscription={change}
          onToken={local.tokenSet}
        />
      )}
      {more && (
        <AddModel
          choices={["server"]}
          server={more}
          onClose={() => setMore(null)}
          onDone={(words) => {
            setMore(null);
            setSaid(words);
            load();
          }}
        />
      )}
      {letting && (
        <RemoveModelDialog
          backend={letting.backend}
          model={letting.model}
          purposes={purposes}
          onClose={() => setLetting(null)}
          onDone={(words) => {
            setLetting(null);
            setSaid(words);
            load();
          }}
        />
      )}
      {removing && backends && (
        <RemoveDialog
          backend={removing}
          backends={backends}
          purposes={purposes}
          onClose={() => setRemoving(null)}
          onDone={(words) => {
            setRemoving(null);
            setOpened(null);
            setSaid(words);
            load();
          }}
        />
      )}
      {keying && (
        <KeyDialog
          backend={keying}
          onClose={() => setKeying(null)}
          onDone={(words) => {
            setKeying(null);
            setSaid(words);
            load();
          }}
        />
      )}
      {moving && backends && (
        <MoveDrawer
          purpose={moving}
          backends={backends}
          system={viewer.system}
          now={lines?.find((l) => l.purpose.purpose === moving.purpose)?.to ?? null}
          toward={toward}
          onClose={() => setMoving(null)}
          onDone={() => {
            setMoving(null);
            load();
          }}
        />
      )}
      {local.dialogs}
    </div>
  );
}

/** A provider's key, stored or replaced: Kvasir keeps it under the backend's id, and never shows it. */
function KeyDialog({ backend, onClose, onDone }: { backend: Backend; onClose: () => void; onDone: (words: string) => void }) {
  const [secret, setSecret] = useState("");
  const saving = useActing();
  // record 47: a model server's key is the server's, not one model's
  const named = backend.server === true ? backend.id : (backend.models[0] ?? backend.id);
  const short = secret.length < 8;
  const store = () =>
    saving.act(`storing the key for ${named}`, async () => {
      try {
        await kvasir.credential(backend.id, secret);
      } catch (e) {
        throw plainly(e);
      }
      onDone(`The key for ${named} is stored, and shown to nobody.`);
      return "";
    });

  const foot = (
    <>
      <Said acting={saving.acting} />
      <div className="row actions">
        <button type="button" className="button" disabled={short || saving.working} onClick={store}>
          Store it
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return (
    <Dialog title={backend.credential === true ? `Replace the key for ${named}` : `The key for ${named}`} icon="key" onClose={onClose} foot={foot}>
      <div className="field">
        <label className="label" htmlFor="provider-key">
          Its key
        </label>
        <div className="input mono">
          <input id="provider-key" type="password" autoComplete="off" value={secret} disabled={saving.working} onChange={(e) => setSecret(e.target.value)} />
        </div>
        <span className="meta">Sealed; never shown again.</span>
      </div>
    </Dialog>
  );
}

/** A backend removed, once the dialog has said what goes with it. */
function RemoveDialog(props: { backend: Backend; backends: Backend[]; purposes: PurposeRow[] | null; onClose: () => void; onDone: (words: string) => void }) {
  const { backend, backends, purposes, onClose, onDone } = props;
  const removing = useActing();
  const named = listWords(backend.models) || backend.id;
  const many = backend.models.length > 1;
  const remove = () =>
    removing.act(`removing ${named}`, async () => {
      try {
        await kvasir.remove(backend.id);
      } catch (e) {
        throw plainly(e);
      }
      onDone(`${named} ${many ? "are" : "is"} removed from Kvasir.`);
      return "";
    });

  const foot = (
    <>
      <Said acting={removing.acting} />
      <div className="row actions">
        <button type="button" className="button" disabled={removing.working} onClick={remove}>
          {many ? "Remove them" : "Remove it"}
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return (
    <Dialog title={`Remove ${named}?`} icon="alert" onClose={onClose} foot={foot}>
      {removalWords(backend, backends, purposes).map((w) => (
        <p key={w}>{w}</p>
      ))}
    </Dialog>
  );
}

/** Record 47: one model of a server let go, once the dialog has said what goes with it; the last lets the server go. */
function RemoveModelDialog(props: { backend: Backend; model: string; purposes: PurposeRow[] | null; onClose: () => void; onDone: (words: string) => void }) {
  const { backend, model, purposes, onClose, onDone } = props;
  const removing = useActing();
  const remove = () =>
    removing.act(`removing ${model}`, async () => {
      try {
        await kvasir.removeModel(backend.id, model);
      } catch (e) {
        throw plainly(e);
      }
      onDone(`${model} is removed from ${backend.id}.`);
      return "";
    });

  const foot = (
    <>
      <Said acting={removing.acting} />
      <div className="row actions">
        <button type="button" className="button" disabled={removing.working} onClick={remove}>
          Remove it
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return (
    <Dialog title={`Remove ${model}?`} icon="alert" onClose={onClose} foot={foot}>
      {modelRemovalWords(backend, model, purposes).map((w) => (
        <p key={w}>{w}</p>
      ))}
    </Dialog>
  );
}
