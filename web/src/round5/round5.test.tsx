// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Record 55 H2, round 5 (spec 13.1): the missing controls, as they act
// against the desk, the engine and the assistant. An admin resets another
// person's password and removes a person, handing their kept results to
// someone, and is offered neither on their own row; a person changes their
// own password with the current one; a release is handed over into an
// exchange place under a key, and a version withdrawn with a reason; the
// Logs page lists the jobs, opens one's log from its end, follows it while
// it runs, reads back with Earlier, opens a run's units' logs and says why a
// log is not there; the Assistant's Plans waiting confirms a plan, and its
// Standing grants revokes one and gives another. Every name here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, caps7a, dialogs, engine, settle } from "../../test/safeWayIn";
import { GrantsPage, PlansPage } from "../assistant/LadderPages";
import type { Release } from "../data/cohorts";
import { placesKept } from "../objects/kept";
import { LogsPage } from "../ops/LogsPage";
import { ReleasePage } from "../ops/ReleasePage";
import { YourPassword } from "../profile/ProfilePage";
import { PersonForm } from "../settings/AccessForm";
import type { Group, Person } from "../settings/identity";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  dialogs();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const typeInto = (el: HTMLInputElement, text: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const choose = (el: HTMLSelectElement, value: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
const click = (b: HTMLElement | null) => {
  expect(b).not.toBeNull();
  act(() => b!.click());
};
const input = (label: string) => {
  const l = [...host.ownerDocument.querySelectorAll("label")].find((x) => x.textContent?.trim() === label);
  expect(l, label).toBeDefined();
  return host.ownerDocument.getElementById(l!.htmlFor) as HTMLInputElement;
};

const admins: Group = { id: 2, name: "Admins", grants: ["identity:see", "identity:work"], detail: "sensitive", follows: [], members: ["astrid"] };
const person = (over: Partial<Person>): Person => ({ subject: "someone", display: "", groups: [], followed: [], grants: [], detail: null, access: { grants: [], detail: "plain" }, last_seen_at: null, sessions_open: 0, ...over });
const ASTRID = person({ subject: "astrid", display: "Astrid Berg", groups: [2] });
const ERIK = person({ subject: "erik", display: "Erik Lund", grants: ["query:see"] });
const PEOPLE = [ASTRID, ERIK, person({ subject: "maja", display: "Maja Ek" })];

describe("an admin's lines on another person", () => {
  it("resets their password, typed twice, and says their sessions ended", async () => {
    const e = engine((c) => (c.method === "POST" && c.url === "/desk/people/erik/password" ? { status: 200, body: { username: "erik", sessions_ended: 2 } } : undefined));
    const done = vi.fn();
    act(() => root.render(<PersonForm mode="local" groups={[admins]} person={ERIK} taken={[]} people={PEOPLE} me="astrid" onClose={() => undefined} onDone={done} />));
    click(button(host.ownerDocument, "Reset the password"));
    await typeInto(input("New password"), "short");
    expect(host.ownerDocument.body.textContent).toContain("At least 8 characters.");
    await typeInto(input("New password"), "a-long-new-one");
    await typeInto(input("Again"), "a-long-new-one");
    click(button(host.ownerDocument, "Set the password"));
    await settle();
    expect(e.of("POST", "/desk/people/erik/password")[0].body).toEqual({ password: "a-long-new-one" });
    expect(done).toHaveBeenCalledWith("Password set: Erik Lund. Their sessions ended; they sign in with the new one.");
  });

  it("removes them, handing their kept results to the one chosen, and says what went", async () => {
    const e = engine((c) => (c.method === "DELETE" && c.url === "/desk/people/erik?to=maja" ? { status: 200, body: { removed: "erik", sessions_ended: 1, handed: { results: 3, lineage: 2 }, to: "maja" } } : undefined));
    const done = vi.fn();
    act(() => root.render(<PersonForm mode="local" groups={[admins]} person={ERIK} taken={[]} people={PEOPLE} me="astrid" onClose={() => undefined} onDone={done} />));
    click(button(host.ownerDocument, "Remove the person"));
    const to = input("Hand their kept results to") as unknown as HTMLSelectElement;
    // the admin is offered first, the removed person never
    expect(to.value).toBe("astrid");
    expect([...to.options].map((o) => o.value)).toEqual(["", "astrid", "maja"]);
    await choose(to, "maja");
    click(button(host.ownerDocument, "Remove"));
    await settle();
    expect(e.of("DELETE", "/desk/people/erik?to=maja")).toHaveLength(1);
    expect(done).toHaveBeenCalledWith("Removed: Erik Lund; 3 kept results handed to Maja Ek");
  });

  it("says plainly when the desk refuses to leave nobody who may change people", async () => {
    engine((c) => (c.method === "DELETE" ? { status: 409, body: { error: "nobody would hold identity:work" } } : undefined));
    act(() => root.render(<PersonForm mode="local" groups={[admins]} person={ERIK} taken={[]} people={PEOPLE} me="astrid" onClose={() => undefined} onDone={() => undefined} />));
    click(button(host.ownerDocument, "Remove the person"));
    await choose(input("Hand their kept results to") as unknown as HTMLSelectElement, "");
    click(button(host.ownerDocument, "Remove"));
    await settle();
    expect(host.ownerDocument.body.textContent).toContain("Refused: nobody would be left who may change people and groups.");
  });

  it("offers neither on the admin's own row, and no reset where the provider keeps the passwords", () => {
    act(() => root.render(<PersonForm mode="local" groups={[admins]} person={ASTRID} taken={[]} people={PEOPLE} me="astrid" onClose={() => undefined} onDone={() => undefined} />));
    expect(button(host.ownerDocument, "Reset the password")).toBeNull();
    expect(button(host.ownerDocument, "Remove the person")).toBeNull();
    act(() => root.render(<PersonForm mode="oidc" groups={[admins]} person={ERIK} taken={[]} people={PEOPLE} me="astrid" onClose={() => undefined} onDone={() => undefined} />));
    expect(button(host.ownerDocument, "Reset the password")).toBeNull();
    expect(button(host.ownerDocument, "Remove the person")).not.toBeNull();
  });
});

describe("one's own password", () => {
  it("changes with the current one, and says how many other sessions were signed out", async () => {
    const e = engine((c) => {
      if (c.url !== "/desk/people/astrid/password") return undefined;
      return c.body?.current === "the-old-one" ? { status: 200, body: { username: "astrid", sessions_ended: 1 } } : { status: 403, body: { error: "the current password is not right" } };
    });
    act(() => root.render(<YourPassword username="astrid" />));
    click(button(host, "Change your password"));
    await typeInto(input("Current password"), "wrong-one");
    await typeInto(input("New password"), "the-new-one");
    await typeInto(input("Again"), "the-new-one");
    click(button(host, "Change it"));
    await settle();
    expect(host.textContent).toContain("The current password is not right.");
    await typeInto(input("Current password"), "the-old-one");
    click(button(host, "Change it"));
    await settle();
    expect(e.of("POST", "/desk/people/astrid/password").map((c) => c.body)).toEqual([
      { password: "the-new-one", current: "wrong-one" },
      { password: "the-new-one", current: "the-old-one" },
    ]);
    expect(host.textContent).toContain("Password changed. Your other session was signed out.");
    expect(button(host, "Change it")).toBeNull();
  });
});

const release = (over: Partial<Release>): Release =>
  ({ id: 1, name: "ms-cohort-2026-10-01", version: "1", root: "/exports/ms-cohort-2026-10-01", started_at: "2026-10-01T10:00:00Z", files: 10, subjects: 4, unchanged: null, moved: null, rewritten: null, added: null, removed: null, layout: "bids", ...over }) as Release;
const RELEASES = [release({ id: 1, version: "1" }), release({ id: 2, version: "2" }), release({ id: 3, name: "pilot", version: "1", withdrawn_at: "2026-10-02T09:00:00Z", withdrawn_by: "astrid", withdrawn_why: "wrong cohort" })];
const PLACES = { places: [{ id: 7, name: "outbox", role: "exchange", path: "/srv/exchange/outbox", guarantees: {}, probed: null, probed_at: null, retired_at: null }] };

describe("a release's row", () => {
  const doors = ["GET /api/releases", "POST /api/releases", "POST /api/handovers", "POST /api/jobs", "GET /api/places"];

  it("hands its newest version over into an exchange place under a key, and says the job", async () => {
    const e = engine((c) => {
      if (c.url.startsWith("/api/releases")) return { status: 200, body: { count: 3, releases: RELEASES } };
      if (c.url === "/api/places") return { status: 200, body: PLACES };
      if (c.url === "/api/handovers") return { status: 202, body: { job: 41, state: "queued" } };
      return undefined;
    });
    await placesKept.refresh().catch(() => undefined);
    act(() => root.render(<ReleasePage caps={caps7a(doors)} page={null} arg={null} />));
    await settle();
    // the newest version of a name not withdrawn: version 2, never version 1 or the withdrawn pilot
    expect(button(host, "Hand over ms-cohort-2026-10-01")).not.toBeNull();
    expect([...host.querySelectorAll("button")].filter((b) => b.textContent === "Hand over")).toHaveLength(1);
    expect(button(host, "Withdraw pilot version 1")).toBeNull();
    click(button(host, "Hand over ms-cohort-2026-10-01"));
    await settle();
    expect(host.textContent).toContain("/srv/exchange/outbox/ms-cohort-2026-10-01-v2");
    await typeInto(input("Key"), "partner-2026");
    expect(host.textContent).toContain("nils handover password --key partner-2026");
    click(button(host.querySelector("dialog[open]")!, /^Hand over$/u));
    await settle();
    expect(e.of("POST", "/api/handovers")[0].body).toEqual({ release: "ms-cohort-2026-10-01", out: "/srv/exchange/outbox/ms-cohort-2026-10-01-v2", key: "partner-2026" });
    expect(host.textContent).toContain("Handover of ms-cohort-2026-10-01 version 2 is queued as job 41");
  });

  it("withdraws a version with its reason through the jobs door", async () => {
    const e = engine((c) => {
      if (c.url.startsWith("/api/releases")) return { status: 200, body: { count: 3, releases: RELEASES } };
      if (c.url === "/api/places") return { status: 200, body: PLACES };
      if (c.url === "/api/jobs" && c.method === "POST") return { status: 202, body: { job: 42, state: "queued" } };
      return undefined;
    });
    act(() => root.render(<ReleasePage caps={caps7a(doors)} page={null} arg={null} />));
    await settle();
    click(button(host, "Withdraw ms-cohort-2026-10-01 version 1"));
    const dialog = host.querySelector("dialog[open]")!;
    expect(button(dialog, /^Withdraw$/u)?.disabled).toBe(true);
    await typeInto(input("Why"), "a subject withdrew consent");
    click(button(dialog, /^Withdraw$/u));
    await settle();
    expect(e.of("POST", "/api/jobs")[0].body).toEqual({ command: ["release", "--name", "ms-cohort-2026-10-01", "--withdraw", "1", "--why", "a subject withdrew consent"], name: "ms-cohort-2026-10-01" });
    expect(host.textContent).toContain("Withdrawal of ms-cohort-2026-10-01 version 1 is queued as job 42.");
  });
});

const JOBS = [
  { id: 51, kind: "pipeline", name: "n4-bias-correction@2", state: "running", started_at: "2026-10-13T08:00:00Z", heartbeat_at: null, finished_at: null, progress: null, error: null, args: { argv: ["run", "n4-bias-correction@2"], queued: ["run", "n4-bias-correction@2"], run: 9 }, result: null },
  { id: 50, kind: "digest", name: "study-anon", state: "done", started_at: "2026-10-13T07:00:00Z", heartbeat_at: null, finished_at: "2026-10-13T07:05:00Z", progress: null, error: null, args: { argv: ["digest", "@study-anon"] }, result: null },
  { id: 49, kind: "worker", name: null, state: "running", started_at: "2026-10-13T06:00:00Z", heartbeat_at: null, finished_at: null, progress: null, error: null, args: {}, result: null },
];
const LOG_DOORS = ["GET /api/jobs", "GET /api/jobs/{id}", "GET /api/jobs/{id}/log", "GET /api/pipeline-runs/{id}", "GET /api/pipeline-runs/{id}/units/{unit}/log", "GET /api/pipeline-runs/{id}/log"];

describe("the Logs page", () => {
  it("lists the jobs but the workers, opens one's log from its end, reads back with Earlier, and follows it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const e = engine((c, nth) => {
      if (c.url.startsWith("/api/jobs?")) return { status: 200, body: { count: 3, jobs: JOBS } };
      if (c.url === "/api/jobs/50/log") return { status: 200, body: { job: 50, state: "done", size: 70000, from: 65536, to: 70000, text: "read 412 files\n", earlier: true, over: true } };
      if (c.url === "/api/jobs/50/log?from=0") return { status: 200, body: { job: 50, state: "done", size: 70000, from: 0, to: 65536, text: "digest started\n", earlier: false, over: true } };
      if (c.url === "/api/pipeline-runs/9") return { status: 200, body: { id: 9, pipeline_id: 6, pipeline: "n4-bias-correction@2", job_id: 51, status: "running", started_at: null, finished_at: null, units: "apart", units_run: [{ unit: "sub-a1_ses-1", state: "done", status: "ok", attempts: 1, started_at: null, finished_at: null }, { unit: "sub-b2_ses-1", state: "failed", status: "failed", attempts: 1, started_at: null, finished_at: null, error: "exit 1" }] } };
      if (c.url === "/api/jobs/51/log") return { status: 200, body: { job: 51, state: "running", size: 10, from: 0, to: 10, text: "unit one\n", earlier: false, over: false } };
      if (c.url === "/api/jobs/51/log?from=10") return { status: 200, body: { job: 51, state: nth > 1 ? "done" : "running", size: 20, from: 10, to: 20, text: "unit two\n", earlier: false, over: nth > 1 } };
      if (c.url === "/api/pipeline-runs/9/units/sub-b2_ses-1/log") return { status: 403, body: { error: "unit sub-b2_ses-1 holds a stack of a sealed sample, which you may not read" } };
      if (c.url === "/api/pipeline-runs/9/units/sub-a1_ses-1/log") return { status: 200, body: { run: 9, unit: "sub-a1_ses-1", shared: false, size: 5, from: 0, to: 5, text: "N4 ok", earlier: false, over: true } };
      return undefined;
    });
    act(() => root.render(<LogsPage caps={caps7a(LOG_DOORS)} job={50} />));
    await settle();
    const names = [...host.querySelectorAll(".logs-job")].map((a) => a.getAttribute("href"));
    expect(names).toEqual(["#pipelines/logs/51", "#pipelines/logs/50"]);
    expect(host.querySelector(".log-text")?.textContent).toBe("read 412 files\n");
    click(button(host, "Earlier"));
    await settle();
    expect(host.querySelector(".log-text")?.textContent).toBe("digest started\nread 412 files\n");
    expect(host.textContent).toContain("From its start");

    // a running pipeline's job: followed from where it ended, and its units each with their log
    act(() => root.render(<LogsPage caps={caps7a(LOG_DOORS)} job={51} />));
    await settle();
    expect(host.querySelector(".log-text")?.textContent).toBe("unit one\n");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await settle();
    expect(host.querySelector(".log-text")?.textContent).toBe("unit one\nunit two\n");
    click(button(host, "sub-a1_ses-1"));
    await settle();
    expect(host.querySelector(".log-text")?.textContent).toBe("N4 ok");
    click(button(host, "sub-b2_ses-1"));
    await settle();
    expect(host.textContent).toContain("Unit sub-b2_ses-1 holds a stack of a sealed sample, which you may not read.");
    expect(e.of("GET", "/api/jobs/51/log?from=10").length).toBeGreaterThanOrEqual(1);
  });

  it("says why a job has no log, in the engine's words", async () => {
    engine((c) => {
      if (c.url.startsWith("/api/jobs?")) return { status: 200, body: { count: 1, jobs: [JOBS[1]] } };
      if (c.url === "/api/jobs/50/log") return { status: 404, body: { error: "job 50 ran before logs were kept" } };
      return undefined;
    });
    act(() => root.render(<LogsPage caps={caps7a(LOG_DOORS)} job={50} />));
    await settle();
    expect(host.textContent).toContain("Job 50 ran before logs were kept.");
  });
});

const assistantCaps = () => ({ ...caps7a([]), assistant: { doors: ["GET /inbox", "GET /grants", "POST /grants", "DELETE /grants/{id}", "POST /plans/{id}/confirm"] } });

describe("the Assistant's ladder pages", () => {
  it("Plans waiting confirms a plan once, and shows a held step's reason and a proposal to decide", async () => {
    const inbox = {
      subject: "astrid",
      jobs: { queued: [], running: [], finished: [], failed: [] },
      waiting: [{ n: 2, rung: 2, verb: "POST", door: "POST /api/jobs", words: "Sort study-anon", state: "waiting", reason: "no standing grant for POST /api/jobs", plan: "p2" }],
      plans: [
        { id: "p1", conversation: "c1", instruction: "Every Monday, sort what came in", state: "proposed", created_at: "2026-10-13T08:00:00Z", steps: [{ n: 1, rung: 2, verb: "POST", door: "POST /api/jobs", words: "Sort what came in", state: "waiting" }] },
        { id: "p3", conversation: "c3", instruction: "Merge two subjects", state: "confirmed", created_at: "2026-10-12T08:00:00Z", steps: [] },
      ],
      proposals: [{ n: 1, rung: 3, verb: "POST", door: "POST /api/linkage/merge", words: "Merge sub-a1 into sub-b2", state: "proposed", plan: "p3" }],
      grants: [],
    };
    const e = engine((c) => {
      if (c.url === "/assistant/inbox") return { status: 200, body: inbox };
      if (c.url === "/assistant/plans/p1/confirm") return { status: 200, body: { ...inbox.plans[0], state: "confirmed" } };
      return undefined;
    });
    act(() => root.render(<PlansPage caps={assistantCaps()} />));
    await settle();
    expect(host.textContent).toContain("To confirm · 1");
    expect(host.textContent).toContain("no standing grant for POST /api/jobs");
    expect(host.querySelector('a[href="#assistant/c3"]')?.textContent).toBe("Decide in its conversation");
    click(button(host, "Confirm"));
    await settle();
    expect(e.of("POST", "/assistant/plans/p1/confirm")).toHaveLength(1);
    expect(host.textContent).toContain("Confirmed: Every Monday, sort what came in");
  });

  it("Standing grants revokes one and gives another from the doors the ladder offers", async () => {
    const grants = {
      subject: "astrid",
      grants: [{ id: 4, subject: "astrid", door: "POST /api/jobs", created_at: "2026-10-01T08:00:00Z", revoked_at: null }],
      ladder: [
        { door: "POST /api/jobs", rung: 2, role: "operator" },
        { door: "POST /api/ask/run", rung: 2, role: "reader" },
        { door: "POST /api/linkage/merge", rung: 3, role: "admin" },
      ],
    };
    const e = engine((c) => {
      if (c.url === "/assistant/grants") return c.method === "POST" ? { status: 201, body: { id: 5, subject: "astrid", door: "POST /api/ask/run", created_at: "2026-10-13T09:00:00Z" } } : { status: 200, body: grants };
      if (c.url === "/assistant/grants/4") return { status: 200, body: { id: 4, door: "POST /api/jobs", revoked_at: "2026-10-13T09:00:00Z" } };
      return undefined;
    });
    act(() => root.render(<GrantsPage caps={assistantCaps()} />));
    await settle();
    // a rung-three door is never offered, nor one that stands already
    const offered = [...(host.querySelector("select")?.options ?? [])].map((o) => o.value);
    expect(offered).toEqual(["POST /api/ask/run"]);
    click(button(host, "Revoke POST /api/jobs"));
    await settle();
    expect(e.of("DELETE", "/assistant/grants/4")).toHaveLength(1);
    click(button(host, "Give it"));
    await settle();
    expect(e.of("POST", "/assistant/grants")[0].body).toEqual({ door: "POST /api/ask/run" });
  });
});
