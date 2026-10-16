// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Teaching (gate T31, walkthrough step 17.4): the assistant's corrections,
// sets, fine-tune jobs and candidate models get a page in the desk, an
// administrator's, one list and one action a screen. Corrections chosen make
// a set; a set starts a fine-tune; the jobs are read again while one runs;
// a candidate offers its next gate, promotion once both are green, and a
// promoted one rolls back. Nothing is sent before its button is pressed, and
// a person without the grant an act needs sees why.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, type Call, dialogs, engine, settle } from "../../test/safeWayIn";
import type { Candidate, FineTuneJob } from "../assistant/teaching";
import type { Capabilities } from "../capabilities";
import { SETS, type Grant } from "../grants";
import { settingsPages } from "./pages";
import { Settings } from "./Settings";
import { JOBS_EVERY_MS } from "./TeachingPage";

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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ADMIN: readonly Grant[] = [...SETS.admin.grants, "assistant:use"];

function caps(grants: readonly Grant[] = ADMIN): Capabilities {
  return {
    engine: { engine: { name: "nils", version: "1.0.0-alpha.86" }, contracts: {}, doors: [], policy: [], auth: "off", principal: "admin", roles: [], registry: { epoch: 0 }, packs: [] },
    kvasir: { models: [{ id: "flash-next" }, { id: "qwen38-27b-fast" }] },
    assistant: { stations: [] },
    apps: [],
    person: { subject: "admin", display_name: "admin", grants: [...grants], detail: "sensitive", groups: ["Admins"] },
    desk: { version: "1.0.0-alpha.68", mode: "local", contracts: {}, engine_reachable: true, contract_mismatch: null, login: null, signed_in: true },
  } as unknown as Capabilities;
}

const CORRECTIONS = {
  count: 2,
  corrections: [
    { id: "proposal:1", kind: "rejected_proposal", station: "ask-help", prompt_digest: "a", correction: "rejected the proposal on document 4: narrow to cohort a", why: "cohort b was meant", at: "2026-10-10T08:00:00Z" },
    { id: "review:7:pack", kind: "overturned_pack", station: "pack", prompt_digest: "b", correction: "decided technique as SPACE on item 7, where the pack chose MPRAGE", why: null, at: "2026-10-11T08:00:00Z" },
  ],
};
const SET = { id: 3, name: "october", subject: "admin", count: 2, digest: "0123456789abcdef", created_at: "2026-10-16T08:00:00Z" };
const recipe = { base: "flash-next", method: "lora", steps: 20, rank: 8, lr: 0.0001 } as const;
const job = (over: Partial<FineTuneJob>): FineTuneJob => ({ id: 5, set_id: 3, subject: "admin", recipe, state: "running", started_at: "2026-10-16T09:00:00Z", finished_at: null, outcome: null, candidate: null, error: null, ...over });

const candidate = (over: Partial<Candidate>): Candidate => ({
  id: 2,
  model: "flash-next+lora-set3-job5",
  backend: "card0",
  source: { kind: "fine-tune", job: 5, recipe: {} },
  state: "registered",
  admission: null,
  proposal: null,
  notes: null,
  bench: null,
  gates: { admission: false, bench: false, refused: "candidate 2 is not promoted: the admission suite has not passed and the bench has not run" },
  job: null,
  ...over,
});
const GREEN = { admission: { suite: "kvasir admission", version: "1", passed: true, failed: [], record: 1, at: 0 }, bench: { id: 1, candidate: 2, at: 0, passed: 36, of: 36, strict: 36, median_seconds: 15, dry: true, note: null }, gates: { admission: true, bench: true, refused: null } };

function draw(c: Capabilities = caps()) {
  act(() => root.render(<Settings caps={c} install={null} checkedAt={null} onChanged={() => undefined} page="teaching" />));
}

const tab = (words: string) => {
  const t = [...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent === words) as HTMLButtonElement | undefined;
  expect(t, words).toBeDefined();
  act(() => t!.click());
};

const press = (words: string | RegExp) => {
  const b = button(host, words);
  expect(b, String(words)).not.toBeNull();
  expect(b!.disabled, String(words)).toBe(false);
  act(() => b!.click());
};

function type(id: string, text: string) {
  const el = host.querySelector(`#${id}`) as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const posts = (calls: Call[]) => calls.filter((c) => c.method === "POST").map((c) => [c.url, c.body]);

describe("the Teaching page", () => {
  it("is an administrator's, under the assistant, where the assistant answered", () => {
    expect(settingsPages(caps()).map((p) => p.id)).toContain("teaching");
    expect(settingsPages(caps()).find((p) => p.id === "teaching")).toEqual({ id: "teaching", title: "Teaching", sub: true });
    expect(settingsPages(caps([...SETS.operator.grants, "assistant:use"])).map((p) => p.id)).not.toContain("teaching");
    expect(settingsPages({ ...caps(), assistant: null }).map((p) => p.id)).not.toContain("teaching");
  });

  it("makes a set of the corrections chosen, and nothing is sent before Make the set", async () => {
    const door = engine((c) => {
      if (c.url === "/assistant/teaching/corrections") return { status: 200, body: CORRECTIONS };
      if (c.url === "/assistant/teaching/sets" && c.method === "POST") return { status: 201, body: { ...SET, count: 1 } };
      if (c.url === "/assistant/teaching/sets") return { status: 200, body: { sets: [{ ...SET, count: 1 }] } };
      return undefined;
    });
    draw();
    await settle();
    expect(host.textContent).toContain("narrow to cohort a");
    expect(host.textContent).toContain("proposal rejected");
    expect(button(host, "Make a set")!.disabled).toBe(true);
    act(() => (host.querySelector('[aria-label="Choose proposal:1"]') as HTMLInputElement).click());
    expect(host.textContent).toContain("1 of 2 chosen");
    press("Make a set");
    expect(button(host, "Make the set")!.disabled).toBe(true);
    type("teaching-set-name", "october");
    expect(posts(door.calls)).toEqual([]);
    press("Make the set");
    await settle();
    expect(posts(door.calls)).toEqual([["/assistant/teaching/sets", { name: "october", corrections: ["proposal:1"] }]]);
    // the set made, the page goes on to the sets
    expect(host.textContent).toContain("Set 3, october, holds one correction.");
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Sets");
  });

  it("starts a fine-tune of a set with its recipe, refusing a recipe the assistant would refuse", async () => {
    const door = engine((c) => {
      if (c.url === "/assistant/teaching/corrections") return { status: 200, body: { count: 0, corrections: [] } };
      if (c.url === "/assistant/teaching/sets") return { status: 200, body: { sets: [SET] } };
      if (c.url === "/assistant/teaching/sets/3/fine-tune") return { status: 202, body: job({}) };
      if (c.url === "/assistant/teaching/jobs") return { status: 200, body: { jobs: [job({})] } };
      return undefined;
    });
    draw();
    await settle();
    expect(host.textContent).toContain("Nobody has corrected");
    tab("Sets");
    await settle();
    expect(host.textContent).toContain("october");
    press("Fine-tune");
    expect((host.querySelector("#teaching-base") as HTMLInputElement).value).toBe("flash-next");
    type("teaching-steps", "0");
    expect(host.textContent).toContain("Steps are a whole number from 1 to 100000.");
    expect(button(host, "Start")!.disabled).toBe(true);
    type("teaching-steps", "40");
    press("Start");
    await settle();
    expect(posts(door.calls)).toEqual([["/assistant/teaching/sets/3/fine-tune", { recipe: { ...recipe, steps: 40 } }]]);
    expect(host.textContent).toContain("Fine-tune job 5 started on set october.");
    expect(host.textContent).toContain("running");
  });

  it("reads the jobs again while one runs, and stops once it ends", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let ended = false;
    const door = engine((c) => {
      if (c.url === "/assistant/teaching/corrections") return { status: 200, body: { count: 0, corrections: [] } };
      if (c.url === "/assistant/teaching/jobs") return { status: 200, body: { jobs: [ended ? job({ state: "done", finished_at: "2026-10-16T09:10:00Z", candidate: 2, outcome: { dry: true, base: "flash-next", steps: 20, adapter: null, set_digest: "d", note: "dry" } }) : job({})] } };
      return undefined;
    });
    draw();
    const flush = async () => {
      for (let i = 0; i < 6; i++) await act(async () => void (await Promise.resolve()));
    };
    await flush();
    tab("Jobs");
    await flush();
    expect(door.of("GET", "/assistant/teaching/jobs")).toHaveLength(1);
    expect(host.textContent).toContain("read again every few seconds");
    ended = true;
    await act(async () => void vi.advanceTimersByTime(JOBS_EVERY_MS));
    await flush();
    expect(door.of("GET", "/assistant/teaching/jobs")).toHaveLength(2);
    expect(host.textContent).toContain("candidate 2; dry: no adapter was made");
    await act(async () => void vi.advanceTimersByTime(JOBS_EVERY_MS * 3));
    await flush();
    expect(door.of("GET", "/assistant/teaching/jobs")).toHaveLength(2);
  });

  it("falls back to the person's own jobs from the inbox where the assistant has no jobs door", async () => {
    engine((c) => {
      if (c.url === "/assistant/teaching/corrections") return { status: 200, body: { count: 0, corrections: [] } };
      if (c.url === "/assistant/inbox") return { status: 200, body: { teaching: [job({ id: 9, state: "failed", error: "the runner said nothing readable" })] } };
      return undefined;
    });
    draw();
    await settle();
    tab("Jobs");
    await settle();
    expect(host.textContent).toContain("job 9");
    expect(host.textContent).toContain("the runner said nothing readable");
  });

  it("offers each candidate its next gate, promotes once both are green, and rolls a promotion back", async () => {
    let candidates: Candidate[] = [candidate({}), candidate({ id: 4, model: "flash-next+lora-set3-job6", ...GREEN, state: "admitted" }), candidate({ id: 1, model: "flash-next+lora-set1-job1", ...GREEN, state: "promoted" }), candidate({ id: 0, model: "old", state: "retired" })];
    const door = engine((c) => {
      if (c.url === "/assistant/teaching/corrections") return { status: 200, body: { count: 0, corrections: [] } };
      if (c.url === "/assistant/teaching/candidates") return { status: 200, body: { candidates, promoted: [{ backend: "card0", model: "flash-next+lora-set1-job1" }] } };
      if (c.url === "/assistant/teaching/candidates/2/admit") return { status: 200, body: { candidate: candidate({ admission: { ...GREEN.admission, passed: false, failed: ["schema"] } }) } };
      if (c.url === "/assistant/teaching/candidates/4/promote") return { status: 200, body: { promoted: 4 } };
      if (c.url === "/assistant/teaching/candidates/1/retire") {
        candidates = candidates.map((x) => (x.id === 1 ? { ...x, state: "retired" } : x));
        return { status: 200, body: { retired: 1, rolled_back: true, candidate: candidates[2], promoted: [{ backend: "card0", model: null }] } };
      }
      return undefined;
    });
    draw();
    await settle();
    tab("Models");
    await settle();
    expect(host.textContent).toContain("card0 routes to flash-next+lora-set1-job1");
    // one action a row: admit, promote, roll back; the retired one none
    expect(["Admit", "Promote", "Roll back"].map((w) => button(host, w) !== null)).toEqual([true, true, true]);
    expect(host.querySelectorAll("tbody tr")[3].querySelector("button")).toBeNull();
    press("Admit");
    await settle();
    expect(host.textContent).toContain("Candidate 2 failed the admission suite: schema.");
    press("Promote");
    expect(host.textContent).toContain("card0 routes every purpose to flash-next+lora-set3-job6.");
    expect(host.textContent).toContain("flash-next+lora-set1-job1 is retired.");
    expect(posts(door.calls)).toEqual([["/assistant/teaching/candidates/2/admit", {}]]);
    // the dialog's own Promote
    const promote = [...host.querySelectorAll("dialog button")].find((b) => b.textContent === "Promote") as HTMLButtonElement;
    act(() => promote.click());
    await settle();
    expect(posts(door.calls)[1][0]).toBe("/assistant/teaching/candidates/4/promote");
    expect((posts(door.calls)[1][1] as { proposal: { id: string } }).proposal.id).toMatch(/^desk-/);
    expect(host.textContent).toContain("flash-next+lora-set3-job6 is promoted on card0.");
    press("Roll back");
    expect(host.textContent).toContain("routes every purpose to the model it is configured with again");
    const back = [...host.querySelectorAll("dialog button")].find((b) => b.textContent === "Roll back") as HTMLButtonElement;
    act(() => back.click());
    await settle();
    expect(posts(door.calls)[2]).toEqual(["/assistant/teaching/candidates/1/retire", {}]);
    expect(host.textContent).toContain("flash-next+lora-set1-job1 is retired; card0 routes to its configured model.");
  });

  it("blocks promotion with the reason while a gate is red, and says which grant an act needs", async () => {
    engine((c) => {
      if (c.url === "/assistant/teaching/corrections") return { status: 200, body: CORRECTIONS };
      if (c.url === "/assistant/teaching/candidates") return { status: 200, body: { candidates: [candidate({ id: 4, ...GREEN, state: "admitted", bench: { ...GREEN.bench, passed: 30 }, gates: { admission: true, bench: false, refused: "the bench stands at 30 of 36" } })], promoted: [{ backend: "card0", model: null }] } };
      return undefined;
    });
    // an administrator: the bench is offered again, not promotion
    draw();
    await settle();
    tab("Models");
    await settle();
    expect(button(host, "Bench again")!.disabled).toBe(false);
    expect(button(host, "Promote")).toBeNull();
    expect(host.textContent).toContain("card0 routes to its configured model");
    // someone holding the page but neither review:work nor kvasir:work
    act(() => root.unmount());
    root = createRoot(host);
    draw(caps(["assistant-settings:work", "assistant:use"]));
    await settle();
    expect(button(host, "Make a set")!.disabled).toBe(true);
    expect(host.textContent).toContain("needs review:work");
    tab("Models");
    await settle();
    expect(button(host, "Bench again")!.disabled).toBe(true);
    expect(host.textContent).toContain("needs kvasir:work");
  });

  it("says why it shows nothing to a person the desk does not pass to the assistant", () => {
    engine(() => undefined);
    draw(caps(SETS.admin.grants));
    expect(host.textContent).toContain("only to a person holding assistant:use");
    expect(host.querySelector('[role="tab"]')).toBeNull();
  });
});
