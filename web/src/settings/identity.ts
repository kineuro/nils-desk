// SPDX-License-Identifier: AGPL-3.0-only
// The Identity page's doors and words (Wave 4c section 5, Wave 5 section
// 10.5, record 25): how people sign in, the groups an admin names and the
// pages each gives, the people and what their groups and their own grants
// add up to, when each last signed in, and where the desk answers. The words
// are kept short; the whole of a fact goes where a person hovers or opens it.

import { DoorError, door } from "../ask/client";
import type { Capabilities } from "../capabilities";
import { DETAILS, GRANTS, isGrant, type Detail, type Grant } from "../grants";
import type { Stat } from "./stats";

/** A person as the older door lists them; Setup and the overview still read it. */
export interface DeskUser {
  username: string;
  display: string;
  entitlements: string[];
  admin: boolean;
  last_seen: string | null;
}

export interface Users {
  users: DeskUser[];
  entitlements: string[];
  sessions_open?: number;
}

/** A group's id, as the desk hands it out. */
export type GroupId = number | string;

/** A group an admin names: the pages it gives, how much of a record its people see, and under oidc the provider's groups it follows. */
export interface Group {
  id: GroupId;
  name: string;
  grants: Grant[];
  detail: Detail;
  follows: string[];
  /** The people put in it, by subject; those who reach it through the provider's groups are not among them. */
  members: string[];
}

/** A person as the access door lists them: their groups, what an admin gave them alone, and what all of it adds up to. */
export interface Person {
  subject: string;
  display: string;
  /** The groups the person was put in. */
  groups: GroupId[];
  /** The groups the person reaches through the provider's groups; the desk keeps them apart from the ones they were put in. */
  followed: GroupId[];
  /** Given to this person alone, on top of their groups. */
  grants: Grant[];
  detail: Detail | null;
  access: { grants: Grant[]; detail: Detail };
  last_seen_at: string | null;
  sessions_open: number;
}

export interface Access {
  mode: "off" | "local" | "oidc";
  sessions_open: number;
  people: Person[];
}

/** What a group is made or changed with. */
export interface GroupBody {
  name: string;
  grants: Grant[];
  detail: Detail;
  follows: string[];
}

/** What a person is given: the groups they are put in, and what is theirs alone on top. */
export interface AccessBody {
  groups: GroupId[];
  grants: Grant[];
  detail: Detail | null;
}

const groupPath = (id: GroupId) => `/desk/groups/${encodeURIComponent(String(id))}`;

export const identity = {
  users: () => door<Users>("GET", "/desk/users"),
  groups: () => door<{ groups: Group[] }>("GET", "/desk/groups").then((r) => r.groups),
  access: () => door<Access>("GET", "/desk/access"),
  add: (body: AccessBody & { username: string; password: string; display: string }) => door<Person>("POST", "/desk/users", body),
  setAccess: (subject: string, body: AccessBody) => door<Person>("PUT", `/desk/access/${encodeURIComponent(subject)}`, body),
  makeGroup: (body: GroupBody) => door<Group>("POST", "/desk/groups", body),
  setGroup: (id: GroupId, body: GroupBody) => door<Group>("PUT", groupPath(id), body),
  removeGroup: (id: GroupId) => door<Record<string, never>>("DELETE", groupPath(id)),
};

/** How far a person goes on a page: hidden, see, or work, which includes see; the assistant is used. */
export type Level = "hidden" | "see" | "work" | "use";

/** A page a grant names. */
export type PageId = "assistant" | "query" | "data" | "review" | "release" | "pipelines" | "models" | "campaigns" | "install" | "kvasir" | "assistant-settings" | "places" | "database" | "identity" | "audit";

export interface PageLine {
  id: PageId;
  /** On its line in the form and on the profile. */
  title: string;
  /** On a mark. */
  mark: string;
  /** Inside a sentence. */
  named: string;
  /** One of the pages under Settings. */
  settings: boolean;
  /** Its levels, lowest first. */
  levels: readonly Level[];
  /** What seeing it opens, or using it for the assistant, in a few words. */
  see: string;
  /** What working there adds, in a few words. */
  work?: string;
  /** Granted before its page is built: never named as hidden, and not needed for Every page. */
  soon?: boolean;
}

const SEE_WORK: readonly Level[] = ["hidden", "see", "work"];

/** A line for each page, in the order the form and the profile draw them. */
export const PAGE_LINES: readonly PageLine[] = [
  { id: "assistant", title: "Assistant", mark: "Assistant", named: "Assistant", settings: false, levels: ["hidden", "use"], see: "Chat with the assistant" },
  { id: "query", title: "Query", mark: "Query", named: "Query", settings: false, levels: SEE_WORK, see: "Ask, run and chart questions", work: "keep cards, queue ask jobs" },
  { id: "data", title: "Data", mark: "Data", named: "Data", settings: false, levels: SEE_WORK, see: "Sources and batches", work: "bring DICOM in, run digests" },
  { id: "review", title: "Review", mark: "Review", named: "Review", settings: false, levels: SEE_WORK, see: "What waits for a person", work: "decide, tune rules" },
  { id: "release", title: "Release", mark: "Release", named: "Release", settings: false, levels: SEE_WORK, see: "Releases made", work: "make and hand over" },
  { id: "pipelines", title: "Pipelines", mark: "Pipelines", named: "Pipelines", settings: false, levels: SEE_WORK, see: "Runs and results", work: "start and cancel runs" },
  { id: "models", title: "Models", mark: "Models", named: "Models", settings: false, levels: SEE_WORK, see: "Registered classifier models", work: "register, admit, promote" },
  { id: "campaigns", title: "Campaigns", mark: "Campaigns", named: "Campaigns", settings: false, levels: SEE_WORK, see: "Annotation and curation campaigns", work: "claim, answer, export" },
  { id: "install", title: "The install", mark: "Install", named: "the install", settings: true, levels: SEE_WORK, see: "Overview, parts, setup", work: "restart, update" },
  { id: "kvasir", title: "Kvasir", mark: "Kvasir", named: "Kvasir", settings: true, levels: SEE_WORK, see: "Stations and models", work: "models, keys, stations" },
  { id: "assistant-settings", title: "The assistant's settings", mark: "Assistant settings", named: "the assistant's settings", settings: true, levels: SEE_WORK, see: "Reach and memory", work: "instructions, standing grants" },
  { id: "places", title: "Places", mark: "Places", named: "Places", settings: true, levels: SEE_WORK, see: "Scan and export places", work: "add, change" },
  { id: "database", title: "Database", mark: "Database", named: "Database", settings: true, levels: SEE_WORK, see: "Archives and schedule", work: "back up, check" },
  { id: "identity", title: "Identity", mark: "Identity", named: "Identity", settings: true, levels: SEE_WORK, see: "People and groups", work: "add, change" },
  { id: "audit", title: "Audit", mark: "Audit", named: "Audit", settings: true, levels: ["hidden", "see"], see: "Who did what, when" },
];

export const LEVEL_WORDS: Record<Level, string> = { hidden: "Hidden", see: "See", work: "Work", use: "Use" };

/** How much of a record a person sees: the choice in the form, a short tag elsewhere, the whole of it on hover, and a phrase for the form's sentence. Identifying details are the engine's quasi-identifying class, and everything adds the sensitive class. */
export const RECORD_WORDS: Record<Detail, { choice: string; short: string; says: string; phrase: string }> = {
  plain: { choice: "Without identifying details", short: "Non-identifying", says: "No dates, subject codes, sex or age, scanner names or series descriptions.", phrase: "without identifying details" },
  quasi: { choice: "With identifying details", short: "Identifying", says: "Dates, subject codes, sex and age, scanner names and series and protocol descriptions.", phrase: "with identifying details" },
  sensitive: { choice: "Everything", short: "Everything", says: "Identifying details, sensitive events, raw identifiers and burned-in annotation.", phrase: "with every detail" },
};

/** A page's words in the form: what seeing it opens, then what work adds. */
export function lineWords(line: PageLine): string {
  return line.work ? `${line.see} · work: ${line.work}` : line.see;
}

/** A page's words on a person's own profile, for the level they hold. */
export function yourWords(line: PageLine, level: Level): string {
  return level === "work" && line.work ? `${line.see} · ${line.work}` : line.see;
}

function rank(line: PageLine, level: Level): number {
  return line.levels.indexOf(level);
}

const detailRank = (d: Detail) => DETAILS.indexOf(d);

/** How far a list of grants goes on a page; work on a page holds see there too. */
export function levelOf(grants: readonly string[], line: PageLine): Level {
  for (let i = line.levels.length - 1; i > 0; i--) if (grants.includes(`${line.id}:${line.levels[i]}`)) return line.levels[i];
  return "hidden";
}

/** The grants a level on a page stands for: none when hidden, else its one grant. */
export function grantsAt(line: PageLine, level: Level): Grant[] {
  if (level === "hidden" || rank(line, level) < 0) return [];
  const g = `${line.id}:${level}`;
  return isGrant(g) ? [g] : [];
}

export type Levels = Record<PageId, Level>;

/** Each page's level in a list of grants. */
export function levelsOf(grants: readonly string[]): Levels {
  return Object.fromEntries(PAGE_LINES.map((l) => [l.id, levelOf(grants, l)])) as Levels;
}

/** The grants a choice page by page stands for, in the vocabulary's order. */
export function grantsOf(levels: Partial<Levels>): Grant[] {
  const chosen = new Set(PAGE_LINES.flatMap((l) => grantsAt(l, levels[l.id] ?? "hidden")));
  return GRANTS.filter((g) => chosen.has(g));
}

/** The higher of two levels on a page. */
export function higher(line: PageLine, a: Level, b: Level): Level {
  return rank(line, a) >= rank(line, b) ? a : b;
}

/** Whether a level on a page is below what a person's groups give, and so cannot be chosen for them. */
export function locked(line: PageLine, level: Level, given: Level): boolean {
  return rank(line, level) < rank(line, given);
}

/** Whether a detail is below what a person's groups give. */
export function detailLocked(detail: Detail, given: Detail): boolean {
  return detailRank(detail) < detailRank(given);
}

/** The highest of some details; plain when there are none. */
export function highestDetail(details: readonly Detail[]): Detail {
  return details.reduce<Detail>((top, d) => (detailRank(d) > detailRank(top) ? d : top), "plain");
}

/** Whether two group ids name the same group, however the desk spelled them. */
export function sameGroup(a: GroupId, b: GroupId): boolean {
  return String(a) === String(b);
}

/** The groups a list of ids names, in the order the desk lists them. */
export function groupsOf(ids: readonly GroupId[], all: readonly Group[]): Group[] {
  return all.filter((g) => ids.some((id) => sameGroup(id, g.id)));
}

/** The groups that give a person what they have: the ones they were put in and the ones the provider's groups reach. */
export function groupsGiving(p: { groups: readonly GroupId[]; followed?: readonly GroupId[] }, all: readonly Group[]): Group[] {
  return groupsOf([...p.groups, ...(p.followed ?? [])], all);
}

/** The groups a person reaches only through the provider's groups. */
export function followedOnly(p: { groups: readonly GroupId[]; followed?: readonly GroupId[] }, all: readonly Group[]): Group[] {
  return groupsOf(
    (p.followed ?? []).filter((id) => !p.groups.some((m) => sameGroup(m, id))),
    all,
  );
}

/** What groups give on a page: the highest level any of them gives, and the names of the groups that give it. */
export function givenBy(groups: readonly Group[], line: PageLine): { level: Level; from: string[] } {
  let level: Level = "hidden";
  let from: string[] = [];
  for (const g of groups) {
    const l = levelOf(g.grants, line);
    if (l === "hidden") continue;
    if (rank(line, l) > rank(line, level)) {
      level = l;
      from = [g.name];
    } else if (l === level) from.push(g.name);
  }
  return { level, from };
}

/** How much of a record groups give: the highest detail, and the names of the groups that give it. */
export function detailGivenBy(groups: readonly Group[]): { detail: Detail; from: string[] } {
  const detail = highestDetail(groups.map((g) => g.detail));
  return { detail, from: groups.filter((g) => g.detail === detail).map((g) => g.name) };
}

/** What groups and a person's own grants add up to: every grant any of them gives, and the highest detail. Nothing takes away what a group gives. */
export function addUp(groups: readonly Group[], own: { grants: readonly string[]; detail: Detail | null }): { grants: Grant[]; detail: Detail } {
  const all = new Set<string>([...groups.flatMap((g) => g.grants), ...own.grants]);
  return { grants: GRANTS.filter((g) => all.has(g)), detail: highestDetail([...groups.map((g) => g.detail), ...(own.detail ? [own.detail] : [])]) };
}

/** What is a person's alone once their groups are chosen: the pages set above what the groups give, and the detail where it goes higher. */
export function ownAbove(groups: readonly Group[], levels: Partial<Levels>, detail: Detail | null): { grants: Grant[]; detail: Detail | null } {
  const above: Partial<Levels> = {};
  for (const line of PAGE_LINES) {
    const want = levels[line.id] ?? "hidden";
    if (rank(line, want) > rank(line, givenBy(groups, line).level)) above[line.id] = want;
  }
  const floor = detailGivenBy(groups).detail;
  return { grants: grantsOf(above), detail: detail !== null && detailRank(detail) > detailRank(floor) ? detail : null };
}

/** The pages a person holds above what their groups give: theirs alone. */
export function ownPages(own: readonly string[], groups: readonly Group[]): Set<PageId> {
  return new Set(PAGE_LINES.filter((l) => rank(l, levelOf(own, l)) > rank(l, givenBy(groups, l).level)).map((l) => l.id));
}

/** Whether a person's own detail goes above what their groups give. */
export function ownDetailAbove(own: Detail | null, groups: readonly Group[]): boolean {
  return own !== null && detailRank(own) > detailRank(detailGivenBy(groups).detail);
}

/** What a change to a person sends: the groups they are put in, never the ones the provider's groups reach, and what is theirs alone above every group that gives them anything. */
export function personBody(chosen: readonly GroupId[], followed: readonly GroupId[], all: readonly Group[], levels: Partial<Levels>, detail: Detail | null): AccessBody {
  return { groups: groupsOf(chosen, all).map((g) => g.id), ...ownAbove(groupsGiving({ groups: chosen, followed }, all), levels, detail) };
}

export interface Mark {
  key: string;
  label: string;
  /** Worked there, or the assistant used: drawn filled. */
  work: boolean;
  /** Given to a person alone: drawn dashed. */
  own: boolean;
}

/** Pages as marks: a page seen draws an outline, a page worked filled, one given to a person alone dashed. The pages, or the settings, all held at their top and none a person's own are one mark; a page not built yet keeps its own mark unless it is held that way too. */
export function marksOf(grants: readonly string[], own: ReadonlySet<PageId> = new Set()): Mark[] {
  const out: Mark[] = [];
  const full = (l: PageLine) => levelOf(grants, l) === l.levels[l.levels.length - 1] && !own.has(l.id);
  const mark = (l: PageLine) => {
    const level = levelOf(grants, l);
    if (level !== "hidden") out.push({ key: l.id, label: l.mark, work: level === "work" || level === "use", own: own.has(l.id) });
  };
  for (const settings of [false, true]) {
    const lines = PAGE_LINES.filter((l) => l.settings === settings);
    const soon = lines.filter((l) => l.soon);
    if (lines.every((l) => l.soon || full(l))) {
      out.push({ key: settings ? "settings" : "pages", label: settings ? "Every setting" : "Every page", work: true, own: false });
      if (!soon.every(full)) soon.forEach(mark);
      continue;
    }
    lines.forEach(mark);
  }
  return out;
}

/** How many people are in a group: the people put in it, and those who reach it through the provider's groups. */
export function memberCount(group: Group, people: readonly Person[] | null): number {
  const subjects = new Set(group.members ?? []);
  for (const p of people ?? []) if (groupsGiving(p, [group]).length > 0) subjects.add(p.subject);
  return subjects.size;
}

/** "A", "A and B", "A, B and C". */
export function andWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** A count with its noun. */
export function countWords(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

export interface Summary {
  kind: "person" | "group";
  /** A person's name shown or username, or a group's name; empty while it is typed. */
  name: string;
  /** What it adds up to. */
  grants: readonly string[];
  detail: Detail;
}

/** The sentence under the form: the pages the person, or the group's people, see, where they work, and how much of a record. */
export function summaryWords(s: Summary): string {
  const person = s.kind === "person";
  const name = s.name.trim();
  const who = person ? name || "This person" : `People in ${name || "this group"}`;
  const [sees, works] = person ? ["sees", "works"] : ["see", "work"];
  const open = PAGE_LINES.filter((l) => levelOf(s.grants, l) !== "hidden").map((l) => l.named);
  if (open.length === 0) return `${who} ${sees} no page yet.`;
  const worked = PAGE_LINES.filter((l) => levelOf(s.grants, l) === "work").map((l) => l.named);
  return `${who} ${sees} ${andWords(open)}${worked.length > 0 ? `, ${works} in ${andWords(worked)}` : ""}, ${RECORD_WORDS[s.detail].phrase}.`;
}

/** The provider's groups a group follows, as typed: split at commas and new lines, each once. */
export function followsOf(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]/u)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  ];
}

/** A group made or changed, checked before the door is asked. */
export function groupRefusal(name: string, groups: readonly Group[], id: GroupId | null): string | null {
  const n = name.trim();
  if (!n) return "a group has a name";
  if (groups.some((g) => g.name.toLowerCase() === n.toLowerCase() && (id === null || !sameGroup(g.id, id)))) return `a group named ${n} exists`;
  return null;
}

/** A grant as the desk spells it in an error, never shown to a person. */
const GRANT_WORD = /\b[a-z][a-z-]*:[a-z]+\b/u;

/** What the desk said in an error, when it is words a person may be shown. */
function saidOf(e: DoorError): string | null {
  const body = (e.body ?? {}) as { error?: unknown };
  const said = typeof body.error === "string" ? body.error.trim() : "";
  if (!said || GRANT_WORD.test(said)) return null;
  return `${said[0].toUpperCase()}${said.slice(1)}${/[.!?]$/u.test(said) ? "" : "."}`;
}

/** A door's refusal of a change to people or groups, in a few plain words. */
export function refusalWords(e: unknown, what: "person" | "group"): string {
  if (e instanceof DoorError) {
    const body = (e.body ?? {}) as { error?: unknown };
    const raw = typeof body.error === "string" ? body.error : "";
    if (e.status === 401) return "Session ended. Sign in again.";
    if (e.status === 409) return "Refused: nobody would be left who may change people and groups.";
    if (e.status === 404) return what === "person" ? "This person is gone. Reload the page." : "This group is gone. Reload the page.";
    if (e.status === 403) return "You may not change people and groups.";
    if (e.status === 400 && ((/unknown/iu.test(raw) && /grant|group/iu.test(raw)) || GRANT_WORD.test(raw))) return "Unknown group or page. Reload the page.";
    return saidOf(e) ?? `The desk answered ${e.status}.`;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Why the people and groups could not be read, in a few plain words. */
export function readWords(e: unknown): string {
  if (e instanceof DoorError) {
    if (e.status === 401) return "Session ended. Sign in again.";
    if (e.status === 403) return "You may not see people and groups.";
    if (e.status === 404) return "No people or groups here. Reload the page.";
    return saidOf(e) ?? `Could not read people and groups: the desk answered ${e.status}.`;
  }
  return e instanceof Error ? e.message : String(e);
}

/** When a person last signed in, as a person says it. */
export function lastSeenWords(iso: string | null, now: number): string {
  if (!iso) return "never";
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 5) return "now";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** When a person last signed in, or now while a session of theirs is open. */
export function seenWords(p: Pick<Person, "last_seen_at" | "sessions_open">, now: number): string {
  return p.sessions_open > 0 ? "now" : lastSeenWords(p.last_seen_at, now);
}

/** How long a session lasts, and how many are open when that is known. */
export function sessionWords(hours: number, open: number | null): string {
  return open === null ? `${hours} h sessions` : `${hours} h sessions, ${open} open`;
}

/** How people sign in, as one value. */
export const SIGN_IN: Record<"off" | "local" | "oidc", string> = { off: "No sign-in", local: "Local accounts", oidc: "Single sign-on" };

/** How people sign in, the three ways a desk can be set up, as Setup words them. */
export const MODES: { id: "off" | "local" | "oidc"; title: string; words: string }[] = [
  { id: "off", title: "Nobody signs in", words: "One person on this machine. Whoever opens the desk sees every page and may do everything." },
  { id: "local", title: "The desk keeps the people", words: "Usernames and passwords held by the desk. The engine trusts what the desk signs." },
  { id: "oidc", title: "An identity provider", words: "Single sign-on through your provider. The desk's groups follow its groups, and the parts trust what the desk signs." },
];

/** The host of an address, or the address itself when it is not one. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const LOOPBACK = /^[a-z]+:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i;

/** Where the desk answers: only this machine, or a network. */
export function reachWords(origin: string): { local: boolean; words: string } {
  const local = LOOPBACK.test(origin);
  return { local, words: local ? "Only this machine" : `This network, at ${origin}` };
}

/** A person added, checked before the door is asked; the desk checks the password's strength itself. */
export function addRefusal(d: { username: string; password: string }, taken: readonly string[]): string | null {
  const name = d.username.trim();
  if (!name) return "a person has a username";
  if (taken.includes(name)) return `a person named ${name} exists`;
  if (!d.password) return "a person has a password";
  return null;
}

/** The Identity page's few numbers: how people sign in, how many people and groups, how many are signed in now, and where the desk answers. */
export function accessStats(caps: Capabilities, groups: readonly Group[] | null, access: Access | null): Stat[] {
  const mode = caps.desk.mode;
  const origin = caps.desk.settings?.origin ?? "";
  const local = origin === "" || reachWords(origin).local;
  const open = mode === "off" && !local ? "caution" : undefined;
  const out: Stat[] = [{ label: "Sign-in", value: SIGN_IN[mode], tone: open }];
  if (mode !== "off") {
    if (access) out.push({ label: "People", value: String(access.people.length) });
    if (groups) out.push({ label: "Groups", value: String(groups.length) });
    if (access) out.push({ label: "Signed in now", value: String(access.people.filter((p) => p.sessions_open > 0).length) });
  }
  out.push({ label: "The desk answers", value: local ? "This machine" : "The network", tone: open });
  return out;
}
