// SPDX-License-Identifier: AGPL-3.0-only
// Settings > Software (record 57 P5, Wave 7b spec 6.7): the software place,
// one row a package. Each row says its version, how it came and what it is,
// a short fingerprint, whether it was verified and, where a check failed,
// what the probe or the test said, and its licence: accepted by whom and
// when, or waiting. The row offers the one act it needs next (Install,
// Accept, Verify again); Remove takes away what the engine installed and
// Forget takes back a registration, whose files the engine never touches.
// The head offers Install and Register a path. A package of the site's own
// shared folder (a registered install) says so, and the place says where it
// is read only (spec 6.8). The pre-flight's refusals for software (failed
// verification, terms not accepted) link here.

import { Fragment, useCallback, useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { DoorError } from "../ask/client";
import { ensurePeople, peopleKept } from "../assistant/shares";
import { may as granted } from "../grants";
import { whenWords } from "../data/sources";
import { software, type SoftwareFound, type SoftwarePackage, type SoftwarePlace, type SoftwareNeed } from "../ops/client";
import { useInstall } from "../ops/Install";
import { sizeWords } from "../ops/results";
import { shortPrint } from "../ops/text";
import { namer } from "../ops/who";
import { Dialog } from "../ui/Dialog";
import { Hint } from "../ui/Hint";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { Acted, Head, messageOf, Stats, useActing } from "./common";
import { copyFor, failedChecks, kindWords, LICENCE_MAX, licenceState, needsAmiss, nextAct, packFrom, pinnedError, PLACES_HREF, placeFileCommand, placeLine, softwareActs, softwareCounts, specError, statusTag, suggestedVersion, unmatched, verifiedWords, type Tone } from "./software";

type Load = { kind: "loading"; since: number } | { kind: "failed"; why: string } | { kind: "ready"; place: SoftwarePlace };

type Open = { kind: "install"; spec: string | null } | { kind: "register" } | { kind: "accept"; p: SoftwarePackage } | { kind: "remove"; p: SoftwarePackage } | null;

const n = (v: number) => v.toLocaleString("en-US");
const TAG: Record<Tone, string> = { ok: "tag ok", caution: "tag caution", brand: "tag brand", neutral: "tag" };

export function SoftwarePage({ caps }: { caps: Capabilities }) {
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
  if (load.kind === "loading") return <Wait phase="reading the software place" since={load.since} size="panel" />;
  if (load.kind === "failed")
    return (
      <div className="settings">
        <Head title="Software" lede="The tools runs use." />
        <p className="warn">The software place could not be read: {load.why}</p>
      </div>
    );
  return <SoftwareView caps={caps} place={load.place} people={people.value} onChanged={read} />;
}

/** The page as it draws what it read; the tests draw it from fixtures. */
export function SoftwareView({ caps, place, people = null, onChanged, now = new Date() }: { caps: Capabilities; place: SoftwarePlace; people?: { subject: string; display: string }[] | null; onChanged: () => void; now?: Date }) {
  const acts = softwareActs(caps);
  const readOnly = place.place?.read_only === true;
  const may = readOnly ? { ...acts, install: false, register: false, accept: false, forget: false, remove: false } : acts;
  const [open, setOpen] = useState<Open>(null);
  const row = useActing();
  const name = namer(caps, people);
  const when = (iso: string) => whenWords(iso, now);
  const counts = softwareCounts(place.packages);
  const line = placeLine(place.place);
  const done = (words: string) => {
    setOpen(null);
    row.say(words);
    onChanged();
    return words;
  };
  const verify = (p: SoftwarePackage) =>
    row.act(`verifying ${p.spec}`, async () => {
      const r = await software.verify(p.app, p.version);
      onChanged();
      return r.verified ? `${p.spec} verified.` : `${p.spec} did not pass: ${failedChecks({ verification: r.verification }).map((f) => f.said).join("; ") || "see its row"}.`;
    });
  const missing = place.packages.filter((p) => p.status === "missing" && p.kind !== "binary");
  // select = register (record 57 P5): the site's copy in the declared place is registered for the package, with the catalog pipeline's pack
  const useCopy = (p: SoftwarePackage, f: SoftwareFound) =>
    row.act(`registering the copy at ${f.path} as ${p.spec}`, async () => {
      const r = await registerCopy(p, f);
      onChanged();
      const failed = failedChecks(r.package);
      return failed.length > 0 ? `Registered ${r.package.spec} from ${f.path}; ${failed.map((x) => `${x.check}: ${x.said}`).join("; ")}.` : `Registered ${r.package.spec} from ${f.path} and verified it.`;
    });
  const rest = unmatched(place.found);
  return (
    <div className="settings software">
      <Head title="Software" lede="The tools runs use, and whether they check out.">
        <span className="grow" />
        {may.install && (
          <button type="button" className="button" onClick={() => setOpen({ kind: "install", spec: missing[0]?.spec ?? null })}>
            <Icon name="download" />
            Install
          </button>
        )}
        {may.register && (
          <button type="button" className="button secondary" onClick={() => setOpen({ kind: "register" })}>
            Register a path
          </button>
        )}
      </Head>
      <Stats
        items={[
          { label: "packages", value: n(counts.packages) },
          { label: "ready", value: n(counts.ready), tone: counts.ready > 0 ? "ok" : undefined },
          ...(counts.look > 0 ? [{ label: "need a look", value: n(counts.look), tone: "caution" as const }] : []),
          ...(place.runtime ? [{ label: "runtime", value: [place.runtime.name, place.runtime.version].filter(Boolean).join(" ") }] : []),
        ]}
      />
      {place.place && line && (
        <p className="meta software-place">
          <span className="path" title={line.words}>
            {place.place.path ?? "no place yet"}
          </span>
          {readOnly && <span className="tag">read only</span>}
          <span className="meta software-place-line">
            {" · "}
            {line.kind === "default" ? (
              <>the default place under the working place; choose one in {granted(caps, "places:see") ? <a href={PLACES_HREF}>Places</a> : "Places"}</>
            ) : line.kind === "shared" ? (
              <>
                shared, the engine writes into <span className="path">{line.into ?? "its own subfolder"}</span>
              </>
            ) : (
              line.words
            )}
          </span>
        </p>
      )}
      <Acted acting={row.acting} />
      {place.packages.length === 0 ? (
        <p className="meta">Nothing here yet. {may.install ? "Install a tool a pipeline pins." : "An administrator installs the tools runs use."}</p>
      ) : (
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
              {place.packages.map((p) => (
                <PackageRow key={p.spec} caps={caps} p={p} acts={may} copy={may.register ? copyFor(p, place.found) : null} name={name} when={when} busy={row.working} onAct={(a) => (a === "install" ? setOpen({ kind: "install", spec: p.spec }) : a === "accept" || a === "place" ? setOpen({ kind: "accept", p }) : verify(p))} onUseCopy={(f) => useCopy(p, f)} onVerify={() => verify(p)} onRemove={() => setOpen({ kind: "remove", p })} onChanged={onChanged} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rest.length > 0 && <FoundSection found={rest} errors={place.found_errors ?? 0} register={may.register} busy={row.working} onRegistered={(w) => done(w)} />}
      {rest.length === 0 && (place.found_errors ?? 0) > 0 && <p className="meta software-found-errors">{foundErrorsWords(place.found_errors ?? 0)}</p>}
      {open?.kind === "install" && <InstallDialog spec={open.spec} offered={missing.map((p) => p.spec)} onClose={() => setOpen(null)} onDone={(w) => done(w)} />}
      {open?.kind === "register" && <RegisterDialog onClose={() => setOpen(null)} onDone={(w) => done(w)} />}
      {open?.kind === "accept" && <AcceptDialog p={open.p} onClose={() => setOpen(null)} onDone={(w) => done(w)} />}
      {open?.kind === "remove" && <RemoveDialog p={open.p} onClose={() => setOpen(null)} onDone={(w) => done(w)} />}
    </div>
  );
}

const ACT_WORDS = { install: "Install", accept: "Accept", place: "Place the licence file", verify: "Verify again" } as const;

function PackageRow(props: {
  caps: Capabilities;
  p: SoftwarePackage;
  acts: ReturnType<typeof softwareActs>;
  /** The site's copy of this package in the declared place, offered before an install. */
  copy: SoftwareFound | null;
  name: (principal: string) => string;
  when: (iso: string) => string;
  busy: boolean;
  onAct: (a: "install" | "accept" | "place" | "verify") => void;
  onUseCopy: (f: SoftwareFound) => void;
  onVerify: () => void;
  onRemove: () => void;
  onChanged: () => void;
}) {
  const { caps, p, acts, copy, name, when, busy, onAct, onUseCopy, onVerify, onRemove, onChanged } = props;
  const tag = statusTag(p);
  const ver = verifiedWords(p, when);
  const lic = licenceState(p, name, when);
  const next = nextAct(p, acts);
  const failed = failedChecks(p);
  const amiss = needsAmiss(p);
  const site = p.managed === false;
  // the converter installs as it did from Parts: by its pinned build, or from a file where the engine cannot reach the releases
  const converter = useInstall(caps, p.kind === "binary" && p.status === "missing" && p.install?.door ? { tool: p.app, door: p.install.door, command: p.install.command, grant: p.install.grant, version: p.version } : null, null, () => onChanged(), true);
  const tone = tag.tone === "caution" || lic.tone === "caution" ? "caution" : tag.tone === "ok" ? "ok" : "neutral";
  const under = failed.length > 0 || amiss.length > 0 || converter.said !== null;
  return (
    <Fragment>
      <tr className={`software-row ${tone}${under ? " has-fail" : ""}`}>
        <td>
          <b className="path">{p.spec}</b>
          {(p.pipelines ?? []).length > 0 && <div className="meta">{(p.pipelines ?? []).join(", ")}</div>}
          {/* on a phone the row's one act sits under its name, where the eye is; the site's copy comes before an install */}
          {copy && (
            <button type="button" className="button small software-next-narrow" disabled={busy} title={copy.path} onClick={() => onUseCopy(copy)}>
              Use the copy at {copy.path}
            </button>
          )}
          {next && (
            <button type="button" className={`button small software-next-narrow${copy ? " secondary" : ""}`} disabled={busy} onClick={() => onAct(next)}>
              {ACT_WORDS[next]}
            </button>
          )}
        </td>
        <td>
          {kindWords(p)}
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
            {copy && (
              <button type="button" className="button small software-next-wide" disabled={busy} title={copy.path} onClick={() => onUseCopy(copy)}>
                Use the copy at {copy.path}
              </button>
            )}
            {next && (
              <button type="button" className={`button small software-next-wide${copy ? " secondary" : ""}`} disabled={busy} onClick={() => onAct(next)}>
                {ACT_WORDS[next]}
              </button>
            )}
            {converter.button}
            {next !== "verify" && acts.verify && p.status !== "missing" && p.kind !== "binary" && (
              <button type="button" className="button quiet small" disabled={busy} onClick={onVerify} aria-label={`Verify ${p.spec} again`}>
                Verify again
              </button>
            )}
            {p.status !== "missing" && (site ? acts.forget : acts.remove) && (
              <button type="button" className="button quiet small" disabled={busy} onClick={onRemove} aria-label={`${site ? "Forget" : "Remove"} ${p.spec}`}>
                {site ? "Forget" : "Remove"}
              </button>
            )}
          </span>
        </td>
      </tr>
      {under && (
        <tr className="fail-row">
          <td colSpan={7}>
            {failed.map((f) => (
              <p key={f.check} className="fail-said software-said">
                <span className="req-check">{f.check}</span>
                <span>{f.said}</span>
              </p>
            ))}
            {amiss.length > 0 && <NeedsList needs={amiss} />}
            {converter.said}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/**
 * Register the site's copy for a package: with the catalog pipeline's pack (`pack_from`) where the package names a
 * pipeline, and without it where the engine says that pipeline has no pack (422), since the row's spec alone names
 * the package then.
 */
export async function registerCopy(p: SoftwarePackage, f: SoftwareFound) {
  const kind = f.kind === "sandbox" ? ("sandbox" as const) : ("sif" as const);
  const from = packFrom(p);
  if (from === undefined) return software.register({ spec: p.spec, kind, path: f.path });
  try {
    return await software.register({ spec: p.spec, kind, path: f.path, pack_from: from });
  } catch (e) {
    if (e instanceof DoorError && e.status === 422 && /pack/u.test(e.message)) return software.register({ spec: p.spec, kind, path: f.path });
    throw e;
  }
}

/**
 * Found in the place (record 57 P5): what the declared place holds that no package of the catalog matches, a
 * sandbox folder or a SIF by its path and base image. Each registers under a name the person gives, the version
 * suggested from the base; one registered already says so and offers nothing.
 */
export function FoundSection({ found, errors = 0, register, busy, onRegistered }: { found: SoftwareFound[]; errors?: number; register: boolean; busy: boolean; onRegistered: (words: string) => void }) {
  return (
    <section className="software-found" aria-label="Found in the place">
      <h3>Found in the place</h3>
      <p className="meta">
        Not installs of the engine&apos;s; no pipeline pins them. Register one to run it by name.
        {errors > 0 ? ` ${foundErrorsWords(errors)}` : ""}
      </p>
      <ul className="software-found-list">
        {found.map((f) => (
          <FoundRow key={f.path} f={f} register={register} busy={busy} onRegistered={onRegistered} />
        ))}
      </ul>
    </section>
  );
}

const FOUND_KIND: Record<string, string> = { sif: "SIF", sandbox: "sandbox folder" };

/** The entries of the place the engine could not read, counted. */
function foundErrorsWords(n: number): string {
  return n === 1 ? "One entry of the place could not be read." : `${n.toLocaleString("en-US")} entries of the place could not be read.`;
}

function FoundRow({ f, register, busy, onRegistered }: { f: SoftwareFound; register: boolean; busy: boolean; onRegistered: (words: string) => void }) {
  const [app, setApp] = useState("");
  const [version, setVersion] = useState(() => suggestedVersion(f.base));
  const { work, run, busy: working } = useWork();
  const spec = `${app.trim()}@${version.trim()}`;
  const ready = app.trim() !== "" && version.trim() !== "" && specError(spec) === null && !busy && !working;
  const go = () =>
    run(
      `registering ${spec} from ${f.path}`,
      async () => {
        const r = await software.register({ spec, kind: f.kind === "sandbox" ? "sandbox" : "sif", path: f.path });
        const failed = failedChecks(r.package);
        return failed.length > 0 ? `Registered ${r.package.spec} from ${f.path}; ${failed.map((x) => `${x.check}: ${x.said}`).join("; ")}.` : `Registered ${r.package.spec} from ${f.path} and verified it.`;
      },
      onRegistered,
    );
  return (
    <li className="software-found-row">
      <div>
        <span className="path">{f.path}</span>
        <div className="meta">
          {FOUND_KIND[f.kind] ?? f.kind}
          {f.base ? ` · from ${f.base}` : ""}
        </div>
      </div>
      {f.registered ? (
        <span className="tag ok">registered already</span>
      ) : register ? (
        <div className="row software-found-register">
          <span className="label">Register as</span>
          <span className="input mono">
            <input value={app} placeholder="app" aria-label={`The app name for ${f.path}`} disabled={working} onChange={(e) => setApp(e.target.value)} />
          </span>
          <span>@</span>
          <span className="input mono">
            <input value={version} placeholder="version" aria-label={`The version for ${f.path}`} disabled={working} onChange={(e) => setVersion(e.target.value)} />
          </span>
          <button type="button" className="button small" disabled={!ready} onClick={go} aria-label={`Register ${f.path}`}>
            Register
          </button>
          {app.trim() !== "" && version.trim() !== "" && specError(spec) && <span className="warn">{specError(spec)}</span>}
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

/** Install by digest: the package, and its source where no pack or pipeline names one; the engine pulls, checks the digest and verifies. */
export function InstallDialog({ spec: first, offered, onClose, onDone }: { spec: string | null; offered: string[]; onClose: () => void; onDone: (words: string) => void }) {
  const [spec, setSpec] = useState(first ?? "");
  const [source, setSource] = useState("");
  const [pack, setPack] = useState<{ name: string; text: string } | null>(null);
  const { work, run, busy } = useWork();
  const bad = specError(spec) ?? pinnedError(source);
  const ready = spec.trim() !== "" && bad === null && !busy;
  const go = () =>
    run(
      `pulling ${spec.trim()} by its digest; one pull at a time`,
      async () => {
        const r = await software.install({ spec: spec.trim(), ...(source.trim() ? { source: source.trim() } : {}), ...(pack ? { pack: pack.text } : {}) });
        if (!r.installed) return `${r.package?.spec ?? spec.trim()} is installed already: ${r.why ?? "left as it is"}.`;
        const failed = failedChecks(r.package);
        return failed.length > 0 ? `Installed ${r.package.spec}; ${failed.map((f) => `${f.check}: ${f.said}`).join("; ")}.` : `Installed ${r.package.spec} and verified it.`;
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
      <div className="field">
        <span className="label">Package</span>
        <span className="input">
          {offered.length > 0 ? (
            <select value={offered.includes(spec) ? spec : ""} aria-label="The package" onChange={(e) => setSpec(e.target.value)}>
              {offered.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="">another…</option>
            </select>
          ) : null}
          {(offered.length === 0 || !offered.includes(spec)) && <input value={spec} placeholder="app@version" aria-label="The package's name and version" onChange={(e) => setSpec(e.target.value)} />}
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
    </Dialog>
  );
}

const KINDS = [
  { kind: "sif", words: "SIF file", path: "/path/to/tool.sif" },
  { kind: "sandbox", words: "Folder", path: "/path/to/tool" },
  { kind: "image", words: "Docker image", path: "repository@sha256:…" },
] as const;

/** Register a path: an install the site already holds, recorded as it is; nothing under the path is written. */
export function RegisterDialog({ onClose, onDone }: { onClose: () => void; onDone: (words: string) => void }) {
  const [spec, setSpec] = useState("");
  const [kind, setKind] = useState<"sif" | "sandbox" | "image">("sif");
  const [path, setPath] = useState("");
  const [pack, setPack] = useState<{ name: string; text: string } | null>(null);
  const { work, run, busy } = useWork();
  const pathBad = path.trim() === "" ? null : kind === "image" ? pinnedError(path) : path.trim().startsWith("/") ? null : "a full path, from /";
  const ready = spec.trim() !== "" && specError(spec) === null && path.trim() !== "" && pathBad === null && !busy;
  const go = () =>
    run(
      `registering ${spec.trim()} and verifying it`,
      async () => {
        const r = await software.register({ spec: spec.trim(), kind, path: path.trim(), ...(pack ? { pack: pack.text } : {}) });
        const failed = failedChecks(r.package);
        return failed.length > 0 ? `Registered ${r.package.spec}; ${failed.map((f) => `${f.check}: ${f.said}`).join("; ")}.` : `Registered ${r.package.spec} and verified it.`;
      },
      onDone,
    );
  return (
    <Dialog
      title="Register a path"
      icon="folder"
      onClose={onClose}
      foot={
        <>
          <Working work={work} />
          <div className="row actions">
            <button type="button" className="button" disabled={!ready} onClick={go}>
              Register
            </button>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      }
    >
      <div className="field">
        <span className="label">Package</span>
        <span className="input">
          <input value={spec} placeholder="app@version" aria-label="The package's name and version" onChange={(e) => setSpec(e.target.value)} />
        </span>
        {specError(spec) && <span className="warn">{specError(spec)}</span>}
      </div>
      <div className="field">
        <span className="label">What it is</span>
        <div className="chips" role="group" aria-label="what the install is">
          {KINDS.map((k) => (
            <button key={k.kind} type="button" className={kind === k.kind ? "opt on" : "opt"} aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)}>
              {k.words}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">
          {kind === "image" ? "Image" : "Path"} <Hint text="NILS reads it as it is and never changes, moves or removes it." />
        </span>
        <span className="input">
          <input value={path} placeholder={KINDS.find((k) => k.kind === kind)!.path} aria-label={kind === "image" ? "The image, pinned by its digest" : "The path on this machine"} onChange={(e) => setPath(e.target.value)} />
        </span>
        {pathBad && <span className="warn">{pathBad}</span>}
      </div>
      <PackField pack={pack} onPack={setPack} />
    </Dialog>
  );
}

/** Accept a tool's terms in the administrator's own name, once for the site; where the pack names a site file, the file is placed with it. */
export function AcceptDialog({ p, onClose, onDone }: { p: SoftwarePackage; onClose: () => void; onDone: (words: string) => void }) {
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
      fileOnly ? `placing the licence file of ${p.spec}` : `accepting the terms of ${p.spec}`,
      async () => {
        const r = await software.accept(p.app, p.version, file ? { text: file.text, name: file.name } : null, address === null ? { address: given.trim() } : null);
        return r.file ? (fileOnly ? `${r.file.name} is placed for ${p.app}'s runs.` : `Accepted for the site; ${r.file.name} is placed for ${p.app}'s runs.`) : "Accepted for the site.";
      },
      onDone,
    );
  return (
    <Dialog
      title={fileOnly ? `Place the licence file of ${p.spec}` : `Accept the terms of ${p.spec}`}
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
