// SPDX-License-Identifier: AGPL-3.0-only
// Settings > Participation (Wave 7b step 5, the site participation design of
// 2026-11-01), in five parts down the page: how the site stands (off by
// default: nothing leaves this install), Take part (the site's name, the
// receiver, the key file on the engine's machine, the two tiers as switches
// and auto for counts), Preview (the file as tables of its counts, the raw
// JSON under a fold: this is the file, nothing else leaves), Send (the digest
// and the receiver first, then the receipt or the error, the sends under it)
// and, with the sealed read on, its card: Draw, Read, Settle, Close, Preview
// and Send, each enabled once the one before is done, each saying in one
// line what it does. Every door and every shape is participation.ts's.

import { useCallback, useEffect, useId, useState } from "react";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { href } from "../routes";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { Acted, Head, Health, messageOf, useActing } from "./common";
import {
  campaignHref,
  changeOf,
  changeRefusal,
  defaultSeed,
  done as doneOf,
  DRAW_COUNT,
  keepSealed,
  keptSealed,
  type KeptSealed,
  mayChange,
  mayDrive,
  nextStep,
  on,
  participation,
  type Path,
  pathOf,
  PATHS,
  pct,
  type Preview,
  printWords,
  type RaterRun,
  raterOf,
  readCampaignOf,
  readDoneOf,
  runWords,
  type SealedState,
  startable,
  sealedDraw,
  sections,
  type Send,
  sendWords,
  settleRefusal,
  SHARE,
  shortDigest,
  type Status,
  statusWords,
  stepsFor,
  takesPart,
  TOKEN_PUSH_MS,
  type Tier,
  TIER_WORDS,
  TIERS,
  type Draw,
} from "./participation";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; status: Status; sends: Send[]; draws: Draw[] };

export function ParticipationPage({ caps }: { caps: Capabilities }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const drives = mayDrive(caps);
  const read = useCallback(() => {
    Promise.all([participation.status(), participation.sends().catch(() => [] as Send[])]).then(
      async ([status, sends]) => {
        const draws = drives && on(status, 3) ? await participation.draws().catch(() => [] as Draw[]) : [];
        setLoad({ kind: "ready", status, sends, draws });
      },
      (e: unknown) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: messageOf(e) })),
    );
  }, [drives]);
  useEffect(read, [read]);
  if (load.kind === "loading") return <Wait phase="reading how the site takes part" since={load.since} size="panel" />;
  if (load.kind === "failed")
    return (
      <div className="settings">
        <Head title="Participation" lede="What this site shares, as a file it reads first." />
        <p className="warn">The engine did not say how the site takes part: {load.why}</p>
      </div>
    );
  return <ParticipationView caps={caps} status={load.status} sends={load.sends} draws={load.draws} onChanged={read} />;
}

/** The page as it draws what it read; the tests draw it from fixtures. */
export function ParticipationView({ caps, status, sends, draws, onChanged, now = new Date() }: { caps: Capabilities; status: Status; sends: Send[]; draws: Draw[]; onChanged: () => void; now?: Date }) {
  const part = takesPart(status);
  return (
    <div className="settings participation">
      <Head title="Participation" lede="What this site shares, as a file it reads first.">
        <Health tone={part ? "ok" : "neutral"} words={part ? "taking part" : "off"} />
      </Head>
      <StatusCard status={status} now={now} />
      <TakePart caps={caps} status={status} onChanged={onChanged} />
      {on(status, 1) && <TierBlock tier={1} status={status} sends={sends} now={now} onChanged={onChanged} />}
      {on(status, 3) && <SealedRead caps={caps} status={status} sends={sends} draws={draws} now={now} onChanged={onChanged} />}
    </div>
  );
}

function StatusCard({ status, now }: { status: Status; now: Date }) {
  const part = takesPart(status);
  return (
    <section className="panel card" aria-label="how the site takes part">
      <h2>{statusWords(status)}</h2>
      {part && (
        <dl className="facts">
          <dt>site</dt>
          <dd>{status.site ?? "unnamed"}</dd>
          <dt>shares</dt>
          <dd>{TIERS.filter((t) => on(status, t)).map((t) => TIER_WORDS[t].shares).join(", ")}</dd>
          <dt>receiver</dt>
          <dd>
            <span className="path">{status.receiver ?? "none"}</span>
            {status.receiver_reachable === false && <span className="warn"> · did not answer</span>}
            {status.receiver_reachable === true && <span className="meta"> · answers</span>}
          </dd>
          <dt>key</dt>
          <dd>
            <span className="path">{printWords(status.key_fingerprint ?? null)}</span>
          </dd>
          {TIERS.filter((t) => on(status, t)).map((t) => (
            <LastSend key={t} tier={t} send={status.last_send?.[String(t)] ?? null} now={now} />
          ))}
          {on(status, 3) && (
            <>
              <dt>rater</dt>
              <dd>{status.assistant_rater_door === false ? <span className="warn">the assistant&apos;s rater door did not answer</span> : status.assistant_rater_door === true ? "the assistant answers" : "not probed"}</dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}

function LastSend({ tier, send, now }: { tier: Tier; send: Send | null; now: Date }) {
  return (
    <>
      <dt>last {TIER_WORDS[tier].shares}</dt>
      <dd>
        {send ? `${whenWords(send.sent_at, now)}: ` : ""}
        {sendWords(send)}
      </dd>
    </>
  );
}

function TakePart({ caps, status, onChanged }: { caps: Capabilities; status: Status; onChanged: () => void }) {
  const ids = useId();
  const may = mayChange(caps);
  const [site, setSite] = useState(status.site ?? "");
  const [receiver, setReceiver] = useState(status.receiver ?? "");
  const [keyFile, setKeyFile] = useState(status.key_file ?? "");
  const [tiers, setTiers] = useState<Tier[]>(TIERS.filter((t) => on(status, t)));
  const [auto, setAuto] = useState(status.auto ?? false);
  const act = useActing();
  const draft = { site, receiver, keyFile, tiers, auto };
  const refused = changeRefusal(draft);
  const change = changeOf(status, draft);
  const tick = (t: Tier, checked: boolean) => setTiers((was) => (checked ? [...was.filter((x) => x !== t), t].sort() : was.filter((x) => x !== t)));
  const save = () =>
    act.act("changing what the site shares", async () => {
      if (!change) return "Nothing changed.";
      await participation.change(change);
      onChanged();
      return tiers.length === 0 ? "The site takes part in nothing. Nothing leaves this install." : `The site shares ${tiers.map((t) => TIER_WORDS[t].shares).join(" and ")}.`;
    });
  return (
    <section className="panel card" aria-label="take part">
      <h2>Take part</h2>
      <div className="fields3">
        <div className="field">
          <label className="label" htmlFor={`${ids}-site`}>
            Site
          </label>
          <div className="input">
            <input id={`${ids}-site`} value={site} placeholder="the registry's first 8 characters" disabled={!may} onChange={(e) => setSite(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-receiver`}>
            Receiver
          </label>
          <div className="input mono">
            <input id={`${ids}-receiver`} value={receiver} placeholder="https://participation.example.org" spellCheck={false} disabled={!may} onChange={(e) => setReceiver(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${ids}-key`}>
            Key file <Hint text="A path on the engine's machine, as the model server's key file is given. The key is read at each send and never stored in the registry." />
          </label>
          <div className="input mono">
            <input id={`${ids}-key`} value={keyFile} placeholder="/etc/nils/participation.key" spellCheck={false} disabled={!may} onChange={(e) => setKeyFile(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="stack roomy">
        {TIERS.map((t) => (
          <div key={t} className="stack">
            <label className="check-row">
              <input type="checkbox" checked={tiers.includes(t)} disabled={!may} onChange={(e) => tick(t, e.target.checked)} />
              <span>
                <b>{TIER_WORDS[t].name}</b> <span className="meta">{TIER_WORDS[t].line}</span>
              </span>
            </label>
            {t === 1 && tiers.includes(1) && (
              <label className="check-row auto-row">
                <input type="checkbox" checked={auto} disabled={!may} onChange={(e) => setAuto(e.target.checked)} />
                <span>
                  Send counts by itself <span className="meta">once a day at most, after a person previewed once</span>
                </span>
              </label>
            )}
          </div>
        ))}
      </div>
      {tiers.includes(3) && (
        <div className="note">
          <Icon name="gateway" />
          <div className="note-body">
            <p className="note-lead">
              The sealed read&apos;s model-first path uses the model server of <a href={href("settings", "language-models")}>Settings &gt; Stations</a>.
            </p>
          </div>
        </div>
      )}
      <div className="row actions">
        {refused && <span className="warn">{refused}</span>}
        <span className="grow" />
        {may ? (
          <button type="button" className="button" disabled={refused !== null || change === null || act.working} onClick={save}>
            {takesPart(status) ? "Save" : "Take part"}
          </button>
        ) : (
          <span className="meta">An administrator decides what the site shares.</span>
        )}
      </div>
      <Acted acting={act.acting} />
    </section>
  );
}

/** The preview of one tier's file: tables of its counts, the raw JSON under a fold. */
function PreviewBlock({ preview }: { preview: Preview }) {
  return (
    <div className="stack roomy preview">
      <p className="note-lead">This is the file. Nothing else leaves.</p>
      {sections(preview.document).map((s) => (
        <div key={s.name} className="stack">
          <h3>{s.name}</h3>
          <div className="table-wrap">
            <table className="thin">
              <tbody>
                {s.rows.map(([label, value]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="num">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <details className="card-files">
        <summary>The raw JSON</summary>
        <pre className="raw">{JSON.stringify(preview.document, null, 2)}</pre>
      </details>
    </div>
  );
}

/** Preview and Send of one tier (counts here; the sealed read's card drives tier 3 with its draw). */
function TierBlock({ tier, status, sends, now, onChanged }: { tier: Tier; status: Status; sends: Send[]; now: Date; onChanged: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sent, setSent] = useState<Send | null>(null);
  const look = useActing();
  const send = useActing();
  const [confirm, setConfirm] = useState(false);
  const show = () =>
    look.act(`writing the ${TIER_WORDS[tier].shares} file`, async () => {
      const p = await participation.preview(tier);
      setPreview(p);
      setSent(null);
      setConfirm(false);
      return "Previewed. Read it before it leaves.";
    });
  const post = () =>
    send.act(`sending the ${TIER_WORDS[tier].shares} file`, async () => {
      const r = await participation.send(tier);
      setSent(r);
      setConfirm(false);
      onChanged();
      if (r.error) throw new Error(r.error);
      return `Sent. The receiver's receipt is ${r.receipt ?? "missing"}.`;
    });
  const mine = sends.filter((s) => s.tier === tier);
  return (
    <section className="panel card" aria-label={`${TIER_WORDS[tier].shares}: preview and send`}>
      <div className="row card-head">
        <h2>{TIER_WORDS[tier].name}</h2>
        <span className="grow" />
        <button type="button" className="button secondary" disabled={look.working} onClick={show}>
          Preview
        </button>
        <button type="button" className="button" disabled={preview === null || send.working || confirm} onClick={() => setConfirm(true)}>
          Send
        </button>
      </div>
      <Acted acting={look.acting} />
      {preview && <PreviewBlock preview={preview} />}
      {confirm && preview && (
        <div className="note brand" role="group" aria-label="what the send posts">
          <Icon name="upload" />
          <div className="note-body">
            <p className="note-lead">
              File <span className="path">{shortDigest(preview.digest)}</span> goes to <span className="path">{status.receiver}</span>.
            </p>
            <div className="row actions">
              <button type="button" className="button small" disabled={send.working} onClick={post}>
                Send it
              </button>
              <button type="button" className="button secondary small" onClick={() => setConfirm(false)}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
      <Acted acting={send.acting} />
      {sent?.receipt && (
        <p className="ok-words">
          receipt <span className="path">{sent.receipt}</span>
        </p>
      )}
      <SendsList sends={mine} now={now} />
    </section>
  );
}

function SendsList({ sends, now }: { sends: Send[]; now: Date }) {
  if (sends.length === 0) return <p className="meta">Nothing sent yet.</p>;
  return (
    <div className="table-wrap">
      <table className="thin">
        <thead>
          <tr>
            <th>Sent</th>
            <th>By</th>
            <th>Digest</th>
            <th>Bytes</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {sends.map((s) => (
            <tr key={s.id}>
              <td>{whenWords(s.sent_at, now)}</td>
              <td>{s.sent_by ?? ""}</td>
              <td>
                <span className="path">{s.digest.slice(0, 16)}</span>
              </td>
              <td className="num">{s.bytes.toLocaleString("en-GB")}</td>
              <td className={s.error ? "warn" : undefined}>{sendWords(s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The sealed read's card: the draw and its steps, each enabled once the one before is done. */
function SealedRead({ caps, status, sends, draws, now, onChanged }: { caps: Capabilities; status: Status; sends: Send[]; draws: Draw[]; now: Date; onChanged: () => void }) {
  const ids = useId();
  const drives = mayDrive(caps);
  const me = raterOf(caps);
  const draw = sealedDraw(draws);
  const [kept, setKept] = useState<KeptSealed | null>(() => (draw ? keptSealed(draw.id) : null));
  const [chosen, setChosen] = useState<Path>(status.assistant_rater_door === false ? "people" : "model-first");
  const [count, setCount] = useState(String(DRAW_COUNT));
  const [seed, setSeed] = useState(() => defaultSeed(status.site ?? null, now));
  const [run, setRun] = useState<RaterRun | null>(null);
  const [items, setItems] = useState<Partial<Record<string, number>> | null>(null);
  const [closedStatus, setClosedStatus] = useState<string | null>(null);
  const [settled, setSettled] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState(false);
  const act = useActing();
  const path = pathOf(draw, kept, chosen);
  const ratersCampaign = readCampaignOf(draw, path);
  // the settle is the model-first path's; the people path's verify campaign is made at the draw
  const settleCampaign = path === "model-first" ? (draw?.campaigns?.settle ?? settled) : null;
  // the campaign the close step closes: the verify campaign on the model-first path, the one the people read on the people path
  const toClose = path === "people" ? ratersCampaign : settleCampaign;
  const rater = raterOf(caps);
  const sent = sends.find((s) => s.tier === 3 && draw !== null && s.draw === draw.id && s.receipt !== null) ?? null;
  const keep = (k: KeptSealed) => {
    if (draw) keepSealed(draw.id, k);
    setKept(k);
  };

  // the campaigns' counts: whether every drawn stack is read, and whether the campaign to close is closed
  useEffect(() => {
    let alive = true;
    if (ratersCampaign !== null)
      participation
        .campaign(ratersCampaign)
        .then((c) => alive && setItems(c.counts?.items ?? {}))
        .catch(() => undefined);
    if (toClose !== null)
      participation
        .campaign(toClose)
        .then((c) => alive && setClosedStatus(c.status))
        .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ratersCampaign, toClose]);

  // the rater run kept for this draw, followed while it runs, and its conversation kept in a fresh token of the person's
  const runId = run?.run ?? kept?.run?.id ?? null;
  const conversation = run?.conversation ?? kept?.run?.conversation ?? null;
  const runDone = run?.done ?? false;
  useEffect(() => {
    if (!runId || runDone) return;
    let alive = true;
    const look = () =>
      participation
        .rater(runId)
        .then((r) => alive && setRun(r))
        .catch(() => undefined);
    look();
    const t = setInterval(look, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [runId, runDone]);
  useEffect(() => {
    if (!conversation || runDone) return;
    const push = () => participation.freshen(conversation).catch(() => undefined);
    push();
    const t = setInterval(push, TOKEN_PUSH_MS);
    return () => clearInterval(t);
  }, [conversation, runDone]);

  const state: SealedState = {
    draw,
    path,
    ratersCampaign,
    readDone: readDoneOf(items ? { id: ratersCampaign ?? 0, status: "open", counts: { items } } : null, run),
    settleCampaign,
    closed: closedStatus === "closed",
    previewed: preview !== null,
    sent,
  };
  const done = doneOf(state);
  const next = nextStep(state);
  const cannotSettle = settleRefusal(state, kept?.run?.rater ?? null, me);

  const drawIt = () =>
    act.act("drawing the sealed read", async () => {
      const n = Number(count);
      if (!Number.isInteger(n) || n < 1) throw new Error("the count is a whole number of stacks");
      if (!seed.trim()) throw new Error("the draw has a seed");
      const body = chosen === "model-first" ? { count: n, seed: seed.trim(), raters: [rater] } : { count: n, seed: seed.trim(), readers: [], double_read_share: SHARE };
      const r = await participation.draw(body);
      keepSealed(r.draw.id, { path: chosen });
      setKept({ path: chosen });
      onChanged();
      return `Drew ${r.draw.drawn.toLocaleString("en-GB")} stacks; the blind campaign is ${r.campaign.name}.`;
    });
  const startRead = () =>
    act.act("starting the rater", async () => {
      if (ratersCampaign === null) throw new Error("the draw has no campaign");
      const r = await participation.startRater(ratersCampaign);
      keep({ path, run: { id: r.run, conversation: r.conversation, rater: r.principal } });
      setRun(r);
      return `The rater reads campaign ${ratersCampaign} as ${r.principal}.`;
    });
  const settleIt = () =>
    act.act("opening the settle", async () => {
      const r = await participation.settle(draw!.id, { share: SHARE });
      setSettled(r.settle.campaign?.id ?? null);
      onChanged();
      return r.settle.campaign ? `${r.settle.items.toLocaleString("en-GB")} items to settle: ${r.settle.differences.toLocaleString("en-GB")} differences and ${r.settle.agreements_settled.toLocaleString("en-GB")} of the agreements.` : (r.settle.note ?? "Nothing is left to settle.");
    });
  const closeIt = () =>
    act.act("closing the campaign", async () => {
      if (toClose === null) throw new Error("there is no campaign to close");
      await participation.close(toClose);
      setClosedStatus("closed");
      return "Closed.";
    });
  const previewIt = () =>
    act.act("writing the sealed read's file", async () => {
      const p = await participation.preview(3, draw!.id);
      setPreview(p);
      setConfirm(false);
      return "Previewed. Read it before it leaves.";
    });
  const sendIt = () =>
    act.act("sending the sealed read's file", async () => {
      const r = await participation.send(3, draw!.id);
      setConfirm(false);
      onChanged();
      if (r.error) throw new Error(r.error);
      return `Sent. The receiver's receipt is ${r.receipt ?? "missing"}.`;
    });

  const n = (x: number | null | undefined) => (typeof x === "number" ? x.toLocaleString("en-GB") : "");
  const pathSwitch = (
    <div className="row actions" role="radiogroup" aria-label="the path">
      {(Object.keys(PATHS) as Path[]).map((p) => (
        <label key={p} className="check-row">
          <input type="radio" name={`${ids}-path`} checked={chosen === p} onChange={() => setChosen(p)} disabled={p === "model-first" && status.assistant_rater_door === false} />
          <span>{PATHS[p].words}</span>
        </label>
      ))}
    </div>
  );
  return (
    <section className="panel card sealed" aria-label="the sealed read">
      <div className="row card-head">
        <h2>A sealed read</h2>
        {draw && (
          <span className="meta">
            draw {draw.id}: {n(draw.drawn)} stacks, seed {draw.seed}
          </span>
        )}
        <span className="grow" />
        <span className="tag">{PATHS[path].words}</span>
        <span className="tag">share {pct(SHARE)}</span>
      </div>
      <p className="meta">{PATHS[path].line}</p>
      {!drives && <p className="meta">Drawing and settling are review and campaign work.</p>}
      {draw && !kept && !draw.campaigns && (
        <div className="row actions">
          <span className="meta">This browser does not know the draw&apos;s path:</span>
          {pathSwitch}
        </div>
      )}
      <div className="steps-list">
        {stepsFor(path).map((step, i) => (
          <div key={step.id} className={`step${next === step.id ? " open" : ""}`}>
            <span className={`stepno ${done[step.id] ? "done" : next === step.id ? "now" : ""}`}>{done[step.id] ? <Icon name="check" /> : i + 1}</span>
            <div className="step-body">
              <b>{step.title}</b>
              <span className="meta">{step.does}</span>
              {step.id === "draw" && !draw && drives && (
                <div className="step-form">
                  <div className="fields3">
                    <div className="field">
                      <label className="label" htmlFor={`${ids}-count`}>
                        Count
                      </label>
                      <div className="input">
                        <input id={`${ids}-count`} inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
                      </div>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor={`${ids}-seed`}>
                        Seed
                      </label>
                      <div className="input mono">
                        <input id={`${ids}-seed`} value={seed} spellCheck={false} onChange={(e) => setSeed(e.target.value)} />
                      </div>
                    </div>
                    <div className="field">
                      <span className="label">Path</span>
                      {pathSwitch}
                    </div>
                  </div>
                  <span className="meta">{PATHS[chosen].line}</span>
                </div>
              )}
              {step.id === "read" && draw && (
                <span className="meta">
                  {path === "model-first" ? `rater ${kept?.run?.rater ?? rater}: ${runWords(run)}` : `by your people; ${pct(SHARE)} of the stacks read by two`}
                  {ratersCampaign !== null && (
                    <>
                      {" · "}
                      <a href={campaignHref(ratersCampaign)}>{path === "model-first" ? "the blind campaign" : "the verify campaign"}</a>
                    </>
                  )}
                </span>
              )}
              {step.id === "settle" && settleCampaign !== null && (
                <span className="meta">
                  <a href={campaignHref(settleCampaign)}>the verify campaign</a>
                  {closedStatus ? ` · ${closedStatus}` : ""}
                </span>
              )}
              {step.id === "settle" && cannotSettle && <span className="warn">{cannotSettle}</span>}
              {step.id === "preview" && preview && <PreviewBlock preview={preview} />}
              {step.id === "send" && confirm && preview && draw && (
                <p className="note-lead">
                  File <span className="path">{shortDigest(preview.digest)}</span> goes to <span className="path">{status.receiver}</span>.
                </p>
              )}
              {step.id === "send" && sent && (
                <span className="ok-words">
                  receipt <span className="path">{sent.receipt}</span>
                </span>
              )}
            </div>
            <div className="row actions">
              {drives && step.id === "draw" && !draw && (
                <button type="button" className="button small" disabled={act.working} onClick={drawIt}>
                  Draw
                </button>
              )}
              {step.id === "read" && path === "model-first" && next === "read" && startable(run) && (runId === null || run !== null) && (
                <button type="button" className="button small" disabled={act.working || status.assistant_rater_door === false} onClick={startRead}>
                  Start the rater
                </button>
              )}
              {drives && step.id === "settle" && next === "settle" && (
                <button type="button" className="button small" disabled={act.working || cannotSettle !== null} onClick={settleIt}>
                  Settle
                </button>
              )}
              {drives && step.id === "close" && next === "close" && (
                <button type="button" className="button small" disabled={act.working} onClick={closeIt}>
                  Close
                </button>
              )}
              {step.id === "preview" && next === "preview" && (
                <button type="button" className="button small" disabled={act.working} onClick={previewIt}>
                  Preview
                </button>
              )}
              {step.id === "send" && next === "send" && !confirm && (
                <button type="button" className="button small" disabled={act.working || preview === null} onClick={() => setConfirm(true)}>
                  Send
                </button>
              )}
              {step.id === "send" && next === "send" && confirm && (
                <>
                  <button type="button" className="button small" disabled={act.working} onClick={sendIt}>
                    Send it
                  </button>
                  <button type="button" className="button secondary small" onClick={() => setConfirm(false)}>
                    Not now
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <Acted acting={act.acting} />
    </section>
  );
}
