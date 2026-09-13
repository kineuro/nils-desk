// SPDX-License-Identifier: AGPL-3.0-only
// Home's first band, as the chosen design draws it: the steps that make an
// install ready for real work. Each step is worked out from what the parts
// say, never declared, and the band leaves Home once every step is done.

import type { JobRow } from "../ask/client";
import type { Capabilities } from "../capabilities";
import type { Place } from "../objects/client";
import { keptRunning, where } from "../settings/install";
import type { Install } from "../settings/supervise";
import { day } from "./tiles";

export type StepId = "installed" | "model" | "dicom" | "safe" | "signin";
/** done; attention, which works but needs a decision; now, begun; todo, not begun. */
export type StepState = "done" | "attention" | "now" | "todo";

export interface Tag {
  text: string;
  tone: "caution" | "neutral";
}

export interface Step {
  id: StepId;
  title: string;
  state: StepState;
  words: string;
  tags: Tag[];
  /** Begun and not finished: a source named and nothing digested yet. */
  halfway: boolean;
}

export interface Purpose {
  purpose: string;
  content: string;
  backend: string | null;
}

export interface Facts {
  caps: Capabilities;
  /** The supervisor's install, for an admin where one answers. */
  install: Install | null;
  /** Null where the places door is not served or not open to this person. */
  places: Place[] | null;
  batches: number | null;
  /** Finished backup jobs, newest first. */
  backups: JobRow[] | null;
  purposes: Purpose[] | null;
}

interface Model {
  id: string;
  locality: "local" | "remote";
}

function models(caps: Capabilities): Model[] {
  const listed = (caps.kvasir?.["models"] as { id?: unknown; locality?: unknown }[] | undefined) ?? [];
  return listed.flatMap((m) => (typeof m.id === "string" ? [{ id: m.id, locality: m.locality === "remote" ? ("remote" as const) : ("local" as const) }] : []));
}

const gb = (x: number) => `${Math.round(x)} GB`;

function installed(f: Facts): Step {
  const i = f.install;
  const words = i
    ? `${i.runtime === "machine" || i.runtime === "" ? "On this machine" : `In ${where(i)}`}, ${keptRunning(i) ? "and back after a restart" : "started by hand"}. Everything lives under ${i.dir}.`
    : `The engine ${f.caps.engine?.engine.version ?? ""} and the desk ${f.caps.desk.version} answer.`.replace("  ", " ");
  return { id: "installed", title: "Installed", state: "done", words, tags: [], halfway: false };
}

function model(f: Facts): Step | null {
  if (f.caps.assistant === null) return null;
  const title = "A model for the assistant";
  if (f.caps.kvasir === null) {
    return { id: "model", title, state: "attention", words: "The gateway does not answer, so the assistant has no model to talk to.", tags: [], halfway: false };
  }
  const all = models(f.caps);
  const local = all.filter((m) => m.locality === "local");
  const remote = all.filter((m) => m.locality === "remote");
  const card = f.install?.machine.card ?? null;
  if (local.length > 0) {
    const beside = remote.length > 0 ? `, beside ${remote[0].id} at a provider` : "";
    return { id: "model", title, state: "done", words: `${local[0].id} answers on this machine${beside}.`, tags: [], halfway: false };
  }
  const closed = (f.purposes ?? []).filter((p) => p.content === "rows" && p.backend === null);
  const serve = card ? ` This machine's ${card.name} (${gb(card.memory_gb)}) can serve a local model.` : "";
  if (remote.length > 0) {
    const need =
      closed.length > 0 ? ` The ${closed.length === 1 ? "station that reads" : `${closed.length} stations that read`} rows of the archive ${closed.length === 1 ? "needs" : "need"} a local model.` : "";
    return { id: "model", title, state: "attention", words: `${remote[0].id} at a provider answers what reads no rows.${need}${serve}`, tags: [], halfway: false };
  }
  return { id: "model", title, state: "attention", words: `The gateway lists no model yet.${serve || " A model on another machine of yours, or a provider, can answer instead."}`, tags: [], halfway: false };
}

function dicom(f: Facts, containers: boolean): Step | null {
  if (f.places === null) return null;
  const title = "Bring in DICOM";
  const sources = f.places.filter((p) => p.role === "source" && p.retired_at === null);
  if (sources.length === 0) {
    const kept = containers ? "It is mounted read only; nothing is ever written to it." : "It is read only; nothing is ever written to it.";
    return { id: "dicom", title, state: "now", words: `Add each folder NILS reads. ${kept}`, tags: [], halfway: false };
  }
  const names = sources.map((s) => s.name).join(", ");
  if (!f.batches) {
    return {
      id: "dicom",
      title,
      state: "now",
      words: `${names} ${sources.length === 1 ? "is a source" : "are sources"}, and nothing is digested yet.`,
      tags: [],
      halfway: true,
    };
  }
  return {
    id: "dicom",
    title,
    state: "done",
    words: `${sources.length === 1 ? "One source" : `${sources.length} sources`}, ${f.batches === 1 ? "one batch" : `${f.batches} batches`} digested.`,
    tags: [],
    halfway: false,
  };
}

const WEEK = 7 * 24 * 3600 * 1000;

function safe(f: Facts, now: number): Step | null {
  if (f.places === null) return null;
  const title = "Keep the registry safe";
  const live = f.places.filter((p) => p.retired_at === null);
  const registry = live.find((p) => p.role === "registry") ?? null;
  const named = registry?.guarantees?.["backup"];
  const backup = typeof named === "string" ? (live.find((p) => p.name === named) ?? null) : null;
  const postgres = (f.install?.backend ?? "").startsWith("postgres");
  const version = f.install?.parts["postgres"]?.version;
  const keeper = f.install ? (postgres ? `Postgres${version ? ` ${version}` : ""}` : "SQLite") : "The registry";
  const at = registry?.path ?? (f.install ? `${f.install.dir}/registry` : null);
  const mount = (p: Place | null) => (typeof p?.probed?.["mount"] === "string" ? (p.probed["mount"] as string) : null);
  const sameDisk = backup !== null && registry !== null && mount(backup) !== null && mount(backup) === mount(registry);
  const last = f.backups?.[0]?.finished_at ?? null;
  const recent = last !== null && now - new Date(last).getTime() < WEEK;
  let words = f.install ? `${keeper} keeps the registry${at ? ` in ${at}` : ""}.` : `The registry is kept${at ? ` in ${at}` : ""}.`;
  if (backup) {
    words += ` Backups go to ${backup.path}${sameDisk ? ", on the same disk" : ""}, and ${last ? `the last ran on ${day(last)}` : "none has run"}.`;
  } else {
    words += " No backup place is named for it.";
  }
  const tags: Tag[] = [];
  if (sameDisk) tags.push({ text: "same disk as the registry", tone: "caution" });
  tags.push({ text: "no schedule", tone: "neutral" });
  tags.push({ text: "key not in any backup", tone: "neutral" });
  const done = backup !== null && !sameDisk && recent;
  return { id: "safe", title, state: done ? "done" : "todo", words, tags, halfway: false };
}

const LOOPBACK = /^[a-z]+:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i;

function signin(f: Facts): Step {
  const title = "Decide who signs in";
  const mode = f.caps.desk.mode;
  const origin = f.caps.desk.settings?.origin ?? "";
  if (mode === "local") return { id: "signin", title, state: "done", words: "The desk keeps the people and their passwords.", tags: [], halfway: false };
  if (mode === "oidc") {
    const issuer = f.install?.oidc?.issuer;
    return { id: "signin", title, state: "done", words: `People sign in at ${issuer ?? "your identity provider"}.`, tags: [], halfway: false };
  }
  if (origin !== "" && !LOOPBACK.test(origin)) {
    return {
      id: "signin",
      title,
      state: "attention",
      words: `Nobody signs in, and the desk answers at ${origin}: anyone on that network who finds it can do everything.`,
      tags: [{ text: "open to the network", tone: "caution" }],
      halfway: false,
    };
  }
  return {
    id: "signin",
    title,
    state: "todo",
    words: "Nobody signs in, and the desk answers only on this machine. That suits one person; add people before opening it to the network.",
    tags: [],
    halfway: false,
  };
}

/** The steps, in the order the band shows them. */
export function steps(f: Facts, now: number = Date.now()): Step[] {
  const containers = f.install !== null && f.install.runtime !== "machine" && f.install.runtime !== "";
  return [installed(f), model(f), dicom(f, containers), safe(f, now), signin(f)].filter((s): s is Step => s !== null);
}

/** The step the band opens on: begun before attention before not begun. */
export function next(all: Step[]): Step | null {
  return all.find((s) => s.state === "now") ?? all.find((s) => s.state === "attention") ?? all.find((s) => s.state === "todo") ?? null;
}

const HEADLINES: Record<StepId, string> = {
  installed: "NILS is installed.",
  model: "NILS is installed. Next, give the assistant a model.",
  dicom: "NILS is installed. Next, give it something to read.",
  safe: "NILS is installed. Next, keep the registry safe.",
  signin: "NILS is installed. Next, decide who signs in.",
};

export function headline(all: Step[]): string | null {
  const n = next(all);
  return n ? HEADLINES[n.id] : null;
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const cardinal = (n: number) => WORDS[n] ?? String(n);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How far along the band is, in a sentence. */
export function lede(all: Step[]): string {
  const done = all.filter((s) => s.state === "done").length;
  const halfway = all.filter((s) => s.halfway).length;
  const lead = `${capital(cardinal(all.length))} steps make this install ready for real work.`;
  if (done === 0 && halfway === 0) return `${lead} None is done yet.`;
  const parts: string[] = [];
  if (done > 0) parts.push(`${cardinal(done)} ${done === 1 ? "is" : "are"} done`);
  if (halfway > 0) parts.push(`${cardinal(halfway)} ${halfway === 1 ? "is" : "are"} halfway`);
  return `${lead} ${capital(parts.join(", and "))}.`;
}
