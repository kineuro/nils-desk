// SPDX-License-Identifier: AGPL-3.0-only
// Local models on the Kvasir page (record 23, slice M; record 24). Kvasir
// downloads a model from the Hugging Face Hub into a location an admin
// changes. Where the install runs llama.cpp for Kvasir, a downloaded GGUF model
// starts on it from its row, one at a time; elsewhere an admin starts a model
// server on a download and adds it with Add a model. These are the section's
// rules and words: sizes as a person reads them, each state's tag, bar and
// actions, what the download dialog asks and when it may download, how a
// started model runs, and each refusal in words a person can act on.

import { admissionWords, listWords, modelOf, type Admission, type Tone } from "./gateway";
import type { AdmissionRecord, Backend, LocalAsk, LocalFile, LocalLookup, LocalModel, LocalRefusal, LocalRun, LocalRuntime, LocalState, RunState } from "./kvasir";

/** How often the list is read again while a model is queued or downloading. */
export const POLL_MS = 5_000;

/** The room Kvasir keeps free beside a download. */
export const SPARE_BYTES = 2 ** 30;

/** The revision a model is downloaded at where none is typed. */
export const DEFAULT_REVISION = "main";

/** Kvasir's own limits on the patterns, said before it is asked. */
export const MOST_PATTERNS = 64;
export const LONGEST_PATTERN = 256;

const UNITS = ["KiB", "MiB", "GiB", "TiB"];
const count = (n: number) => n.toLocaleString("en-GB");
const tenths = (n: number) => Math.round(n * 10) / 10;

/** A size as a person reads it: bytes below a kibibyte, then KiB, MiB, GiB or TiB to a tenth. */
export function bytesWords(bytes: number): string {
  const n = Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 0;
  if (n < 1024) return n === 1 ? "1 byte" : `${count(n)} bytes`;
  let value = n / 1024;
  let unit = 0;
  // what rounds to 1,024 of one unit reads as 1 of the next
  while (unit < UNITS.length - 1 && tenths(value) >= 1024) {
    value /= 1024;
    unit += 1;
  }
  return `${tenths(value).toLocaleString("en-GB", { maximumFractionDigits: 1 })} ${UNITS[unit]}`;
}

/** How far a download is, in whole percent: 100 only once every byte is there. */
export function percentOf(done: number, total: number): number {
  if (!(total > 0)) return 0;
  if (done >= total) return 100;
  return Math.min(99, Math.max(0, Math.floor((done / total) * 100)));
}

export type LocalTone = Tone | "brand";

const TAGS: Record<LocalState, { tone: LocalTone; words: string }> = {
  queued: { tone: "neutral", words: "queued" },
  downloading: { tone: "brand", words: "downloading" },
  paused: { tone: "caution", words: "paused" },
  done: { tone: "ok", words: "downloaded" },
  failed: { tone: "blocked", words: "failed" },
};

/** The tag a model's row carries for its state; a state this desk does not know reads as Kvasir names it. */
export function modelTag(state: LocalState): { tone: LocalTone; words: string } {
  return TAGS[state] ?? { tone: "neutral", words: String(state) };
}

/** Where the bar under a model stands: drawn while it downloads or is paused, and never for a model queued, downloaded or failed. */
export function barOf(m: LocalModel): number | null {
  return m.state === "downloading" || m.state === "paused" ? percentOf(m.bytes_done, m.bytes_total) : null;
}

export type LocalAction = "pause" | "resume" | "remove";

/** What a model's row offers: a download queued or under way pauses, a paused or failed one resumes, and any model is removed. */
export function actionsOf(state: LocalState): LocalAction[] {
  if (state === "queued" || state === "downloading") return ["pause", "remove"];
  if (state === "paused" || state === "failed") return ["resume", "remove"];
  return ["remove"];
}

/** Whether the list is read again: while any model is queued or downloading. */
export function underWay(models: LocalModel[]): boolean {
  return models.some((m) => m.state === "queued" || m.state === "downloading");
}

const filesWords = (n: number) => (n === 1 ? "one file" : `${count(n)} files`);

/** How far a model is, said beside its bar or under its name. */
export function progressWords(m: LocalModel): string {
  const whole = `${bytesWords(m.bytes_total)} in ${filesWords(m.files)}`;
  const part = `${bytesWords(m.bytes_done)} of ${bytesWords(m.bytes_total)}`;
  if (m.state === "downloading" || m.state === "paused") return `${part}, ${percentOf(m.bytes_done, m.bytes_total)}%`;
  if (m.state === "queued") return `${m.bytes_done > 0 ? part : whole}, waiting its turn`;
  if (m.state === "failed" && m.bytes_done > 0) return `${part} when it stopped`;
  return whole;
}

/** A commit as a person compares it: its first seven characters. */
export function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

/** The revision a model was asked at with the commit it named, or the commit alone where the revision was one. */
export function revisionWords(m: { revision: string; commit: string }): string {
  if (!m.commit) return m.revision;
  return m.revision === m.commit ? `commit ${shortCommit(m.commit)}` : `${m.revision}, commit ${shortCommit(m.commit)}`;
}

const RUNTIMES: Record<string, string> = { "llama.cpp": "llama.cpp", ollama: "Ollama Modelfile", sglang: "SGLang", vllm: "vLLM" };

/** The label over a command: the model server it starts, and for Ollama the Modelfile line it is. */
export function runtimeLabel(runtime: string): string {
  return RUNTIMES[runtime] ?? runtime;
}

/** Said under a downloaded model's commands. */
export const SERVE_NOTE = "Kvasir runs no model: start a model server with one of these commands, then add it with Add a model.";

/** Said for a downloaded model Kvasir knows no command for. */
export const NO_COMMAND = "Kvasir runs no model, and knows no command for these files: start a model server on them as its own documentation says, then add it with Add a model.";

/** Said beside the Hugging Face token. */
export const TOKEN_NOTE = "Needed only for gated or private models. Kvasir keeps it sealed and never shows it.";

/** Said where the location changes. */
export const STAY_NOTE = "Models downloaded earlier stay where they are, and the list shows each with its own path.";

/** Whether the Hugging Face token is set, as the tag beside it. */
export function tokenTag(set: boolean): { tone: LocalTone; words: string } {
  return set ? { tone: "ok", words: "set" } : { tone: "neutral", words: "not set" };
}

/** Whether a typed token is one Kvasir takes: 8 to 512 characters, and no space. */
export function tokenReady(typed: string): boolean {
  const t = typed.trim();
  return t.length >= 8 && t.length <= 512 && !/\s/u.test(t);
}

/** The room where new downloads go. */
export function freeWords(free: number | null): string {
  return free === null ? "Kvasir could not read the free space there." : `${bytesWords(free)} free`;
}

/** The include text as patterns: one a line or separated by commas, trimmed, each once. */
export function patternsOf(text: string): string[] {
  const out: string[] = [];
  for (const p of text.split(/[\n,]/u)) {
    const t = p.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** What the download dialog holds, as typed. */
export interface DownloadDraft {
  repo: string;
  revision: string;
  include: string;
}

export const EMPTY_DRAFT: DownloadDraft = { repo: "", revision: "", include: "" };

/** What Kvasir is asked, the same for a look-up and a download: the name trimmed, main where no revision is typed, and the patterns where there are any. */
export function askOf(d: DownloadDraft): LocalAsk {
  const ask: LocalAsk = { repo: d.repo.trim(), revision: d.revision.trim() || DEFAULT_REVISION };
  const include = patternsOf(d.include);
  if (include.length > 0) ask.include = include;
  return ask;
}

const NAME = /^[A-Za-z0-9._-]+$/u;

/** Why the dialog cannot look the model up yet, or null when it can. */
export function askRefusal(d: DownloadDraft): string | null {
  const repo = d.repo.trim();
  if (!repo) return "a model is named as the hub names it, owner/name";
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts.every((p) => NAME.test(p))) return "a model's name is owner/name, in letters, digits, dots, dashes and underscores";
  if (/\s/u.test(d.revision.trim())) return "a revision is a branch, a tag or a commit, with no spaces";
  const patterns = patternsOf(d.include);
  if (patterns.length > MOST_PATTERNS) return `at most ${MOST_PATTERNS} patterns`;
  if (patterns.some((p) => p.length > LONGEST_PATTERN)) return `a pattern is at most ${LONGEST_PATTERN} characters`;
  return null;
}

/** Exactly what a look-up asked, to compare with what the dialog shows now. */
export function fingerprint(d: DownloadDraft): string {
  return JSON.stringify(askOf(d));
}

/** A look-up that answered: what it asked, and what the hub lists for it. */
export interface Found {
  print: string;
  lookup: LocalLookup;
}

/** Whether Download is offered: a look-up answered for exactly the inputs shown, and found files to download. */
export function downloadable(d: DownloadDraft, found: Found | null): boolean {
  return found !== null && found.print === fingerprint(d) && found.lookup.files.length > 0 && askRefusal(d) === null;
}

/** Whether something changed since the look-up, which then asks to be run again. */
export function stale(d: DownloadDraft, found: Found | null): boolean {
  return found !== null && found.print !== fingerprint(d);
}

/** What a look-up found, said over its files. */
export function foundWords(l: LocalLookup): string {
  if (l.files.length === 0) {
    if (l.include.length === 0) return "The Hugging Face Hub lists no file for this model at that revision.";
    return `No file matches ${l.include.length === 1 ? l.include[0] : `any of ${l.include.join(", ")}`}.`;
  }
  const files = l.files.length === 1 ? "One file" : `${count(l.files.length)} files`;
  return `${files}, ${bytesWords(l.bytes_total)} in all, at ${revisionWords(l)}.`;
}

/** Where the room runs out: both sizes, and the two ways to make room. */
function noRoomWords(free: number, needed: number): string {
  return `There is not room for it where downloads go: ${bytesWords(free)} free, and it needs ${bytesWords(needed)}, 1 GiB of that to spare. Free some space there, or change where new downloads go.`;
}

/** Whether a download of this size fits where downloads go, with the room Kvasir keeps spare; null where the free space is not known. */
export function roomWords(total: number, free: number | null): { fits: boolean; words: string } | null {
  if (free === null) return null;
  const needed = total + SPARE_BYTES;
  return free >= needed ? { fits: true, words: `${bytesWords(free)} free where downloads go.` } : { fits: false, words: noRoomWords(free, needed) };
}

/** Kvasir's words as a sentence: a full stop at its end, and a capital at its start where it starts with a plain word rather than a file's name or a path. */
export function sentence(words: string): string {
  const t = words.trim();
  if (!t) return "";
  const first = t.split(/\s/u)[0];
  const s = /^[a-z]+[:,]?$/u.test(first) ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  return /[.!?]$/u.test(s) ? s : `${s}.`;
}

/** Why the location dialog cannot save yet: words where the path is not one Kvasir takes, nothing said where it is the location already, and null when it can. */
export function locationRefusal(typed: string, current: string): string | null {
  const t = typed.trim();
  if (!t) return "a location is a folder's path";
  if (!t.startsWith("/")) return "a location is an absolute path, starting at /";
  if (t === current) return "";
  return null;
}

/** A refusal of a look-up or a download in words a person can act on, by its code; Kvasir's own words for any other. */
export function refusalWords(r: LocalRefusal, at: { token: boolean; patterns: number }): string {
  if (r.code === "no_space" && r.free_bytes !== null && r.needed_bytes !== null) return noRoomWords(r.free_bytes, r.needed_bytes);
  if (r.code === "needs_token")
    return at.token
      ? "The Hugging Face Hub refused the token for this model. The token's account needs access to it, and a gated model needs its terms accepted on the hub."
      : "This model is gated or private, so it needs a Hugging Face token. Set one under Hugging Face token on the Kvasir page, then try again.";
  if (r.code === "conflict") return "This model is in the list already, at the same commit where downloads go. Resume it there, or remove it first to download it again.";
  if (r.code === "not_on_hub") return "The Hugging Face Hub has no such model at that revision. Check the name, as owner/name, and the revision.";
  if (r.code === "nothing_to_download")
    return at.patterns > 0
      ? "No file of this model matches the patterns. Change them, or leave them empty to download every file."
      : "The Hugging Face Hub lists no file for this model at that revision.";
  if (r.code === "hub") return `${sentence(r.message)} Try again in a moment.`;
  return sentence(r.message) || `Kvasir answered ${r.status}.`;
}

/** The bytes a model holds on disk: every byte once downloaded, and what it has so far before. */
export function heldBytes(m: LocalModel): number {
  return m.state === "done" ? m.bytes_total : m.bytes_done;
}

/** What removing a model lets go, said before it goes: its download, its files, and the room that comes back. */
export function removeWords(m: LocalModel): string[] {
  const held = heldBytes(m);
  const out: string[] = [];
  if (m.state === "downloading") out.push("Its download stops.");
  if (held > 0) out.push(`${m.state === "done" ? "Its files are" : "What it downloaded so far is"} deleted from ${m.path}, and ${bytesWords(held)} comes back.`);
  else out.push("Nothing of it is downloaded yet, so it only leaves the list.");
  if (m.state === "done") out.push("A model server started on these files can no longer read them.");
  return out;
}

/** What a download queued, said once the dialog closes. */
export function queuedWords(m: LocalModel): string {
  return `${m.repo} is queued: ${bytesWords(m.bytes_total)} in ${filesWords(m.files)}, into ${m.path}.`;
}

/** What a removal let go, said once it is done. */
export function removedWords(m: LocalModel): string {
  const held = heldBytes(m);
  return held > 0 ? `${m.repo} is removed, and ${bytesWords(held)} is free again.` : `${m.repo} is removed.`;
}

/** Where new downloads go, said once the location changed. */
export function movedWords(location: string): string {
  return `New downloads go to ${location} now.`;
}

// Record 24: a downloaded GGUF model started on the runtime, llama.cpp's server
// on this machine, which Kvasir loads the model into and follows.

/** How often the list is read again while a model loads into the runtime. */
export const START_POLL_MS = 2_000;

/** What the section says first: where its models run, by the runtime the install has. A Kvasir before record 24 says nothing of one, and the words are as they were. */
export function introWords(runtime: LocalRuntime | null | undefined): string {
  if (runtime === undefined) return "Models Kvasir downloads from the Hugging Face Hub, for a model server of yours to run.";
  if (runtime === null) return "Models Kvasir downloads from the Hugging Face Hub. Kvasir runs no model here: a model server of yours runs them.";
  return "Models Kvasir downloads from the Hugging Face Hub and starts on llama.cpp on this machine, one at a time.";
}

/** Said where the list is empty, by the runtime the install has. */
export function emptyWords(runtime: LocalRuntime | null | undefined): string {
  return runtime ? "No local model yet. Download a model in GGUF, then start it from its row." : "No local model yet. Download one, then start a model server on it.";
}

/** The runtime as the section names it: llama.cpp's build, and the archive it came from. */
export function runtimeLine(r: LocalRuntime): string {
  return `llama.cpp ${r.build}, ${r.variant}`;
}

/** Whether the runtime answers, as the tag beside it. */
export function runtimeTag(r: LocalRuntime): { tone: LocalTone; words: string } {
  return r.reachable ? { tone: "ok", words: "answers" } : { tone: "blocked", words: "does not answer" };
}

/** Said while the runtime does not answer. */
export const UNREACHABLE = "Kvasir does not reach llama.cpp on this machine, so no model starts or serves until it answers again.";

/** Said under the commands of a model Kvasir starts itself, folded under Or run it yourself. */
export const SELF_NOTE = "A model server started with one of these commands is added with Add a model.";

/** Said under the commands of a downloaded model Kvasir cannot start, on an install that runs llama.cpp for it. */
export const NOT_STARTABLE_NOTE = "Kvasir starts only a GGUF model: start a model server with one of these commands, then add it with Add a model.";

/** Whether a model is started on the runtime now: loading or serving. */
export function started(m: LocalModel): boolean {
  return m.run?.state === "starting" || m.run?.state === "serving";
}

/** Whether the list is read again sooner: while a model loads into the runtime. */
export function starting(models: LocalModel[]): boolean {
  return models.some((m) => m.run?.state === "starting");
}

/** The model the runtime loads or serves now, other than the one named: it runs one model at a time. */
export function runningBesides(models: LocalModel[], id: number): LocalModel | null {
  return models.find((m) => m.id !== id && started(m)) ?? null;
}

/** Every model's run in one line, to tell whether a run changed between two reads. */
export function runsKey(models: LocalModel[]): string {
  return models.map((m) => `${m.id}:${m.run?.state ?? "-"}:${m.run?.model ?? ""}`).join(",");
}

export type RunAction = "start" | "stop";

/** What a row offers on the runtime: Stop while the model loads or serves, Start for one Kvasir can start, and nothing where it cannot. */
export function runActionsOf(m: LocalModel): RunAction[] {
  if (started(m)) return ["stop"];
  return m.startable === true ? ["start"] : [];
}

const RUN_TAGS: Record<RunState, { tone: LocalTone; words: string }> = {
  starting: { tone: "brand", words: "loading" },
  serving: { tone: "ok", words: "serving" },
  stopped: { tone: "neutral", words: "stopped" },
  failed: { tone: "blocked", words: "did not start" },
};

/** The tag of a model's run; a state this desk does not know reads as Kvasir names it. */
export function runTag(run: LocalRun): { tone: LocalTone; words: string } {
  return RUN_TAGS[run.state] ?? { tone: "neutral", words: String(run.state) };
}

/** A serving model's line: the name it is served as, and the context and slots llama.cpp settled on. */
export function servingWords(run: LocalRun): string {
  const parts: string[] = [];
  if (run.context) parts.push(`${count(run.context)} tokens of context`);
  if (run.slots) parts.push(run.slots === 1 ? "one slot" : `${count(run.slots)} slots`);
  return parts.length > 0 ? `Serving as ${run.model}, with ${listWords(parts)}.` : `Serving as ${run.model}.`;
}

/**
 * Whether Kvasir admitted a serving model, read from the backend that serves
 * it: warming until its first answer, then as the models table says it, being
 * checked, admitted, or refused with the checks it failed. Null for a model
 * that does not serve, or before the backends are read.
 */
export function servedAdmission(run: LocalRun, backends: Backend[] | null, records: AdmissionRecord[] | null, now: number): Admission | null {
  if (run.state !== "serving" || backends === null) return null;
  const b = backends.find((x) => x.builtin !== true && x.locality === "local" && (x.models.includes(run.model) || (x.entries ?? []).some((e) => e.id === run.model)));
  if (!b) return { tone: "caution", words: "being added", detail: "Kvasir holds it as a model in your systems in a moment." };
  if (b.health.warming === true) return { tone: "caution", words: "warming", detail: "Kvasir checks it with its admission suite once it has answered." };
  return admissionWords(run.model, b, modelOf(b, run.model, []), records, { now, checking: false });
}

/** A refusal of a start in words a person can act on, by its code; Kvasir's own words for any other. */
export function startRefusalWords(r: LocalRefusal): string {
  if (r.code === "no_runtime") return "This install runs no llama.cpp for Kvasir to start a model on. Start a model server with one of the model's commands, then add it with Add a model.";
  if (r.code === "not_downloaded") return "This model is not downloaded yet. Start it once its download has finished.";
  if (r.code === "not_gguf") return "Kvasir starts only a GGUF model. Start a model server on these files with one of their commands, then add it with Add a model.";
  if (r.code === "runtime_unreachable") return "llama.cpp on this machine does not answer, so Kvasir could not start the model. Start it again once llama.cpp answers.";
  return sentence(r.message) || `Kvasir answered ${r.status}.`;
}

/** Said before a start that stops the model llama.cpp loads or serves now. */
export function replaceWords(next: LocalModel, running: LocalModel): string {
  return `llama.cpp runs one model at a time, so starting ${next.repo} stops ${running.repo}.`;
}

/** What a start began, said once Kvasir took it. */
export function startedWords(m: LocalModel): string {
  return `${m.repo} is loading into llama.cpp. Once it serves, Kvasir checks it with its admission suite before the assistant uses it.`;
}

/** What a stop did, said once Kvasir took it. */
export function stoppedWords(m: LocalModel): string {
  return `${m.repo} is stopped, and llama.cpp holds no memory for it any more.`;
}

/** Said in place of removing a model llama.cpp loads or serves. */
export function stopFirstWords(m: LocalModel): string {
  return `${m.repo} is started on llama.cpp. Stop it first, then remove it.`;
}

// Record 25: a download is one of Add a model's choices, where a GGUF model's
// file is chosen by its quantization, and a local model is a card among the
// models, with the machine, where downloads go and the token on one line.

/** What Add a model says of downloading, by the runtime the install has. */
export function downloadChoiceWords(runtime: LocalRuntime | null | undefined): string {
  return runtime
    ? "A GGUF model from the Hugging Face Hub, started by Kvasir on llama.cpp here. Prompts stay in your systems."
    : "A model from the Hugging Face Hub, for a model server of yours to run. Prompts stay in your systems.";
}

/** Said under the files a download brings. */
export const CHECKED_BEFORE = "Kvasir checks the model before the assistant may use it.";

/** A file of a GGUF model to choose, by its quantization: every part of a split file together, with its size in all. */
export interface FileChoice {
  key: string;
  label: string;
  paths: string[];
  bytes: number;
}

const SPLIT = /-\d{5}-of-\d{5}(?=\.gguf$)/iu;
const QUANT = /(?:^|[-_.])((?:UD-)?(?:I?Q\d(?:_[A-Z0-9]+)*|B?F(?:16|32)|MXFP4(?:_MOE)?))(?=[-_.]|$)/giu;
const stemOf = (path: string) => (path.split("/").pop() ?? path).replace(/\.gguf$/iu, "");

/** The quantization a GGUF file's name carries, such as Q4_K_M; its name where it carries none. */
export function quantizationOf(path: string): string {
  const found = [...stemOf(path).matchAll(QUANT)];
  return found.length > 0 ? found[found.length - 1][1] : stemOf(path);
}

/** The GGUF files a look-up found, one choice a quantization with all its parts, smallest first; a vision projector is not a model to choose. */
export function fileChoices(files: LocalFile[]): FileChoice[] {
  const groups = new Map<string, FileChoice>();
  for (const f of files) {
    if (!/\.gguf$/iu.test(f.path) || /^mmproj/iu.test(stemOf(f.path))) continue;
    const key = f.path.replace(SPLIT, "");
    const g = groups.get(key) ?? { key, label: quantizationOf(key), paths: [], bytes: 0 };
    g.paths.push(f.path);
    g.bytes += f.size;
    groups.set(key, g);
  }
  const out = [...groups.values()].sort((a, b) => a.bytes - b.bytes || a.key.localeCompare(b.key));
  // two files of one quantization are told apart by their names
  return out.map((c) => (out.filter((x) => x.label === c.label).length > 1 ? { ...c, label: stemOf(c.key) } : c));
}

/** Whether a file fits the machine's card, as the tag beside it says; null where the card is not known. */
export function fitWords(bytes: number, card: { memory_gb: number } | null | undefined): { tone: LocalTone; words: string } | null {
  if (!card || !(card.memory_gb > 0)) return null;
  return bytes <= card.memory_gb * 2 ** 30 ? { tone: "ok", words: "fits the card" } : { tone: "caution", words: "larger than the card: runs on the processor, slowly" };
}

/** The file a look-up opens on: Q4_K_M where it fits, else the largest that fits a card that is known, else none until one is chosen. */
export function defaultChoice(choices: FileChoice[], card: { memory_gb: number } | null | undefined): string | null {
  const known = fitWords(0, card) !== null;
  const fitting = known ? choices.filter((c) => fitWords(c.bytes, card)?.tone === "ok") : choices;
  const usual = fitting.find((c) => c.label.toUpperCase() === "Q4_K_M");
  if (usual) return usual.key;
  return known && fitting.length > 0 ? fitting[fitting.length - 1].key : null;
}

/** What Download asks Kvasir once a look-up answered for what the dialog shows: the chosen file of a GGUF model, else every file the patterns choose; null before it may download. */
export function downloadAsk(d: DownloadDraft, found: Found | null, chosen: string | null): LocalAsk | null {
  if (!found || !downloadable(d, found)) return null;
  const choices = fileChoices(found.lookup.files);
  if (choices.length === 0) return askOf(d);
  const file = choices.find((c) => c.key === chosen);
  return file ? { ...askOf(d), include: file.paths } : null;
}

/** The bytes a download brings: the chosen file's, or every file the look-up found. */
export function askedBytes(lookup: LocalLookup, chosen: string | null): number {
  return fileChoices(lookup.files).find((c) => c.key === chosen)?.bytes ?? lookup.bytes_total;
}

/** A local model's name on its card: the name llama.cpp serves it as once started, else its name on the hub. */
export function localName(m: LocalModel): string {
  return started(m) && m.run?.model ? m.run.model : m.repo;
}

/** A local model's line under its name: this machine, and what it is there for. */
export function localMeta(m: LocalModel): string {
  if (m.run?.state === "serving") return ["This machine", "llama.cpp", m.run.context ? `${count(m.run.context)} tokens` : null].filter(Boolean).join(" · ");
  if (m.run?.state === "starting") return "This machine · llama.cpp";
  if (m.state !== "done") return "This machine · from the Hugging Face Hub";
  return m.startable === true ? "This machine · starts on llama.cpp" : "This machine · for a model server of yours";
}

/** The tag a local model's card carries: how it runs once started, else where its download stands. */
export function localTag(m: LocalModel): { tone: LocalTone; words: string } {
  return m.run && m.run.state !== "stopped" ? runTag(m.run) : modelTag(m.state);
}

/** The local models in the order their cards stand: the one llama.cpp loads or serves first, then the rest as Kvasir lists them. */
export function localOrder(models: LocalModel[]): LocalModel[] {
  return [...models.filter(started), ...models.filter((m) => !started(m))];
}

/** Where downloads go and the room there, on the line under the cards. */
export function roomLine(free: number | null): string {
  return free === null ? "the free space there is not known" : `${bytesWords(free)} free`;
}
