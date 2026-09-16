// SPDX-License-Identifier: AGPL-3.0-only
// The verbs the engine queues, in a person's words: one table the Now cards
// of the Data page and the Pipelines page read, so a job of any verb is
// named the same wherever it shows. Each verb has what it is doing, what it
// is as a thing, the word to its target, its icon, the grant that cancels or
// queues it again with the page that grant is work on, and its next move
// once it stopped. A job's command line is read from what the engine
// recorded as queued where it does, else from its argv with the worker's own
// binary and registry stripped, so a card never reads the binary as a verb.

import type { JobRow } from "../ask/client";
import type { Grant } from "../grants";
import type { IconName } from "../ui/Icon";

export interface VerbWords {
  /** What the job is doing, before its target: "Pseudonymising". */
  doing: string;
  /** The job as a thing: "pseudonymisation". */
  noun: string;
  /** The word between the noun and its target: "digest of", "map import for", "sort with". */
  link: "of" | "for" | "with";
  /** Whether the job's own name stands for what it acts on when its command line names nothing. */
  named: boolean;
  icon: IconName;
  /** The grant that cancels it or queues it again, and the page that grant is work on. */
  grant: Grant;
  page: string;
  /** The next move once it stopped, the same command again; null for a verb that is not simply run again. */
  again: string | null;
}

const data = { grant: "data:work" as Grant, page: "the Data page" };
const pipelines = { grant: "pipelines:work" as Grant, page: "the Pipelines page" };
const release = { grant: "release:work" as Grant, page: "the Release page" };
const database = { grant: "database:work" as Grant, page: "the Database page" };
const query = { grant: "query:work" as Grant, page: "the Query page" };

/** Every verb the door queues, by its verb or its two-word verb. */
export const VERBS: Record<string, VerbWords> = {
  pseudonymize: { doing: "Pseudonymising", noun: "pseudonymisation", link: "of", named: true, icon: "shield", ...data, again: "Pseudonymise again" },
  "bring-in": { doing: "Bringing in", noun: "bring-in", link: "of", named: true, icon: "play", ...data, again: "Bring in again" },
  digest: { doing: "Digesting", noun: "digest", link: "of", named: true, icon: "play", ...data, again: "Read again" },
  ingest: { doing: "Digesting", noun: "digest", link: "of", named: true, icon: "play", ...data, again: "Read again" },
  fingerprint: { doing: "Fingerprinting", noun: "fingerprint", link: "of", named: true, icon: "branch", ...pipelines, again: "Sort again" },
  classify: { doing: "Sorting", noun: "sort", link: "with", named: true, icon: "branch", ...pipelines, again: "Sort again" },
  pick: { doing: "Picking from", noun: "pick", link: "of", named: true, icon: "branch", ...pipelines, again: "Pick again" },
  session: { doing: "Building the sessions of", noun: "session build", link: "of", named: true, icon: "branch", ...pipelines, again: "Build again" },
  pyramid: { doing: "Building pyramids for", noun: "pyramid build", link: "for", named: true, icon: "layers", ...pipelines, again: "Build again" },
  release: { doing: "Releasing", noun: "release", link: "of", named: true, icon: "release", ...release, again: "Release again" },
  handover: { doing: "Handing over", noun: "handover", link: "of", named: true, icon: "release", ...release, again: "Hand over again" },
  "linkage import": { doing: "Filing the map for", noun: "map import", link: "for", named: true, icon: "key", ...data, again: "File again" },
  "linkage merge": { doing: "Merging subjects", noun: "merge", link: "of", named: false, icon: "key", ...data, again: "Merge again" },
  // a vault that stopped moved what it moved and left the rest: the same command goes on from there, which is why it has a next move where the purge has none
  "originals vault": { doing: "Vaulting the originals of", noun: "vaulting", link: "of", named: true, icon: "lock", ...data, again: "Vault the rest" },
  "originals purge": { doing: "Purging the originals of", noun: "purge", link: "of", named: true, icon: "alert", ...data, again: null },
  originals: { doing: "Acting on the originals of", noun: "originals", link: "of", named: true, icon: "lock", ...data, again: null },
  backup: { doing: "Backing up", noun: "backup", link: "of", named: false, icon: "disk", ...database, again: "Back up again" },
  verify: { doing: "Checking", noun: "check", link: "of", named: false, icon: "disk", ...database, again: "Check again" },
  restore: { doing: "Restoring", noun: "restore", link: "of", named: false, icon: "disk", ...database, again: "Restore again" },
  "ask run": { doing: "Running a question over", noun: "question", link: "of", named: true, icon: "search", ...query, again: "Run again" },
  "ask promote": { doing: "Promoting the subjects of", noun: "promotion", link: "of", named: true, icon: "users", ...data, again: null },
  probe: { doing: "Probing the shapes of", noun: "probe", link: "of", named: true, icon: "search", ...data, again: null },
  synth: { doing: "Making up data for", noun: "synthesis", link: "for", named: true, icon: "play", ...data, again: "Make again" },
  worker: { doing: "Keeping the queue", noun: "queue worker", link: "of", named: false, icon: "play", ...pipelines, again: null },
};

/** A verb the table does not know, in the plainest words. */
function unknown(verb: string): VerbWords {
  return { doing: `Running ${verb} on`, noun: verb, link: "of", named: true, icon: "play", ...pipelines, again: "Run again" };
}

const words = (v: unknown): string[] | null => (Array.isArray(v) && v.every((w) => typeof w === "string") ? (v as string[]) : null);

/**
 * The command line as queued: what the engine recorded as `queued` where it
 * does, else the argv, which the worker rewrites with its own binary and
 * `--registry <dir>` in front when it runs the job; both are stripped so the
 * verb comes first.
 */
export function commandOf(job: Pick<JobRow, "args">): string[] {
  const args = (job.args ?? {}) as Record<string, unknown>;
  const queued = words(args.queued);
  if (queued && queued.length > 0) return queued;
  let argv = words(args.argv) ?? [];
  if (argv.length > 0 && (argv[0].includes("/") || argv[0] === "nils" || argv[0].endsWith(".exe"))) argv = argv.slice(1);
  for (;;) {
    if (argv[0] === "--registry" || argv[0] === "--home") argv = argv.slice(2);
    else if (argv[0]?.startsWith("--registry=") || argv[0]?.startsWith("--home=")) argv = argv.slice(1);
    else break;
  }
  return argv;
}

/**
 * The verb, or the two-word verb of `ask`, `linkage` and `clinical`; `ingest
 * probe` is the probe; an act on a dataset's originals is named by the act its
 * line carries, wherever on the line it stands, and by the bare verb where the
 * line carries none; the queue's own worker is the worker.
 */
export function verbOf(job: Pick<JobRow, "args" | "kind">): string {
  if (job.kind === "worker") return "worker";
  const c = commandOf(job);
  const first = c[0] ?? job.kind;
  if ((first === "ask" || first === "linkage" || first === "clinical") && c[1]) return `${first} ${c[1]}`;
  if (first === "originals") {
    const did = c.find((a) => a === "vault" || a === "purge");
    return did ? `originals ${did}` : "originals";
  }
  if (first === "ingest" && c[1] === "probe") return "probe";
  return first;
}

/** The verb's words, from the table or the plainest for one it does not know. */
export function wordsOf(job: Pick<JobRow, "args" | "kind">): VerbWords {
  return VERBS[verbOf(job)] ?? unknown(verbOf(job));
}

/**
 * What the job acts on: the location its command line names, without the @
 * and the tree; else the name or the pack it names; else the job's own name
 * for a verb whose name is its target, unless the name only repeats the verb.
 */
export function targetOf(job: Pick<JobRow, "args" | "kind" | "name">): string | null {
  const c = commandOf(job);
  const at = c.find((a) => a.startsWith("@"));
  if (at) return at.slice(1).replace(/\/(dcm-anon|dcm-original)$/u, "") || null;
  const named = c.indexOf("--name");
  if (named >= 0 && c[named + 1]) return c[named + 1];
  const pack = c.indexOf("--pack");
  if (pack >= 0 && c[pack + 1]) return c[pack + 1];
  const w = wordsOf(job);
  if (!w.named || !job.name) return null;
  const verb = verbOf(job);
  if (job.name === verb || verb.split(" ").includes(job.name) || job.name === w.noun) return null;
  return job.name;
}

/** What a job is doing, with its target: "Pseudonymising incoming", "Filing the map for north", "Backing up". */
export function doingWords(job: Pick<JobRow, "args" | "kind" | "name">): string {
  const w = wordsOf(job);
  const target = targetOf(job);
  return target ? `${w.doing} ${target}` : w.doing;
}

/** A job that ended, as a title: "Digest of ct-lab stopped", "Map import for north stopped", "Merge done". */
export function endedWords(job: Pick<JobRow, "args" | "kind" | "name">, ended: "stopped" | "done" | "cancelled"): string {
  const w = wordsOf(job);
  const target = targetOf(job);
  const noun = w.noun.charAt(0).toUpperCase() + w.noun.slice(1);
  return `${noun}${target ? ` ${w.link} ${target}` : ""} ${ended}`;
}

/** The grant a job's cancel needs, and the page that grant is work on. */
export function cancelNeeds(job: Pick<JobRow, "args" | "kind">): [Grant, string] {
  const w = wordsOf(job);
  return [w.grant, w.page];
}

/** The next move once a job stopped: the same command queued again, without a `--restart`, for a verb that is simply run again. */
export function nextMove(job: Pick<JobRow, "args" | "kind">): { label: string; command: string[] } | null {
  const w = wordsOf(job);
  const command = commandOf(job).filter((a) => a !== "--restart");
  if (w.again === null || command.length === 0) return null;
  return { label: w.again, command };
}
