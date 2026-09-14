// SPDX-License-Identifier: AGPL-3.0-only
// The Kvasir page (Wave 4c sections 8.3 to 8.6, record 23), as the chosen
// design draws it: Kvasir's health, the machine's card and the providers
// with their keys, every model with where its prompts go, its admission and
// the stations it answers, where each station goes, and the install's
// ChatGPT subscription. An admin adds a model through a test, checks one
// with the admission suite and removes one. A station moves to another
// backend at once, recorded with who moved it; rows of the archive leave
// only with an admin's written reason, and identifiers never.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { holds } from "../deployment";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { AddModel } from "./AddModel";
import { Acted, Head, Health, messageOf, useActing } from "./common";
import {
  admissionWords,
  checkWords,
  destinationWords,
  gatewayHealth,
  listWords,
  machineWords,
  modelMeta,
  modelOf,
  purposeLines,
  removalWords,
  shownBackends,
  stationOf,
  targets,
  usedFor,
  whereWords,
  type CatalogueModel,
  type Tone,
} from "./gateway";
import { backendsKept } from "./kept";
import { kvasir, type AdmissionRecord, type Backend, type PurposeRow, type Subscription } from "./kvasir";
import { runtimeName } from "./parts";
import { placeOf } from "./subscription";
import { SubscriptionCard } from "./SubscriptionCard";
import type { Install } from "./supervise";

function Tag({ tone, words }: { tone: Tone; words: string }) {
  return (
    <span className={tone === "neutral" ? "tag" : `tag ${tone}`}>
      {tone === "ok" && <Icon name="check" />}
      {words}
    </span>
  );
}

/** Where a station goes, inside a sentence: a model's name as written, the subscription in lower case. */
function inSentence(b: Backend, system: boolean): string {
  const words = destinationWords(b, system);
  return b.builtin === true ? words.charAt(0).toLowerCase() + words.slice(1) : words;
}

export function GatewayPage({ caps, install }: { caps: Capabilities; install: Install | null }) {
  const [backends, setBackends] = useState<Backend[] | null>(null);
  const [purposes, setPurposes] = useState<PurposeRow[] | null>(null);
  const [admissions, setAdmissions] = useState<AdmissionRecord[] | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [moving, setMoving] = useState<PurposeRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Backend | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const check = useActing();
  const admin = holds(caps, "admin");
  const catalogue = (caps.kvasir?.["models"] as CatalogueModel[] | undefined) ?? [];
  const version = (caps.kvasir?.["kvasir"] as { version?: string } | undefined)?.version ?? null;

  const load = () => {
    setNow(Date.now());
    kvasir
      .backends()
      .then((b) => {
        setBackends(b.backends);
        backendsKept.put(b.backends);
        setWhy(null);
      })
      .catch((e: unknown) => setWhy(messageOf(e)));
    kvasir
      .purposes()
      .then((p) => setPurposes(p.purposes))
      .catch(() => setPurposes(null));
    kvasir
      .admission(100)
      .then((a) => setAdmissions(a.records))
      .catch(() => setAdmissions(null));
  };

  useEffect(() => {
    load();
    // the subscription's card follows its own sign-in once it is drawn
    kvasir
      .subscriptions()
      .then((s) => setSubscriptions(s?.subscriptions ?? null))
      .catch(() => setSubscriptions(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once when the page opens; what is done on it reads again
  }, []);

  const shown = shownBackends(backends ?? []);
  const held = shown.held;
  const rows = held.flatMap((b) =>
    b.models.map((m, i) => {
      const listed = modelOf(b, m, catalogue);
      return { b, m, first: i === 0, listed, admission: admissionWords(m, b, listed, admissions, { now, checking: checking === b.id }) };
    }),
  );

  // a model added in the last hour is read again until its admission settles
  const settling = rows.some((r) => checking !== r.b.id && r.admission.words === "being checked");
  useEffect(() => {
    if (!settling) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only sets what it read
  }, [settling]);

  const runCheck = (b: Backend) => {
    setSaid(null);
    setChecking(b.id);
    check.act(`checking ${listWords(b.models)} with the admission suite`, async () => {
      try {
        const found = checkWords((await kvasir.admit(b.id)).records);
        if (!found.passed) throw new Error(found.words);
        return found.words;
      } finally {
        setChecking(null);
        load();
      }
    });
  };

  const health = backends ? gatewayHealth(backends) : null;
  const machine = machineWords(install);
  const locals = held.filter((b) => b.locality === "local");
  const remotes = held.filter((b) => b.locality === "remote");
  const place = placeOf(subscriptions);
  const system = place.kvasir !== null;
  const toChatgpt = (purposes ?? []).filter((p) => shown.subscriptions.some((b) => b.id === p.backend)).map((p) => stationOf(p.purpose));
  const personal = admin && place.profile !== null;
  const bare = subscriptions === null && shown.subscriptions.length > 0;
  const runtimeOf = (b: Backend) => {
    const newest = (admissions ?? []).filter((r) => r.backend === b.id).sort((x, y) => y.at - x.at)[0];
    return newest ? `${runtimeName(newest.runtime.name)} ${newest.runtime.version}`.trim() : "a model server";
  };
  // a backend's check and removal, on its first model's row: in a column of their own, or under the model on a narrow window
  const actions = (b: Backend) => (
    <>
      {b.locality === "local" && (
        <button type="button" className="button secondary small" disabled={check.working} onClick={() => runCheck(b)}>
          Check
        </button>
      )}
      <button
        type="button"
        className="button quiet small"
        disabled={checking === b.id}
        onClick={() => {
          setSaid(null);
          setRemoving(b);
        }}
      >
        Remove
      </button>
    </>
  );

  return (
    <div className="settings">
      <Head title="Kvasir" under lede="The models the assistant reaches, where each station's prompts go, and the subscriptions people sign in with.">
        {health && <Health tone={health.tone} words={health.words} />}
        <span className="meta">{[health?.streams, version ? `version ${version}` : null].filter(Boolean).join(" · ")}</span>
      </Head>
      {why && <p className="warn">{why}</p>}

      <section className="pair">
        <div className="panel card">
          <div className="row card-head">
            <Icon name="chip" size="lg" />
            <h2>This machine</h2>
          </div>
          {machine.card ? (
            <p>
              <b>{machine.card}</b>
            </p>
          ) : (
            <p className="meta">
              {install
                ? "The supervisor found no card on this machine."
                : !admin
                  ? "The machine's card is shown to an admin, from the supervisor on this host."
                  : caps.desk.settings?.supervisor_url
                    ? "The supervisor on this host did not answer, so the machine's card is not shown."
                    : "This desk reaches no supervisor, so the machine's card is not shown."}
            </p>
          )}
          {machine.advice.length > 0 && <p className="meta">{machine.advice.join(" ")}</p>}
          {locals.length > 0 && (
            <dl className="facts">
              {locals.map((b) => (
                <div key={b.id} className="facts-pair">
                  <dt>{b.id}</dt>
                  <dd>
                    {runtimeOf(b)}, serving <span className="path">{b.models.join(", ")}</span>
                    {b.health.warming === true && <span className="meta">, warming</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="panel card">
          <div className="row card-head">
            <Icon name="cloud" size="lg" />
            <h2>{remotes.length > 1 ? "Providers" : "Provider"}</h2>
          </div>
          {backends !== null && remotes.length === 0 && (
            <p className="meta">{toChatgpt.length > 0 ? "No provider. Only the stations moved to ChatGPT leave your systems." : "No provider: every prompt stays in your systems."}</p>
          )}
          {remotes.map((b) => (
            <div key={b.id} className="provider">
              <p>
                <b>{b.id}</b> <span className="meta">{b.models.join(", ")}</span>
              </p>
              {b.base_url && <p className="meta path">{b.base_url}</p>}
              <p className="meta">{b.credential ? "Its key is kept by Kvasir, readable by nobody else, and never shown." : "Kvasir holds no key for it."}</p>
              {admin && <KeyForm backend={b.id} stored={b.credential === true} onDone={load} />}
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <div className="section-head rule-top">
          <h2>Models</h2>
          {admin ? (
            <button
              type="button"
              className="button small"
              onClick={() => {
                setSaid(null);
                setAdding(true);
              }}
            >
              <Icon name="plus" />
              Add a model
            </button>
          ) : (
            <span className="meta">an admin adds, checks and removes models</span>
          )}
        </div>
        {said && <p className="ok-words">{said}</p>}
        <div className="table-wrap">
          <table className="thin models">
            <thead>
              <tr>
                <th>Model</th>
                <th>Backend</th>
                <th>Where prompts go</th>
                <th>Admission</th>
                <th>Used for</th>
                {admin && (
                  <th className="acts">
                    <span className="sr-only">Check or remove</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ b, m, first, listed, admission }) => (
                <tr key={`${b.id}/${m}`}>
                  <td>
                    <span className="path">{m}</span>
                    {modelMeta(listed, b.locality) && <div className="meta">{modelMeta(listed, b.locality)}</div>}
                    {admin && first && <span className="row-actions under">{actions(b)}</span>}
                  </td>
                  <td>
                    {b.id}
                    <div className="meta">{b.locality === "local" ? runtimeOf(b) : (b.base_url ?? "a provider")}</div>
                  </td>
                  <td>
                    <Tag {...whereWords(b.locality)} />
                  </td>
                  <td>
                    <Tag tone={admission.tone} words={admission.words} />
                    {admission.detail && <div className="meta">{admission.detail}</div>}
                  </td>
                  <td className="meta">{purposes ? usedFor(b, purposes) : ""}</td>
                  {admin && <td className="acts">{first && <span className="row-actions">{actions(b)}</span>}</td>}
                </tr>
              ))}
              {backends !== null && held.length === 0 && (
                <tr>
                  <td colSpan={admin ? 6 : 5} className="meta">
                    {admin ? "Kvasir holds no model yet. Add a model server in your systems, or a provider." : "Kvasir holds no model yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Acted acting={check.acting} />
      </section>

      {purposes && backends && (
        <section className="stack">
          <div className="section-head rule-top">
            <h2>Where each station goes</h2>
            <span className="meta">changes at once, recorded with who and why</span>
          </div>
          <div className="table-wrap">
            <table className="thin">
              <thead>
                <tr>
                  <th>Station</th>
                  <th>Carries</th>
                  <th>Goes to</th>
                  <th className="go">
                    <span className="sr-only">Change</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {purposeLines(purposes, backends, system).map((l) => {
                  const row = purposes.find((p) => p.purpose === l.purpose)!;
                  return (
                    <tr key={l.purpose}>
                      <td>
                        {l.station}
                        <div className="meta">{l.purpose}</div>
                      </td>
                      <td>
                        <span className="tag">{l.carries}</span>
                      </td>
                      <td>
                        {l.goesTo}
                        {l.allowed && <div className="meta">{l.allowed}</div>}
                      </td>
                      <td>
                        {admin && l.movable && (
                          <button type="button" className="button quiet small" onClick={() => setMoving(row)}>
                            Change
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="note gated">
            <Icon name="lock" />
            <div className="note-body">
              <p className="note-detail">Identifiers never leave. Rows of the archive go to a provider or to ChatGPT only after an admin writes down why, for that one purpose.</p>
            </div>
          </div>
        </section>
      )}

      {(place.kvasir || personal || bare) && (
        <section className="stack">
          <div className="section-head rule-top">
            <h2>Subscriptions</h2>
            {toChatgpt.length > 0 && <span className="meta">{`ChatGPT answers ${listWords(toChatgpt)}`}</span>}
          </div>
          {place.kvasir && <SubscriptionCard row={place.kvasir} may={admin} />}
          {personal && (
            <p>
              Each person signs in with their own ChatGPT subscription from their profile, and it serves only their conversations. <a href={href("profile")}>Your profile</a>
            </p>
          )}
          {bare && <p className="meta">ChatGPT answers through each person's own subscription, for the stations moved to it. This Kvasir does not offer signing in to it yet.</p>}
        </section>
      )}

      {adding && (
        <AddModel
          onClose={() => setAdding(false)}
          onDone={(words) => {
            setAdding(false);
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
            setSaid(words);
            load();
          }}
        />
      )}
      {moving && backends && (
        <MoveDrawer
          purpose={moving}
          backends={backends}
          system={system}
          onClose={() => setMoving(null)}
          onDone={() => {
            setMoving(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/** A backend's key: replaced or forgotten, never shown. Kvasir keeps it under the backend's id. */
function KeyForm({ backend, stored, onDone }: { backend: string; stored: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const saving = useActing();
  const short = secret.length < 8;
  return (
    <div className="key-form">
      {open ? (
        <>
          <div className="input mono grow">
            <input type="password" autoComplete="off" aria-label={`The key for ${backend}`} value={secret} onChange={(e) => setSecret(e.target.value)} />
          </div>
          <button
            type="button"
            className="button small"
            disabled={short || saving.working}
            onClick={() =>
              saving.act(`storing the key for ${backend}`, async () => {
                await kvasir.credential(backend, secret);
                setSecret("");
                setOpen(false);
                onDone();
                return `The key for ${backend} is stored, and shown to nobody.`;
              })
            }
          >
            Store it
          </button>
          <button type="button" className="button quiet small" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <button type="button" className="button secondary small" onClick={() => setOpen(true)}>
            {stored ? "Replace the key" : "Store its key"}
          </button>
          {stored && (
            <button
              type="button"
              className="button quiet small"
              disabled={saving.working}
              onClick={() =>
                saving.act(`forgetting the key for ${backend}`, async () => {
                  await kvasir.forget(backend);
                  onDone();
                  return `Kvasir no longer holds a key for ${backend}.`;
                })
              }
            >
              Forget the key
            </button>
          )}
        </>
      )}
      <Acted acting={saving.acting} />
    </div>
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
      await kvasir.remove(backend.id);
      onDone(`${named} ${many ? "are" : "is"} removed from Kvasir.`);
      return "";
    });
  const quiet = removing.acting.kind === "done" && removing.acting.words === "";

  const foot = (
    <>
      {!quiet && <Acted acting={removing.acting} />}
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

/** A purpose moved to another backend: at once where nothing more is needed, with an admin's written reason where rows would leave. */
function MoveDrawer(props: { purpose: PurposeRow; backends: Backend[]; system: boolean; onClose: () => void; onDone: () => void }) {
  const { purpose, backends, system, onClose, onDone } = props;
  const options = targets(purpose, backends);
  const [to, setTo] = useState(options[0]?.backend.id ?? "");
  const [reason, setReason] = useState("");
  const moving = useActing();
  const chosen = options.find((o) => o.backend.id === to) ?? null;
  const needs = chosen?.needs === "an acknowledgement";
  const station = stationOf(purpose.purpose);
  const goesTo = purposeLines([purpose], backends, system)[0].goesTo;

  const move = () =>
    moving.act(`moving ${station}`, async () => {
      await kvasir.setPolicy(purpose.purpose, to, needs ? reason.trim() : null);
      onDone();
      return `${station} goes to ${chosen ? inSentence(chosen.backend, system) : to} now.`;
    });

  const foot = (
    <>
      <Acted acting={moving.acting} />
      <div className="row actions">
        <button type="button" className="button" disabled={!chosen || (needs && reason.trim().length === 0) || moving.working} onClick={move}>
          Move {station}
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return (
    <Dialog title={`Where ${station} goes`} icon="gateway" onClose={onClose} foot={foot}>
      <dl className="facts">
        <dt>purpose</dt>
        <dd>
          <span className="path">{purpose.purpose}</span>
        </dd>
        <dt>carries</dt>
        <dd>{purpose.content === "catalog" ? "the catalogue, never a row" : purpose.content === "rows" ? "rows of the archive" : "identifiers"}</dd>
        <dt>goes to now</dt>
        <dd>{goesTo}</dd>
      </dl>
      <div className="field">
        <span className="label">Move it to</span>
        <div className="choices" role="radiogroup">
          {options.map((o) => (
            <label key={o.backend.id} className="radio-row">
              <input type="radio" name="move-to" checked={to === o.backend.id} disabled={moving.working} onChange={() => setTo(o.backend.id)} />
              <span>
                <span>{destinationWords(o.backend, system)}</span>
                <span className="meta">{o.backend.locality === "local" ? "stays in your systems" : "leaves your systems"}</span>
              </span>
            </label>
          ))}
        </div>
        {chosen?.backend.builtin === true && !system && <span className="meta">A person who has not signed in to ChatGPT gets the default model in your systems instead.</span>}
      </div>
      {needs && (
        <div className="field">
          <label className="label" htmlFor="move-reason">
            Why rows of the archive may leave, for this purpose
          </label>
          <div className="input">
            <textarea id="move-reason" rows={3} value={reason} disabled={moving.working} onChange={(e) => setReason(e.target.value)} />
          </div>
          <span className="meta">Recorded with your name beside the purpose; Kvasir refuses the move without it.</span>
        </div>
      )}
    </Dialog>
  );
}
