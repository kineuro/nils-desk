// SPDX-License-Identifier: AGPL-3.0-only
// The Parts page's words (Wave 5 section 10.1), as the chosen design draws
// them: every part the deployment runs with its version, what runs it and how
// it answers, the model runtime beside the gateway, what a newer release
// changes, and how the install is kept running. Every line is read from the
// capabilities document, the supervisor's install or the gateway's admission
// records; nothing is hand-built.

import type { Capabilities } from "../capabilities";
import type { IconName } from "../ui/Icon";
import { keptRunning } from "./install";
import type { AdmissionRecord } from "./kvasir";
import type { Install } from "./supervise";

export type Tone = "ok" | "caution" | "blocked";

export interface PartRow {
  id: string;
  title: string;
  icon: IconName;
  version: string;
  /** Set in the mono face: a version or a name a person types. */
  mono: boolean;
  meta: string | null;
  /** Null where the install is not known to this person. */
  runsAs: { text: string; mono: boolean } | null;
  health: { tone: Tone; words: string };
  newer: { text: string; tag: boolean } | null;
  /** The settings page that says more, where one is built. */
  page: string | null;
}

interface GatewayDoc {
  kvasir?: { version?: string };
  backends?: { id: string; locality?: string; health?: { warming?: boolean; running?: number; concurrency?: number } }[];
  models?: { id: string; backend?: string; admitted?: boolean | null }[];
  health?: { warming?: boolean };
}

interface AssistantDoc {
  assistant?: { version?: string };
  stations?: unknown[];
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/** How long a part has run, as a person says it. */
export function uptimeWords(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return "just started";
  const days = Math.floor(seconds / 86_400);
  if (days >= 1) return `running ${count(days, "day", "days")}`;
  const hours = Math.floor(seconds / 3_600);
  if (hours >= 1) return `running ${count(hours, "hour", "hours")}`;
  return `running ${count(Math.floor(seconds / 60), "minute", "minutes")}`;
}

/** The contracts a part speaks, on one line. */
export function contractWords(contracts: Record<string, string>): string {
  return Object.entries(contracts)
    .map(([name, v]) => `${name} ${v}`)
    .join(" · ");
}

/** How a part came to be on this machine. */
export function kindWords(kind: string | undefined): string | null {
  if (kind === undefined) return null;
  return ({ binary: "a release binary", node: "from source", docker: "a docker image", podman: "a podman image" } as Record<string, string>)[kind] ?? kind;
}

/** A model server's name as its makers write it. */
export function runtimeName(name: string): string {
  return ({ sglang: "SGLang", vllm: "vLLM", "llama.cpp": "llama.cpp", llamacpp: "llama.cpp", ollama: "Ollama" } as Record<string, string>)[name.toLowerCase()] ?? name;
}

/** A part's name at the head of a row. */
export function partTitle(part: string): string {
  return ({ engine: "Engine", desk: "Desk", gateway: "Gateway", kvasir: "Gateway", assistant: "Assistant", postgres: "Postgres" } as Record<string, string>)[part] ?? part;
}

/** A part's name inside a sentence. */
export function partName(part: string): string {
  return ({ engine: "the engine", desk: "the desk", gateway: "the gateway", kvasir: "the gateway", assistant: "the assistant", postgres: "Postgres" } as Record<string, string>)[part] ?? part;
}

const SIGN_IN: Record<string, string> = { off: "no sign-in", local: "local sign-in", oidc: "single sign-on" };

/** Every part this deployment runs, in the order the design lists them. */
export function partRows(caps: Capabilities, install: Install | null, admissions: AdmissionRecord[] | null, built: string[]): PartRow[] {
  const unit = (part: string) => install?.services.find((s) => s.part === part) ?? null;
  const page = (id: string) => (built.includes(id) ? id : null);
  const release = install?.release ?? null;
  const runsAs = (part: string): PartRow["runsAs"] => {
    if (!install) return null;
    const u = unit(part);
    return u ? { text: u.unit, mono: true } : { text: "started by hand", mono: false };
  };
  // a part that answered is running; one the supervisor finds stopped is said to be
  const health = (part: string, answers: boolean, running: string): PartRow["health"] => {
    if (answers) return { tone: "ok", words: running };
    return { tone: "blocked", words: unit(part)?.running === false ? "stopped" : "does not answer" };
  };
  const released = (): PartRow["newer"] => {
    if (!release) return null;
    if (release.newer) return { text: release.newer, tag: true };
    return { text: release.newest ? "the newest" : "not checked", tag: false };
  };
  const fromSource = (kind: string | undefined): PartRow["newer"] => (!release ? null : kind === "node" ? { text: "fetched with the update", tag: false } : released());

  const rows: PartRow[] = [];
  const engine = caps.engine;
  const uptime = typeof engine?.["uptime_seconds"] === "number" ? (engine["uptime_seconds"] as number) : null;
  rows.push({
    id: "engine",
    title: "Engine",
    icon: "engine",
    version: engine ? `nils ${engine.engine.version}` : (install?.parts["engine"]?.version ?? "not known"),
    mono: true,
    meta: engine ? contractWords(engine.contracts) || null : null,
    runsAs: runsAs("engine"),
    health: health("engine", engine !== null, uptime !== null ? uptimeWords(uptime) : "running"),
    newer: released(),
    page: page("engine"),
  });
  rows.push({
    id: "desk",
    title: "Desk",
    icon: "desk",
    version: caps.desk.version,
    mono: true,
    meta: SIGN_IN[caps.desk.mode] ?? caps.desk.mode,
    runsAs: runsAs("desk"),
    // the desk answered for this page to be drawn
    health: { tone: "ok", words: "running" },
    newer: released(),
    page: page("desk"),
  });

  const gateway = caps.kvasir as GatewayDoc | null;
  const kvasirPart = install?.parts["kvasir"];
  if (gateway !== null || kvasirPart) {
    const backends = gateway?.backends ?? [];
    const busy = backends.reduce((n, b) => n + (b.health?.running ?? 0), 0);
    const of = backends.reduce((n, b) => n + (b.health?.concurrency ?? 0), 0);
    rows.push({
      id: "gateway",
      title: "Gateway",
      icon: "gateway",
      version: `Kvasir ${gateway?.kvasir?.version ?? kvasirPart?.version ?? ""}`.trim(),
      mono: false,
      meta: kindWords(kvasirPart?.kind),
      runsAs: runsAs("gateway"),
      health:
        gateway === null
          ? health("gateway", false, "")
          : gateway.health?.warming
            ? { tone: "caution", words: "warming" }
            : { tone: "ok", words: of > 0 ? `warm · ${busy} of ${of} streams busy` : "warm" },
      newer: fromSource(kvasirPart?.kind),
      page: page("gateway"),
    });
    const local = backends.find((b) => b.locality === "local");
    if (local) {
      const record = (admissions ?? []).filter((r) => r.backend === local.id).sort((a, b) => b.at - a.at)[0];
      const serving = (gateway?.models ?? []).filter((m) => m.backend === local.id && m.admitted === true).map((m) => m.id);
      const card = install?.machine.card ?? null;
      rows.push({
        id: "runtime",
        title: "Model runtime",
        icon: "chip",
        version: record ? `${runtimeName(record.runtime.name)} ${record.runtime.version}`.trim() : "a model server",
        mono: false,
        meta: card ? `${card.name}, ${card.memory_gb} GB` : null,
        runsAs: { text: "outside NILS", mono: false },
        health: local.health?.warming
          ? { tone: "caution", words: "warming" }
          : serving.length > 0
            ? { tone: "ok", words: `serving ${serving.join(", ")}` }
            : { tone: "caution", words: "no model admitted yet" },
        newer: { text: "yours to update", tag: false },
        page: page("gateway"),
      });
    }
  }

  const assistant = caps.assistant as AssistantDoc | null;
  const assistantPart = install?.parts["assistant"];
  if (assistant !== null || assistantPart) {
    const stations = assistant?.stations?.length ?? 0;
    rows.push({
      id: "assistant",
      title: "Assistant",
      icon: "assistant",
      version: assistant?.assistant?.version ?? assistantPart?.version ?? "not known",
      mono: true,
      meta: [kindWords(assistantPart?.kind), stations > 0 ? count(stations, "station", "stations") : null].filter(Boolean).join(" · ") || null,
      runsAs: runsAs("assistant"),
      health: health("assistant", assistant !== null, "running"),
      newer: fromSource(assistantPart?.kind),
      page: page("assistant"),
    });
  }

  if (install) {
    const postgres = install.parts["postgres"];
    const service = unit("postgres");
    const kept: PartRow["health"] = engine !== null ? { tone: "ok", words: "answers the engine" } : { tone: "blocked", words: "not known" };
    if (install.backend.startsWith("postgres")) {
      rows.push({
        id: "postgres",
        title: "Postgres",
        icon: "data",
        version: postgres?.version ?? "your own server",
        mono: postgres !== undefined,
        meta: postgres ? "set up here" : "outside NILS",
        runsAs: service ? { text: service.unit, mono: true } : { text: postgres ? "started by hand" : "outside NILS", mono: false },
        health: service ? (service.running ? { tone: "ok", words: "running" } : { tone: "blocked", words: "stopped" }) : kept,
        newer: postgres ? { text: `stays at ${postgres.version}`, tag: false } : { text: "yours to update", tag: false },
        page: page("database"),
      });
    } else {
      rows.push({
        id: "sqlite",
        title: "Registry",
        icon: "data",
        version: "SQLite",
        mono: false,
        meta: "in the registry place",
        runsAs: { text: "inside the engine", mono: false },
        health: engine !== null ? { tone: "ok", words: "kept by the engine" } : { tone: "blocked", words: "not known" },
        newer: { text: "moves with the engine", tag: false },
        page: page("database"),
      });
    }
  }
  return rows;
}

/** What taking the newer release changes, part by part, in the order the update does it. */
export function updateWords(install: Install): string[] {
  const newer = install.release.newer;
  if (!newer) return [];
  const parts = install.parts;
  const out = [`The engine and the desk move to ${newer} together.`];
  const source = ["kvasir", "assistant"].filter((n) => parts[n]?.kind === "node").map(partName);
  if (source.length === 2) out.push(`${cap(source[0])} and ${source[1]} fetch their newest source, and are built again where it moved.`);
  if (source.length === 1) out.push(`${cap(source[0])} fetches its newest source, and is built again where it moved.`);
  if (parts["postgres"]) out.push(`Postgres stays at ${parts["postgres"].version}, and its data is not touched.`);
  out.push(keptRunning(install) ? "Every part starts again, in order, once it is replaced." : "This install runs no services, so start each part again yourself once it is replaced.");
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How the install runs. */
export function runtimeWords(i: Install): string {
  if (i.runtime === "docker") return "docker, a container for each part";
  if (i.runtime === "podman") return "podman, a container for each part";
  return "on this machine, a process for each part";
}

/** What brings the parts back, in the words setup recorded. */
export function keptByWords(i: Install): string {
  if (!keptRunning(i)) return "nothing: this install runs no services";
  if (i.service === "a compose file") return `compose.yaml in ${i.dir}, kept by docker`;
  if (i.service === "podman quadlets") return "podman quadlets, kept by systemd";
  return i.service;
}

/** The command that restarts one part, or every part, by hand, in the service manager's own words. */
export function restartByHand(i: Install, part: string): string {
  const units = i.services.filter((s) => part === "all" || s.part === part);
  if (units.length === 0) return "nils setup";
  const watcher = units[0].watcher;
  if (watcher === "docker") return part === "all" ? `cd ${i.dir} && docker compose restart` : `docker restart ${units[0].unit}`;
  if (watcher === "launchd") return units.map((u) => `launchctl kickstart -k gui/$(id -u)/${u.unit}`).join(" && ");
  return `systemctl --user restart ${units.map((u) => u.unit).join(" ")}`;
}

/** When the install was last read, as a person says it. */
export function checkedWords(at: number | null, now: number): string | null {
  if (at === null) return null;
  const minutes = Math.floor((now - at) / 60_000);
  return minutes < 1 ? "checked just now" : `checked ${count(minutes, "minute", "minutes")} ago`;
}
