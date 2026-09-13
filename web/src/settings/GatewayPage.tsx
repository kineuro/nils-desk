// SPDX-License-Identifier: AGPL-3.0-only
// The Gateway and models page (Wave 4c sections 8.3 to 8.6), as the chosen
// design draws it: the gateway's health, the machine's card and the model
// server on it, a provider and its key, every model with where its prompts
// go and its admission, and what may leave, purpose by purpose. A purpose
// moves to another backend at once, recorded with who moved it; rows of the
// archive leave only with an admin's written reason, and identifiers never.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { holds } from "../deployment";
import { Command } from "../ui/Command";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Acted, Head, Health, messageOf, useActing } from "./common";
import { admissionWords, gatewayHealth, machineWords, modelMeta, purposeLines, stationOf, targets, usedFor, whereWords, type CatalogueModel, type Tone } from "./gateway";
import { kvasir, type AdmissionRecord, type Backend, type PurposeRow } from "./kvasir";
import { runtimeName } from "./parts";
import type { Install } from "./supervise";

function Tag({ tone, words }: { tone: Tone; words: string }) {
  return (
    <span className={tone === "neutral" ? "tag" : `tag ${tone}`}>
      {tone === "ok" && <Icon name="check" />}
      {words}
    </span>
  );
}

export function GatewayPage({ caps, install }: { caps: Capabilities; install: Install | null }) {
  const [backends, setBackends] = useState<Backend[] | null>(null);
  const [purposes, setPurposes] = useState<PurposeRow[] | null>(null);
  const [admissions, setAdmissions] = useState<AdmissionRecord[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [moving, setMoving] = useState<PurposeRow | null>(null);
  const admin = holds(caps, "admin");
  const catalogue = (caps.kvasir?.["models"] as CatalogueModel[] | undefined) ?? [];
  const version = (caps.kvasir?.["kvasir"] as { version?: string } | undefined)?.version ?? null;

  const load = () => {
    kvasir
      .backends()
      .then((b) => {
        setBackends(b.backends);
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

  useEffect(load, []);

  const health = backends ? gatewayHealth(backends) : null;
  const machine = machineWords(install);
  const locals = (backends ?? []).filter((b) => b.locality === "local");
  const remotes = (backends ?? []).filter((b) => b.locality === "remote");
  const runtimeOf = (b: Backend) => {
    const newest = (admissions ?? []).filter((r) => r.backend === b.id).sort((x, y) => y.at - x.at)[0];
    return newest ? `${runtimeName(newest.runtime.name)} ${newest.runtime.version}`.trim() : "a model server";
  };

  return (
    <div className="settings">
      <Head title="Gateway and models" under lede="The models the assistant reaches, and what may leave, purpose by purpose.">
        {health && <Health tone={health.tone} words={health.words} />}
        <span className="meta">{[health?.streams, version ? `Kvasir ${version}` : "Kvasir"].filter(Boolean).join(" · ")}</span>
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
          {backends !== null && remotes.length === 0 && <p className="meta">No provider: every prompt stays in your systems.</p>}
          {remotes.map((b) => (
            <div key={b.id} className="provider">
              <p>
                <b>{b.provider ?? b.id}</b> <span className="meta">{b.models.join(", ")}</span>
              </p>
              <p className="meta">{b.credential ? "Its key is kept by the gateway, readable by nobody else, and never shown." : "No key is stored for it in the gateway."}</p>
              {admin && b.provider && <KeyForm provider={b.provider} stored={b.credential === true} onDone={load} />}
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <div className="section-head rule-top">
          <h2>Models</h2>
          <span className="meta">a model is added where the assistant's model is chosen</span>
          <Command text="nils setup" />
        </div>
        <div className="table-wrap">
          <table className="thin models">
            <thead>
              <tr>
                <th>Model</th>
                <th>Backend</th>
                <th>Where prompts go</th>
                <th>Admission</th>
                <th>Used for</th>
              </tr>
            </thead>
            <tbody>
              {(backends ?? []).flatMap((b) =>
                b.models.map((m) => {
                  const listed = catalogue.find((c) => c.id === m && (c.backend === undefined || c.backend === b.id));
                  return (
                    <tr key={`${b.id}/${m}`}>
                      <td>
                        <span className="path">{m}</span>
                        {modelMeta(listed, b.locality) && <div className="meta">{modelMeta(listed, b.locality)}</div>}
                      </td>
                      <td>
                        {b.id}
                        <div className="meta">{b.locality === "local" ? runtimeOf(b) : (b.provider ?? b.kind)}</div>
                      </td>
                      <td>
                        <Tag {...whereWords(b.locality)} />
                      </td>
                      <td>
                        <Tag {...admissionWords(m, b, listed, admissions)} />
                      </td>
                      <td className="meta">{purposes ? usedFor(b, purposes) : ""}</td>
                    </tr>
                  );
                }),
              )}
              {backends !== null && backends.length === 0 && (
                <tr>
                  <td colSpan={5} className="meta">
                    The gateway has no backend.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {purposes && backends && (
        <section className="stack">
          <div className="section-head rule-top">
            <h2>What may leave, by purpose</h2>
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
                {purposeLines(purposes, backends).map((l) => {
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
              <p className="note-detail">Identifiers never leave. Rows of the archive go to a provider only after an admin writes down why, for that one purpose.</p>
            </div>
          </div>
        </section>
      )}

      {moving && backends && (
        <MoveDrawer
          purpose={moving}
          backends={backends}
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

/** A provider's key: replaced or forgotten, never shown. */
function KeyForm({ provider, stored, onDone }: { provider: string; stored: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState("");
  const saving = useActing();
  const short = secret.length < 8;
  return (
    <div className="key-form">
      {open ? (
        <>
          <div className="input mono grow">
            <input type="password" autoComplete="off" aria-label={`The key for ${provider}`} value={secret} onChange={(e) => setSecret(e.target.value)} />
          </div>
          <button
            type="button"
            className="button small"
            disabled={short || saving.working}
            onClick={() =>
              saving.act(`storing the key for ${provider}`, async () => {
                await kvasir.credential(provider, secret);
                setSecret("");
                setOpen(false);
                onDone();
                return `The key for ${provider} is stored, and shown to nobody.`;
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
                saving.act(`forgetting the key for ${provider}`, async () => {
                  await kvasir.forget(provider);
                  onDone();
                  return `The gateway no longer holds a key for ${provider}.`;
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

/** A purpose moved to another backend: at once where nothing more is needed, with an admin's written reason where rows would leave. */
function MoveDrawer({ purpose, backends, onClose, onDone }: { purpose: PurposeRow; backends: Backend[]; onClose: () => void; onDone: () => void }) {
  const options = targets(purpose, backends);
  const [to, setTo] = useState(options[0]?.backend.id ?? "");
  const [reason, setReason] = useState("");
  const moving = useActing();
  const chosen = options.find((o) => o.backend.id === to) ?? null;
  const needs = chosen?.needs === "an acknowledgement";
  const now = backends.find((b) => b.id === purpose.backend) ?? null;
  const station = stationOf(purpose.purpose);

  const move = () =>
    moving.act(`moving ${station}`, async () => {
      await kvasir.setPolicy(purpose.purpose, to, needs ? reason.trim() : null);
      onDone();
      return `${station} goes to ${chosen?.backend.models[0] ?? to} now.`;
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
        <dd>{now ? `${now.models[0] ?? now.id}, ${now.locality === "local" ? "in your systems" : "a provider"}` : "nowhere yet"}</dd>
      </dl>
      <div className="field">
        <span className="label">Move it to</span>
        <div className="choices" role="radiogroup">
          {options.map((o) => (
            <label key={o.backend.id} className="choice">
              <input type="radio" name="move-to" checked={to === o.backend.id} disabled={moving.working} onChange={() => setTo(o.backend.id)} />
              <span>
                {o.backend.models[0] ?? o.backend.id} <span className="meta">{o.backend.locality === "local" ? "stays in your systems" : "leaves your systems"}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      {needs && (
        <div className="field">
          <label className="label" htmlFor="move-reason">
            Why rows of the archive may leave, for this purpose
          </label>
          <div className="input">
            <textarea id="move-reason" rows={3} value={reason} disabled={moving.working} onChange={(e) => setReason(e.target.value)} />
          </div>
          <span className="meta">Recorded with your name beside the purpose; the gateway refuses the move without it.</span>
        </div>
      )}
    </Dialog>
  );
}
