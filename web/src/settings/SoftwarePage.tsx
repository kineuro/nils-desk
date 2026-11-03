// SPDX-License-Identifier: AGPL-3.0-only
// Settings > Software (record 57 P5, Wave 7b spec 6.7), as an administrator
// reads it without being told: first where tools live, with the one act that
// changes it (a folder of tools the site has already, or back to the
// default under the working place); then one row a tool, not a package,
// since a tool is installed once for every pipeline that pins its image
// (FreeSurfer is one row for seven pipelines). Each row says in plain words
// how the tool stands, with its colour border and the one act it needs
// next: Check again, Accept the terms, Use this copy, Install. The packages
// as the engine lists them, with their kind, check, licence and fingerprint
// and the acts Verify again and Remove or Forget, sit under each row's
// Details. What the folder holds that no pipeline uses is listed under Also
// in the folder, each added under a name read from its image in one click.
// The pre-flight's refusals for software (failed verification, terms not
// accepted) link here.

import { Fragment, useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { DoorError } from "../ask/client";
import { ensurePeople, peopleKept } from "../assistant/shares";
import { door as served } from "../deployment";
import { may as granted } from "../grants";
import { whenWords } from "../data/sources";
import { objects } from "../objects/client";
import { placesKept } from "../objects/kept";
import { software, type PackFrom, type SoftwareFound, type SoftwarePackage, type SoftwarePlace, type SoftwareNeed } from "../ops/client";
import { useInstall } from "../ops/Install";
import { sizeWords } from "../ops/results";
import { shortPrint } from "../ops/text";
import { tools } from "../ops/tools";
import { namer } from "../ops/who";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { Acted, Head, messageOf, Stats, useActing } from "./common";
import { PathField } from "./PathField";
import {
  failedChecks,
  foundWords,
  groupTools,
  inferKind,
  kindWords,
  LICENCE_MAX,
  licenceState,
  needsAmiss,
  packFrom,
  pinnedError,
  pipelinesLine,
  placeCard,
  placeFileCommand,
  readyMeta,
  softwareActs,
  specError,
  statusTag,
  suggestedSpec,
  toolCounts,
  toolState,
  toolTitle,
  unmatched,
  verifiedWords,
  type ToolGroup,
  type ToolState,
  type Tone,
} from "./software";
import type { Install } from "./supervise";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; place: SoftwarePlace };

/** A tool offered in a dialog: its key, its title, and the package an install or an add names. */
export interface Offer {
  key: string;
  title: string;
  p: SoftwarePackage;
  pipelines: number;
}

type Open = { kind: "install"; key: string | null } | { kind: "register"; key: string | null } | { kind: "accept"; p: SoftwarePackage; title: string } | { kind: "remove"; p: SoftwarePackage } | { kind: "place" } | null;

const n = (v: number) => v.toLocaleString("en-US");
const TAG: Record<Tone, string> = { ok: "tag ok", caution: "tag caution", brand: "tag brand", neutral: "tag" };
const PLACE_DOORS = ["GET /api/places", "POST /api/places", "PUT /api/places/{id}"];

export function SoftwarePage({ caps, install = null }: { caps: Capabilities; install?: Install | null }) {
  const [load, setLoad] = useState<Load>(() => ({ kind: "loading", since: Date.now() }));
  const read = useCallback(() => {
    software.list().then(
      (place) => setLoad({ kind: "ready", place }),
      (e: unknown) => setLoad((was) => (was.kind === "ready" ? was : { kind: "failed", why: messageOf(e) })),
    );
  }, []);
  useEffect(read, [read]);
  const people = useKept(peopleKept);
  useEffect(() => ensurePeople(), []);
  if (load.kind === "loading") return <Wait phase="reading where tools live" since={load.since} size="panel" />;
  if (load.kind === "failed")
    return (
      <div className="settings">
        <Head title="Software" lede="The tools pipelines run." />
        <p className="warn">The tools could not be read: {load.why}</p>
      </div>
    );
  return <SoftwareView caps={caps} install={install} place={load.place} people={people.value} onChanged={read} />;
}

/** The offers of the tools that are not ready yet, the converter left out (it installs from its row). */
function offersOf(groups: ToolGroup[], found: SoftwareFound[] | null | undefined, all = false): Offer[] {
  const out: Offer[] = [];
  const later: Offer[] = [];
  for (const g of groups) {
    if (g.converter) continue;
    const s = toolState(g, found);
    const offer = { key: g.key, title: toolTitle(g), p: s.p, pipelines: g.pipelines.length };
    if (s.kind === "missing" || s.kind === "copy") out.push(offer);
    else if (all) later.push(offer);
  }
  return [...out, ...later];
}

/** The page as it draws what it read; the tests draw it from fixtures. */
export function SoftwareView({ caps, place, people = null, onChanged, now = new Date(), install = null }: { caps: Capabilities; place: SoftwarePlace; people?: { subject: string; display: string }[] | null; onChanged: () => void; now?: Date; install?: Install | null }) {
  const acts = softwareActs(caps);
  const readOnly = place.place?.read_only === true;
  const may = readOnly ? { ...acts, install: false, register: false, accept: false, forget: false, remove: false } : acts;
  const mayPlace = acts.see && granted(caps, "install:work") && granted(caps, "places:work") && PLACE_DOORS.every((d) => served(caps, d));
  const browse = install !== null && granted(caps, "install:work");
  const [open, setOpen] = useState<Open>(null);
  const row = useActing();
  const name = namer(caps, people);
  const when = (iso: string) => whenWords(iso, now);
  const groups = groupTools(place.packages);
  const counts = toolCounts(groups, place.found);
  const offers = offersOf(groups, place.found);
  const done = (words: string) => {
    setOpen(null);
    row.say(words);
    onChanged();
    return words;
  };
  const verify = (p: SoftwarePackage) =>
    row.act(`checking ${p.spec} again`, async () => {
      const r = await software.verify(p.app, p.version);
      onChanged();
      return r.verified ? `${p.spec} passed its check.` : `${p.spec} did not pass: ${failedChecks({ verification: r.verification }).map((f) => f.said).join("; ") || "see its details"}.`;
    });
  const checkAgain = (g: ToolGroup) =>
    row.act(`checking ${toolTitle(g)} again`, async () => {
      const said: string[] = [];
      for (const p of g.packages.filter((x) => x.status === "failed verification")) {
        const r = await software.verify(p.app, p.version);
        if (!r.verified) said.push(...failedChecks({ verification: r.verification }).map((f) => f.said));
      }
      onChanged();
      return said.length === 0 ? `${toolTitle(g)} passed its check.` : `${toolTitle(g)} did not pass: ${said.join("; ")}.`;
    });
  // select = register (record 57 P5): the site's copy in the folder is taken for the tool, once, with the catalog pipeline's pack; the engine matches the tool's other pipelines by the image
  const useCopy = (g: ToolGroup, s: ToolState) =>
    row.act(`taking the copy at ${s.copy!.path} for ${toolTitle(g)}`, async () => {
      const r = await registerCopy(s.p, s.copy!);
      onChanged();
      return copyWords(toolTitle(g), s.copy!.path, g.pipelines.length, r.package);
    });
  const update = (g: ToolGroup, p: SoftwarePackage) =>
    row.act(`installing ${toolTitle(g)} ${p.version}`, async () => {
      await tools.install({ tool: p.app, door: p.install?.door ?? "POST /api/software/install", command: p.install?.command ?? null, grant: p.install?.grant ?? null, version: p.version });
      onChanged();
      return `${p.app} ${p.version} is installed.`;
    });
  const rest = unmatched(place.found);
  const tools_ = groups.filter((g) => !g.converter);
  const nothingInstalled = !place.packages.some((p) => p.kind !== "binary" && p.status !== "missing");
  return (
    <div className="settings software">
      <Head title="Software" lede="The tools pipelines run, and whether they are ready.">
        <span className="grow" />
        {may.install && offers.length > 0 && (
          <button type="button" className="button" onClick={() => setOpen({ kind: "install", key: null })}>
            <Icon name="download" />
            Install
          </button>
        )}
        {may.register && (
          <button type="button" className="button secondary" onClick={() => setOpen({ kind: "register", key: null })}>
            Add a tool you already have
          </button>
        )}
      </Head>
      <WhereCard place={place} may={mayPlace} primary={nothingInstalled} onChange={() => setOpen({ kind: "place" })} />
      <Stats
        items={[
          { label: "tools", value: n(counts.tools) },
          { label: "ready", value: n(counts.ready), tone: counts.ready > 0 ? "ok" : undefined },
          ...(counts.look > 0 ? [{ label: "need a look", value: n(counts.look), tone: "caution" as const }] : []),
          ...(place.runtime ? [{ label: "runtime", value: [place.runtime.name, place.runtime.version].filter(Boolean).join(" ") }] : []),
        ]}
      />
      <Acted acting={row.acting} />
      {tools_.length === 0 && <p className="meta">No pipeline pins a tool yet.</p>}
      {groups.length > 0 && (
        <ul className="software-tools" aria-label="Tools">
          {groups.map((g) => (
            <ToolRow
              key={g.key}
              caps={caps}
              g={g}
              found={place.found}
              acts={may}
              name={name}
              when={when}
              busy={row.working}
              onCheck={() => checkAgain(g)}
              onAccept={(p) => setOpen({ kind: "accept", p, title: toolTitle(g) })}
              onInstall={() => setOpen({ kind: "install", key: g.key })}
              onUpdate={(p) => update(g, p)}
              onUseCopy={(s) => useCopy(g, s)}
              onVerify={verify}
              onRemove={(p) => setOpen({ kind: "remove", p })}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
      {rest.length > 0 && <AlsoSection found={rest} errors={place.found_errors ?? 0} register={may.register} busy={row.working} onAdded={(w) => done(w)} />}
      {rest.length === 0 && (place.found_errors ?? 0) > 0 && <p className="meta software-found-errors">{foundErrorsWords(place.found_errors ?? 0)}</p>}
      {open?.kind === "install" && <InstallDialog first={open.key} offered={offers} into={place.place?.writes_into ?? place.place?.path ?? null} onClose={() => setOpen(null)} onDone={(w) => done(w)} />}
      {open?.kind === "register" && <RegisterDialog first={open.key} offered={offersOf(groups, place.found, true)} browse={browse} onClose={() => setOpen(null)} onDone={(w) => done(w)} />}
      {open?.kind === "accept" && <AcceptDialog p={open.p} title={open.title} onClose={() => setOpen(null)} onDone={(w) => done(w)} />}
      {open?.kind === "remove" && <RemoveDialog p={open.p} onClose={() => setOpen(null)} onDone={(w) => done(w)} />}
      {open?.kind === "place" && <PlaceDialog place={place} browse={browse} onClose={() => setOpen(null)} onDone={(w) => done(w)} />}
    </div>
  );
}

/** The words of a copy taken for a tool: its title, the path, the pipelines it serves, and any check that failed. */
function copyWords(title: string, path: string, pipelines: number, p: SoftwarePackage): string {
  const failed = failedChecks(p);
  const base = `${title}: using the copy at ${path} for ${pipelines} ${pipelines === 1 ? "pipeline" : "pipelines"}`;
  return failed.length > 0 ? `${base}; ${failed.map((x) => `${x.check}: ${x.said}`).join("; ")}.` : `${base}.`;
}

/**
 * Where tools live, first on the page, with its one act: the default under the working place offers a folder of
 * tools the site has already, a chosen folder offers another. A shared folder says the one subfolder NILS writes;
 * a read-only one says NILS lists it and cannot install there.
 */
export function WhereCard({ place, may, primary, onChange }: { place: SoftwarePlace; may: boolean; primary: boolean; onChange: () => void }) {
  const card = placeCard(place.place);
  if (!card) return null;
  const tone = card.readOnly ? " caution" : card.kind === "default" ? "" : " ok";
  return (
    <section className={`software-where${tone}`} aria-label="Where tools live">
      <div className="software-where-text">
        {card.kind === "default" ? (
          <p className="software-where-line">
            Tools are installed under the working place <span className="path">{card.path ?? ""}</span>
          </p>
        ) : (
          <p className="software-where-line">
            Tools live in <span className="path">{card.path ?? ""}</span>
            {card.kind === "shared" && <span className="tag">shared folder</span>}
            {card.readOnly && <span className="tag caution">read only</span>}
          </p>
        )}
        {card.kind === "shared" && !card.readOnly && card.into && (
          <p className="meta">
            NILS writes only <span className="path">{card.into}</span>
          </p>
        )}
        {card.readOnly && <p className="meta">NILS lists this folder but cannot install into it.</p>}
        {card.kind === "default" && <p className="meta">Have FreeSurfer or other tools on this machine already? Point NILS at their folder.</p>}
      </div>
      {may && (
        <button type="button" className={card.kind === "default" && primary ? "button" : "button secondary"} onClick={onChange}>
          <Icon name="folder" />
          {card.kind === "default" ? "Use a folder of tools" : "Change folder"}
        </button>
      )}
    </section>
  );
}

const STATE_ACT: Partial<Record<ToolState["kind"], string>> = { failed: "Check again", licence: "Accept the terms", "licence-file": "Add the licence file" };

/** One tool: its name and version, the pipelines that use it, how it stands, its one act, and its packages under Details. */
function ToolRow(props: {
  caps: Capabilities;
  g: ToolGroup;
  found: SoftwareFound[] | null | undefined;
  acts: ReturnType<typeof softwareActs>;
  name: (principal: string) => string;
  when: (iso: string) => string;
  busy: boolean;
  onCheck: () => void;
  onAccept: (p: SoftwarePackage) => void;
  onInstall: () => void;
  onUpdate: (p: SoftwarePackage) => void;
  onUseCopy: (s: ToolState) => void;
  onVerify: (p: SoftwarePackage) => void;
  onRemove: (p: SoftwarePackage) => void;
  onChanged: () => void;
}) {
  const { caps, g, found, acts, name, when, busy, onCheck, onAccept, onInstall, onUpdate, onUseCopy, onVerify, onRemove, onChanged } = props;
  const s = toolState(g, found);
  const title = toolTitle(g);
  const p = s.p;
  // the converter installs as it did from Parts: by its pinned build, or from a file where the engine cannot reach the releases
  const converter = useInstall(caps, g.converter && s.kind === "missing" && p.install?.door ? { tool: p.app, door: p.install.door, command: p.install.command, grant: p.install.grant, version: p.version } : null, null, () => onChanged(), true);
  const failed = s.kind === "failed" ? g.packages.flatMap(failedChecks) : [];
  const meta = s.kind === "ready" ? readyMeta(p, name, when) : s.kind === "copy" ? (s.copy?.path ?? "") : "";
  let act: React.ReactNode = null;
  if ((s.kind === "failed" && acts.verify) || ((s.kind === "licence" || s.kind === "licence-file") && acts.accept)) {
    act = (
      <button type="button" className="button small" disabled={busy} onClick={() => (s.kind === "failed" ? onCheck() : onAccept(p))}>
        {STATE_ACT[s.kind]}
      </button>
    );
  } else if (s.kind === "update" && acts.install && served(caps, p.install?.door ?? "POST /api/software/install")) {
    act = (
      <button type="button" className="button small" disabled={busy} onClick={() => onUpdate(p)}>
        Install {p.version}
      </button>
    );
  } else if (s.kind === "copy" && acts.register) {
    act = (
      <>
        <button type="button" className="button small" disabled={busy} title={s.copy!.path} onClick={() => onUseCopy(s)} aria-label={`Use the copy at ${s.copy!.path} for ${title}`}>
          Use this copy
        </button>
        {acts.install && (
          <button type="button" className="button quiet small" disabled={busy} onClick={onInstall} aria-label={`Install ${title}`}>
            Install
          </button>
        )}
      </>
    );
  } else if (s.kind === "missing") {
    act = g.converter ? (
      converter.button
    ) : acts.install ? (
      <button type="button" className="button secondary small" disabled={busy} onClick={onInstall} aria-label={`Install ${title}`}>
        Install
      </button>
    ) : null;
  }
  return (
    <li className={`software-tool ${s.tone}`}>
      <div className="software-tool-name">
        <b>{title}</b>
        <div className="meta">{pipelinesLine(g)}</div>
      </div>
      <div className="software-tool-state">
        <span>{s.words}</span>
        {meta && <div className={s.kind === "copy" ? "meta path" : "meta"}>{meta}</div>}
      </div>
      <div className="software-tool-act row-acts">{act}</div>
      {(failed.length > 0 || converter.said !== null) && (
        <div className="software-tool-under fail-row">
          {failed.map((f, i) => (
            <p key={`${f.check}${i}`} className="fail-said software-said">
              <span className="req-check">{f.check}</span>
              <span>{f.said}</span>
            </p>
          ))}
          {converter.said}
        </div>
      )}
      <details className="software-tool-details more-fields">
        <summary>Details</summary>
        <div className="table-wrap">
          <table className="thin software-table">
            <thead>
              <tr>
                <th>Package</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Verified</th>
                <th>Licence</th>
                <th>Fingerprint</th>
                <th className="acts" />
              </tr>
            </thead>
            <tbody>
              {g.packages.map((x) => (
                <PackageRow key={x.spec} p={x} acts={acts} name={name} when={when} busy={busy} onVerify={() => onVerify(x)} onRemove={() => onRemove(x)} />
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </li>
  );
}

/** One package as the engine lists it, under a tool's Details: its kind, status, check, licence and fingerprint, and the acts Verify again and Remove or Forget. */
function PackageRow(props: { p: SoftwarePackage; acts: ReturnType<typeof softwareActs>; name: (principal: string) => string; when: (iso: string) => string; busy: boolean; onVerify: () => void; onRemove: () => void }) {
  const { p, acts, name, when, busy, onVerify, onRemove } = props;
  const tag = statusTag(p);
  const ver = verifiedWords(p, when);
  const lic = licenceState(p, name, when);
  const amiss = needsAmiss(p);
  const site = p.managed === false;
  const tone = tag.tone === "caution" || lic.tone === "caution" ? "caution" : tag.tone === "ok" ? "ok" : "neutral";
  return (
    <Fragment>
      <tr className={`software-row ${tone}${amiss.length > 0 ? " has-fail" : ""}`}>
        <td>
          <b className="path">{p.spec}</b>
          {(p.pipelines ?? []).length > 0 && <div className="meta">{(p.pipelines ?? []).join(", ")}</div>}
        </td>
        <td>
          {p.kind ? kindWords(p) : ""}
          {site && (
            <span className="tag software-site" title="the site's own install: NILS reads it and never changes or removes it">
              the site&apos;s
            </span>
          )}
          {p.size_bytes ? <div className="meta">{sizeWords(p.size_bytes)}</div> : null}
        </td>
        <td>
          <span className={TAG[tag.tone]}>{tag.words}</span>
          {tag.note && <div className="meta">{tag.note}</div>}
          {p.at && p.by && <div className="meta">{`${p.how === "registered" ? "registered" : "installed"} by ${name(p.by)}, ${when(p.at)}`}</div>}
        </td>
        <td className={ver.failed ? "warn" : undefined}>{ver.words}</td>
        <td>
          {lic.words && (lic.tone === "caution" ? <span className="tag caution">{lic.words}</span> : <span title={p.licence?.terms?.address ?? undefined}>{lic.words}</span>)}
          {lic.file && !lic.accept && <div className="meta path">{placeFileCommand(p)}</div>}
        </td>
        <td className="path" title={p.fingerprint ?? undefined}>
          {shortPrint(p.fingerprint)}
        </td>
        <td className="acts">
          <span className="row-acts">
            {acts.verify && p.status !== "missing" && p.kind !== "binary" && (
              <button type="button" className="button quiet small" disabled={busy} onClick={onVerify} aria-label={`Verify ${p.spec} again`}>
                Verify again
              </button>
            )}
            {p.status !== "missing" && p.kind !== "binary" && (site ? acts.forget : acts.remove) && (
              <button type="button" className="button quiet small" disabled={busy} onClick={onRemove} aria-label={`${site ? "Forget" : "Remove"} ${p.spec}`}>
                {site ? "Forget" : "Remove"}
              </button>
            )}
          </span>
        </td>
      </tr>
      {amiss.length > 0 && (
        <tr className="fail-row">
          <td colSpan={7}>
            <NeedsList needs={amiss} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** Register a path for a package: with the catalog pipeline's pack (`pack_from`) where it names a pipeline, and without it where the engine says that pipeline has no pack (422). */
export async function registerAt(p: SoftwarePackage, kind: "sif" | "sandbox" | "image", path: string) {
  const from: PackFrom | undefined = packFrom(p);
  if (from === undefined) return software.register({ spec: p.spec, kind, path });
  try {
    return await software.register({ spec: p.spec, kind, path, pack_from: from });
  } catch (e) {
    if (e instanceof DoorError && e.status === 422 && /pack/u.test(e.message)) return software.register({ spec: p.spec, kind, path });
    throw e;
  }
}

/** Register the site's copy in the folder for a package, as `registerAt` does. */
export function registerCopy(p: SoftwarePackage, f: SoftwareFound) {
  return registerAt(p, f.kind === "sandbox" ? "sandbox" : "sif", f.path);
}

/**
 * Also in the folder (record 57 P5): what the folder holds that no pipeline uses, a folder or an image file by its
 * path and the image it was built from. Each is added in one click under `app@version` read from that image, the
 * name editable in place; one added already says so.
 */
export function AlsoSection({ found, errors = 0, register, busy, onAdded }: { found: SoftwareFound[]; errors?: number; register: boolean; busy: boolean; onAdded: (words: string) => void }) {
  return (
    <section className="software-found" aria-label="Also in the folder">
      <h3>Also in the folder</h3>
      <p className="meta">
        Not used by any pipeline. Add one to run it by name.
        {errors > 0 ? ` ${foundErrorsWords(errors)}` : ""}
      </p>
      <ul className="software-found-list">
        {found.map((f) => (
          <FoundRow key={f.path} f={f} register={register} busy={busy} onAdded={onAdded} />
        ))}
      </ul>
    </section>
  );
}

const FOUND_KIND: Record<string, string> = { sif: "image file", sandbox: "sandbox folder" };

/** The entries of the folder the engine could not read, counted. */
function foundErrorsWords(n: number): string {
  return n === 1 ? "1 entry could not be read." : `${n.toLocaleString("en-US")} entries could not be read.`;
}

function FoundRow({ f, register, busy, onAdded }: { f: SoftwareFound; register: boolean; busy: boolean; onAdded: (words: string) => void }) {
  const [spec, setSpec] = useState(() => suggestedSpec(f.base));
  const { work, run, busy: working } = useWork();
  const s = spec.trim();
  const bad = s === "" ? null : specError(s);
  const ready = s !== "" && bad === null && !busy && !working;
  const go = () =>
    run(
      `adding ${s} from ${f.path}`,
      async () => {
        const r = await software.register({ spec: s, kind: f.kind === "sandbox" ? "sandbox" : "sif", path: f.path });
        const failed = failedChecks(r.package);
        return failed.length > 0 ? `Added ${r.package.spec} from ${f.path}; ${failed.map((x) => `${x.check}: ${x.said}`).join("; ")}.` : `Added ${r.package.spec} from ${f.path}; it passed its check.`;
      },
      onAdded,
    );
  return (
    <li className="software-found-row">
      <div>
        <span className="path">{f.path}</span>
        <div className="meta">
          {FOUND_KIND[f.kind] ?? f.kind}
          {f.base ? `, built from ${f.base}` : ""}
        </div>
      </div>
      {f.registered ? (
        <span className="tag ok">added</span>
      ) : register ? (
        <div className="row software-found-register">
          <button type="button" className="button small" disabled={!ready} onClick={go} aria-label={`Add ${f.path} as ${s || "a name"}`}>
            Add as
          </button>
          <span className="input mono">
            <input value={spec} placeholder="app@version" aria-label={`The name for ${f.path}`} disabled={working} onChange={(e) => setSpec(e.target.value)} />
          </span>
          {bad && <span className="warn">{bad}</span>}
          <Working work={work} />
        </div>
      ) : null}
    </li>
  );
}

/** The dependency checks that are not ok, each in the engine's words: its border says missing or a warning. */
function NeedsList({ needs }: { needs: { check: string; state: string; said: string }[] }) {
  return (
    <ul className="requirements" aria-label="what it needs of this machine">
      {needs.map((c, i) => (
        <li key={`${c.check}${i}`} className={c.state === "warn" ? "req warn" : "req not"}>
          <span className="req-check">{c.check}</span>
          <span className="req-said">{c.said}</span>
        </li>
      ))}
    </ul>
  );
}

/** A refusal's words, with the dependency checks it names where it names them. */
function refusalOf(e: unknown): { words: string; needs: { check: string; state: string; said: string }[] } {
  const body = e instanceof DoorError ? (e.body as { needs?: SoftwareNeed[] }) : null;
  return { words: messageOf(e), needs: needsAmiss({ needs: Array.isArray(body?.needs) ? body.needs : [] }) };
}

/** A file read as text, for a pack or a licence. */
function readText(f: File): Promise<string> {
  return typeof f.text === "function"
    ? f.text()
    : new Promise((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result ?? ""));
        r.onerror = () => no(r.error);
        r.readAsText(f);
      });
}

type Work = { kind: "idle" } | { kind: "busy"; phase: string; since: number } | { kind: "failed"; words: string; needs: { check: string; state: string; said: string }[] };

function Working({ work }: { work: Work }) {
  if (work.kind === "busy") return <Wait phase={work.phase} since={work.since} />;
  if (work.kind === "failed")
    return (
      <div className="note caution">
        <Icon name="alert" />
        <div className="note-body">
          <p className="note-lead fail-said">{work.words}</p>
          {work.needs.length > 0 && <NeedsList needs={work.needs} />}
        </div>
      </div>
    );
  return null;
}

function useWork() {
  const [work, setWork] = useState<Work>({ kind: "idle" });
  const run = (phase: string, go: () => Promise<string>, done: (w: string) => void) => {
    setWork({ kind: "busy", phase, since: Date.now() });
    go().then(
      (w) => {
        setWork({ kind: "idle" });
        done(w);
      },
      (e: unknown) => setWork({ kind: "failed", ...refusalOf(e) }),
    );
  };
  return { work, run, busy: work.kind === "busy" };
}

/** The pack file a person may give: the tool's nils-pack.yaml, which names its source, probe, key files, licence and test. */
function PackField({ pack, onPack }: { pack: { name: string; text: string } | null; onPack: (p: { name: string; text: string } | null) => void }) {
  return (
    <div className="field">
      <span className="label">
        Pack <Hint text="The tool's nils-pack.yaml: its image, version probe, key files, licence and test. Leave it out where a pipeline in the catalog pins the tool." />
      </span>
      <span className="input">
        <label className="button secondary small">
          <Icon name="upload" />
          {pack ? pack.name : "Choose a file"}
          <input
            type="file"
            accept=".yaml,.yml,text/yaml"
            hidden
            aria-label="The pack file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void readText(f).then((text) => onPack({ name: f.name, text }));
            }}
          />
        </label>
        {pack && (
          <button type="button" className="button quiet small" onClick={() => onPack(null)}>
            Clear
          </button>
        )}
      </span>
    </div>
  );
}

/** Install by its pinned digest: a tool not ready yet, chosen by its name, or something else by `app@version` with its image and pack under More. */
export function InstallDialog({ first, offered, into, onClose, onDone }: { first: string | null; offered: Offer[]; into: string | null; onClose: () => void; onDone: (words: string) => void }) {
  const [key, setKey] = useState<string>(() => (first !== null && offered.some((o) => o.key === first) ? first : (offered[0]?.key ?? "")));
  const offer = offered.find((o) => o.key === key) ?? null;
  const [spec, setSpec] = useState("");
  const [source, setSource] = useState("");
  const [pack, setPack] = useState<{ name: string; text: string } | null>(null);
  const { work, run, busy } = useWork();
  const asked = offer ? offer.p.spec : spec.trim();
  const bad = offer ? null : (specError(spec) ?? pinnedError(source));
  const ready = asked !== "" && bad === null && !busy;
  const named = offer ? offer.title : asked;
  const go = () =>
    run(
      `fetching ${named} by its pinned digest; one at a time`,
      async () => {
        const r = await software.install({ spec: asked, ...(!offer && source.trim() ? { source: source.trim() } : {}), ...(!offer && pack ? { pack: pack.text } : {}) });
        if (!r.installed) return `${named} is installed already: ${r.why ?? "left as it is"}.`;
        const failed = failedChecks(r.package);
        return failed.length > 0 ? `Installed ${named}; ${failed.map((f) => `${f.check}: ${f.said}`).join("; ")}.` : `Installed ${named}; it passed its check.`;
      },
      onDone,
    );
  return (
    <Dialog
      title="Install a tool"
      icon="download"
      onClose={onClose}
      foot={
        <>
          <Working work={work} />
          <div className="row actions">
            <button type="button" className="button" disabled={!ready} onClick={go}>
              Install
            </button>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      }
    >
      <p className="meta">
        Fetched by its pinned digest into <span className="path">{into ?? "the software place"}</span> and checked.
      </p>
      <div className="field">
        <label className="label" htmlFor="install-tool">
          Tool
        </label>
        <span className="input">
          <select id="install-tool" value={key} aria-label="The tool" onChange={(e) => setKey(e.target.value)}>
            {offered.map((o) => (
              <option key={o.key} value={o.key}>
                {o.title}
              </option>
            ))}
            <option value="">something else…</option>
          </select>
        </span>
      </div>
      {!offer && (
        <details className="more-fields" open>
          <summary>More</summary>
          <div className="field">
            <span className="label">Name</span>
            <span className="input mono">
              <input value={spec} placeholder="app@version" aria-label="The tool's name and version" onChange={(e) => setSpec(e.target.value)} />
            </span>
            {specError(spec) && <span className="warn">{specError(spec)}</span>}
          </div>
          <div className="field">
            <span className="label">
              Image <Hint text="Only where neither a pack nor a pipeline in the catalog names it: the image pinned by its digest." />
            </span>
            <span className="input">
              <input value={source} placeholder="from the pipeline's pack" aria-label="The image, pinned by its digest" onChange={(e) => setSource(e.target.value)} />
            </span>
            {pinnedError(source) && <span className="warn">{pinnedError(source)}</span>}
          </div>
          <PackField pack={pack} onPack={setPack} />
        </details>
      )}
    </Dialog>
  );
}

const KINDS = [
  { kind: "sandbox", words: "Folder" },
  { kind: "sif", words: "Image file (.sif)" },
  { kind: "image", words: "Container image" },
] as const;

/**
 * Add a tool you already have: where it is (a folder, an image file or an image pinned by its digest, the kind read
 * from what is typed and changed with the chips), and the tool it is for. For a tool a pipeline pins, its package is
 * registered with that pipeline's pack, as Use this copy does; something else is named `app@version`. NILS reads it
 * as it is and never changes, moves or removes it.
 */
export function RegisterDialog({ first, offered, browse, onClose, onDone }: { first: string | null; offered: Offer[]; browse: boolean; onClose: () => void; onDone: (words: string) => void }) {
  const [path, setPath] = useState("");
  const [chosen, setChosen] = useState<"sif" | "sandbox" | "image" | null>(null);
  const [key, setKey] = useState<string>(() => (first !== null && offered.some((o) => o.key === first) ? first : (offered[0]?.key ?? "")));
  const offer = offered.find((o) => o.key === key) ?? null;
  const [spec, setSpec] = useState("");
  const [pack, setPack] = useState<{ name: string; text: string } | null>(null);
  const { work, run, busy } = useWork();
  const where = path.trim();
  const kind = chosen ?? inferKind(where);
  const pathBad = where === "" ? null : kind === "image" ? pinnedError(where) : where.startsWith("/") ? null : "a full path, from /";
  const specBad = offer ? null : specError(spec);
  const ready = where !== "" && pathBad === null && (offer !== null || (spec.trim() !== "" && specBad === null)) && !busy;
  const go = () =>
    run(
      `adding ${offer ? offer.title : spec.trim()} and checking it`,
      async () => {
        if (offer) {
          const r = await registerAt(offer.p, kind, where);
          return copyWords(offer.title, where, offer.pipelines, r.package);
        }
        const r = await software.register({ spec: spec.trim(), kind, path: where, ...(pack ? { pack: pack.text } : {}) });
        const failed = failedChecks(r.package);
        return failed.length > 0 ? `Added ${r.package.spec}; ${failed.map((f) => `${f.check}: ${f.said}`).join("; ")}.` : `Added ${r.package.spec}; it passed its check.`;
      },
      onDone,
    );
  return (
    <Dialog
      title="Add a tool you already have"
      icon="folder"
      onClose={onClose}
      foot={
        <>
          <Working work={work} />
          <div className="row actions">
            <button type="button" className="button" disabled={!ready} onClick={go}>
              Add
            </button>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      }
    >
      <p className="meta">NILS reads it as it is and never changes, moves or removes it.</p>
      <div className="field">
        <label className="label" htmlFor="tool-where">
          Where it is
        </label>
        <div className="row path-row">
          <PathField id="tool-where" value={path} placeholder="/srv/tools/freesurfer, a .sif file, or repository@sha256:…" browse={browse} onChange={setPath} label="The path on this machine, or the image" />
        </div>
        <div className="chips" role="group" aria-label="what it is">
          {KINDS.map((k) => (
            <button key={k.kind} type="button" className={kind === k.kind ? "opt on" : "opt"} aria-pressed={kind === k.kind} onClick={() => setChosen(k.kind)}>
              {k.words}
            </button>
          ))}
        </div>
        {pathBad && <span className="warn">{pathBad}</span>}
      </div>
      <div className="field">
        <label className="label" htmlFor="tool-for">
          For
        </label>
        <span className="input">
          <select id="tool-for" value={key} aria-label="The tool it is" onChange={(e) => setKey(e.target.value)}>
            {offered.map((o) => (
              <option key={o.key} value={o.key}>
                {o.title}
              </option>
            ))}
            <option value="">something else</option>
          </select>
        </span>
      </div>
      {!offer && (
        <>
          <div className="field">
            <span className="label">Name</span>
            <span className="input mono">
              <input value={spec} placeholder="app@version" aria-label="The tool's name and version" onChange={(e) => setSpec(e.target.value)} />
            </span>
            {specBad && <span className="warn">{specBad}</span>}
          </div>
          <details className="more-fields">
            <summary>More</summary>
            <PackField pack={pack} onPack={setPack} />
          </details>
        </>
      )}
    </Dialog>
  );
}

/**
 * Where tools live: one folder, chosen by typing or by clicking through this machine's folders. NILS looks in it for
 * tools already there and installs only into its own subfolder. The software place is changed where one is
 * declared and added where none is; Back to the default retires it. The Places page stays the place to do more.
 */
export function PlaceDialog({ place, browse, onClose, onDone }: { place: SoftwarePlace; browse: boolean; onClose: () => void; onDone: (words: string) => void }) {
  const declared = place.place?.declared !== null && place.place?.declared !== undefined;
  const [path, setPath] = useState(declared ? (place.place?.path ?? "") : "");
  const { work, run, busy } = useWork();
  const folder = path.trim().replace(/(.)\/+$/u, "$1");
  const bad = folder === "" ? null : folder.startsWith("/") ? null : "a whole path, from /";
  const ready = folder !== "" && bad === null && !busy && !(declared && folder === place.place?.path);
  const current = async () => (await objects.places()).places.find((p) => p.role === "software" && p.retired_at === null) ?? null;
  const settled = () => void Promise.resolve(placesKept.refresh()).catch(() => undefined);
  const go = () =>
    run(
      `pointing NILS at ${folder}`,
      async () => {
        const was = await current();
        if (was) await objects.placeSet(was.id, { path: folder });
        else await objects.placeAdd({ name: "software", role: "software", path: folder, guarantees: {} });
        settled();
        const now = await software.list();
        return `Tools now live in ${folder}. ${foundWords(now)}`;
      },
      onDone,
    );
  const back = () =>
    run(
      "going back to the default",
      async () => {
        const was = await current();
        if (was) await objects.placeSet(was.id, { retired: true });
        settled();
        const now = await software.list();
        return `Tools are installed under the working place again${now.place?.path ? `, in ${now.place.path}` : ""}.`;
      },
      onDone,
    );
  return (
    <Dialog
      title="Where tools live"
      icon="folder"
      onClose={onClose}
      foot={
        <>
          <Working work={work} />
          {bad && <p className="warn">{bad}</p>}
          <div className="row actions">
            <button type="button" className="button" disabled={!ready} onClick={go}>
              Use this folder
            </button>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            {declared && (
              <>
                <span className="grow" />
                <button type="button" className="button quiet" disabled={busy} onClick={back}>
                  Back to the default
                </button>
              </>
            )}
          </div>
        </>
      }
    >
      <div className="field">
        <label className="label" htmlFor="software-folder">
          Folder
        </label>
        <div className="row path-row">
          <PathField id="software-folder" value={path} placeholder="/srv/tools" disabled={busy} browse={browse} onChange={setPath} onEnter={() => ready && go()} />
        </div>
        <p className="meta">NILS looks up to three levels down for tools already there (Apptainer sandbox folders and .sif files).</p>
        <p className="meta">
          It installs into <span className="path">{folder === "" ? "<folder>" : folder}/nils</span> and changes nothing else.
        </p>
      </div>
    </Dialog>
  );
}

/** Accept a tool's terms in the administrator's own name, once for the site; where the pack names a site file, the file is placed with it. The tool is named by its title where the page gives one. */
export function AcceptDialog({ p, title = p.spec, onClose, onDone }: { p: SoftwarePackage; title?: string; onClose: () => void; onDone: (words: string) => void }) {
  const l = p.licence;
  const siteFile = l?.site_file ?? null;
  const [file, setFile] = useState<{ name: string; text: string; size: number } | null>(null);
  const { work, run, busy } = useWork();
  const big = file !== null && file.size > LICENCE_MAX;
  const needsFile = siteFile !== null && l?.file?.present !== true;
  // the terms are accepted already and only the file is missing: the dialog places the file alone
  const fileOnly = l?.accepted != null && needsFile;
  const address = l?.terms?.address ?? (fileOnly ? (l?.accepted?.terms?.address ?? null) : null);
  // the pack names no address: the administrator gives the one they accept, as the door takes it
  const [given, setGiven] = useState("");
  const givenOk = /^https?:\/\/\S+$/iu.test(given.trim());
  const termsOk = address !== null || givenOk;
  const ready = !busy && !big && termsOk && (!needsFile || file !== null);
  const go = () =>
    run(
      fileOnly ? `placing the licence file of ${title}` : `accepting the terms of ${title}`,
      async () => {
        const r = await software.accept(p.app, p.version, file ? { text: file.text, name: file.name } : null, address === null ? { address: given.trim() } : null);
        return r.file ? (fileOnly ? `${r.file.name} is placed for ${p.app}'s runs.` : `Accepted for the site; ${r.file.name} is placed for ${p.app}'s runs.`) : "Accepted for the site.";
      },
      onDone,
    );
  return (
    <Dialog
      title={fileOnly ? `Add the licence file of ${title}` : `Accept the terms of ${title}`}
      icon="shield"
      onClose={onClose}
      foot={
        <>
          <Working work={work} />
          <div className="row actions">
            <button type="button" className="button" disabled={!ready} onClick={go}>
              {fileOnly ? "Place the file" : "Accept in my name"}
            </button>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      }
    >
      <dl className="facts">
        <dt>licence</dt>
        <dd>{l?.spdx ?? "named by its terms"}</dd>
        <dt>terms</dt>
        <dd>
          {address && /^https?:\/\//iu.test(address) ? (
            <a href={address} target="_blank" rel="noreferrer noopener">
              {address}
            </a>
          ) : (
            (address ?? (
              <span className="input">
                <input value={given} placeholder="https://… the terms you accept" aria-label="The address of the terms" onChange={(e) => setGiven(e.target.value)} />
              </span>
            ))
          )}
          {l?.terms?.version ? <span className="meta"> · version {l.terms.version}</span> : null}
          {address === null && given.trim() !== "" && !givenOk && <span className="warn"> The pack names no address; give a web address (https://…).</span>}
        </dd>
        {l?.redistributable === false && (
          <>
            <dt>sharing</dt>
            <dd>its image is never shared on from here</dd>
          </>
        )}
      </dl>
      <p className="meta">{fileOnly ? "The terms are accepted already; this places the file for the runs. The engine notes it under your name, with the file's digest." : "Read the terms, then accept them once for this site, in your own name."}</p>
      {siteFile && (
        <div className="field">
          <span className="label">
            Licence file <Hint text={`Kept where only the engine reads it, and given read only to ${p.app}'s runs${siteFile.env ? ` as ${siteFile.env}` : ""}. Its content is never recorded, only its sha256.`} />
          </span>
          <span className="input">
            {l?.file?.present && !file ? <span className="meta">{l.file.name ?? "a file"} is placed; choose another to replace it</span> : null}
            <label className="button secondary small">
              <Icon name="upload" />
              {file ? file.name : (siteFile.name ?? "Choose the file")}
              <input
                type="file"
                hidden
                aria-label="The licence file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void readText(f).then((text) => setFile({ name: f.name, text, size: f.size }));
                }}
              />
            </label>
          </span>
          {big && <span className="warn">over 64 KiB: a licence file is smaller</span>}
        </div>
      )}
    </Dialog>
  );
}

/** Remove what the engine installed, or forget a registration (whose files stay as they are). */
export function RemoveDialog({ p, onClose, onDone }: { p: SoftwarePackage; onClose: () => void; onDone: (words: string) => void }) {
  const site = p.managed === false;
  const { work, run, busy } = useWork();
  const go = () =>
    run(
      site ? `forgetting ${p.spec}` : `removing ${p.spec}`,
      async () => {
        if (site) await software.forget(p.app, p.version);
        else await software.remove(p.app, p.version);
        return site ? `Forgot ${p.spec}; its files are as they were.` : `Removed ${p.spec}.`;
      },
      onDone,
    );
  return (
    <Dialog
      title={site ? `Forget ${p.spec}` : `Remove ${p.spec}`}
      icon="x"
      onClose={onClose}
      foot={
        <>
          <Working work={work} />
          <div className="row actions">
            <button type="button" className="button" disabled={busy} onClick={go}>
              {site ? "Forget" : "Remove"}
            </button>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      }
    >
      <p>{site ? `NILS stops using it. ${p.path ?? "Its path"} is not touched.` : "Its image, wrappers and module go. Runs that need it are refused until it is installed again."}</p>
      {(p.pipelines ?? []).length > 0 && <p className="meta">Used by {(p.pipelines ?? []).join(", ")}.</p>}
    </Dialog>
  );
}
