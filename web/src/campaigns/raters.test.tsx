// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Raters on an open campaign (record 48; gate T31, walkthrough step 11.8):
// people change while a round is open, so the campaign's page changes who
// rates it. The people who rate and those the desk names are chips, on while
// they rate; one press adds and takes off together, says before what it will
// do, and says after who rates now and whom the engine warns of. Every name
// here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { button, dialogs, engine, settle } from "../../test/safeWayIn";
import openCampaign from "../../test/fixtures/campaigns/campaign_open.json";
import { ADMIN, capsFor } from "./caps.fixture";
import { CampaignPage } from "./CampaignPage";
import type { Campaign } from "./client";
import { ratersBody, ratersChange, ratersDone, ratersNeeds, ratersPlan } from "./raters";
import { RatersDialog } from "./RatersDialog";

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
});

const click = (b: HTMLElement | null) => {
  expect(b).not.toBeNull();
  act(() => b!.click());
};
const typeInto = (el: HTMLInputElement, text: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

/** The signed-in person is carol, whose principal at the engine is carol@walk, as a desk with an identity provider has it. */
const caps = (over: Partial<ReturnType<typeof capsFor>["desk"]> = {}) => {
  const base = capsFor({ grants: ADMIN, principal: "carol@walk" });
  return { ...base, person: { ...base.person, subject: "carol" }, desk: { ...base.desk, ...over } } as typeof base;
};

const named = (raters: string[], over: Partial<Campaign> = {}): Campaign => ({ ...(openCampaign as unknown as Campaign), rater_policy: { raters, adjudicators: ["carol@walk"] }, ...over });
const PEOPLE = {
  people: [
    { subject: "alice", display: "Alice Lund", holds: true },
    { subject: "bob", display: "Bob Ek", holds: true },
    { subject: "erin", display: "Erin Berg", holds: true },
    { subject: "fay", display: "Fay Nord", holds: false },
  ],
};

describe("who rates, as the engine's door takes it", () => {
  it("is who is to rate against who rates now: those added, once each, and those taken off", () => {
    expect(ratersChange(["a", "b"], ["a", "c", "c"])).toEqual({ add: ["c"], remove: ["b"] });
    expect(ratersChange(["a"], ["a"])).toEqual({ add: [], remove: [] });
  });

  it("sends only what changes, a list each", () => {
    expect(ratersBody({ add: ["c"], remove: [] })).toEqual({ add: ["c"] });
    expect(ratersBody({ add: [], remove: ["b"] })).toEqual({ remove: ["b"] });
    expect(ratersBody({ add: ["c"], remove: ["b"] })).toEqual({ add: ["c"], remove: ["b"] });
  });

  it("needs a change, and somebody left to rate it", () => {
    expect(ratersNeeds(["a", "b"], ["a", "b"])).toBe("a rater to add or to take off");
    expect(ratersNeeds(["a", "b"], [])).toBe("one rater left, or anyone with work on Campaigns would rate it");
    expect(ratersNeeds(["a", "b"], ["a"])).toBeNull();
    expect(ratersNeeds(["a"], ["b"])).toBeNull();
  });

  it("says before what it will do, and after what it did", () => {
    expect(ratersPlan(["a", "b"], ["a", "b"])).toBeNull();
    expect(ratersPlan(["a", "b"], ["a", "c"])).toBe("Adds c. Takes off b: their answers stay and what they hold goes back to the pool.");
    expect(ratersDone({ raters: ["a", "c"], added: ["c"], removed: ["b"], released: 2 })).toBe("Added c. Took off b; 2 claims go back to the pool. Rating now: a, c.");
    expect(ratersDone({ raters: ["a", "b"], added: [], removed: [], released: 0 })).toBe("Nobody changed. Rating now: a, b.");
    expect(ratersDone({ raters: ["a"], added: [], removed: ["b"], released: 1 }, (p) => p.toUpperCase())).toBe("Took off B; 1 claim goes back to the pool. Rating now: A.");
    expect(ratersDone({ raters: ["a", "b"], added: [], removed: ["c"], released: 0 })).toBe("Took off c. Rating now: a, b.");
  });
});

describe("the raters dialog", () => {
  const draw = async (c = named(["alice@walk", "bob@walk"]), onDone = vi.fn(), c2 = caps()) => {
    act(() => root.render(<RatersDialog caps={c2} campaign={c} onClose={() => undefined} onDone={onDone} />));
    await settle();
    return onDone;
  };
  const dialog = () => host.querySelector("dialog[open]")!;
  const chips = () => [...dialog().querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Raters"] .opt')];
  const on = () => chips().filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);
  const chip = (words: string) => chips().find((b) => b.textContent === words) ?? null;
  const change = () => button(dialog(), "Change raters")!;
  const foot = () => dialog().querySelector(".dialog-foot .meta")?.textContent;

  it("shows those who rate, on, and the people the desk names who could, off, never one who lacks what a rater needs", async () => {
    engine((c) => (c.url === "/desk/people?holding=campaigns:work" ? { status: 200, body: PEOPLE } : undefined));
    await draw();
    expect(chips().map((b) => b.textContent)).toEqual(["Alice Lund", "Bob Ek", "Erin Berg"]);
    expect(on()).toEqual(["Alice Lund", "Bob Ek"]);
    // nothing is asked yet, and nothing changed, so there is nothing to press
    expect(change().disabled).toBe(true);
    expect(foot()).toBe("Needs a rater to add or to take off.");
  });

  it("adds and takes off in one press, saying first what it will do, and sends only what changes", async () => {
    const e = engine((c) => {
      if (c.url === "/desk/people?holding=campaigns:work") return { status: 200, body: PEOPLE };
      if (c.method === "POST" && c.url === "/api/campaigns/6/raters") return { status: 200, body: { campaign: 6, raters: ["alice@walk", "erin@walk"], added: ["erin@walk"], removed: ["bob@walk"], released: 2, warnings: [] } };
      return undefined;
    });
    const done = await draw();
    click(chip("Erin Berg"));
    expect(foot()).toBe("Adds Erin Berg.");
    click(chip("Bob Ek"));
    expect(foot()).toBe("Adds Erin Berg. Takes off Bob Ek: their answers stay and what they hold goes back to the pool.");
    expect(on()).toEqual(["Alice Lund", "Erin Berg"]);
    click(change());
    await settle();
    expect(e.of("POST", "/api/campaigns/6/raters").map((c) => c.body)).toEqual([{ add: ["erin@walk"], remove: ["bob@walk"] }]);
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][1]).toBe("Added Erin Berg. Took off Bob Ek; 2 claims go back to the pool. Rating now: Alice Lund, Erin Berg.");
  });

  it("will not leave nobody to rate it: anyone with work on Campaigns would, and the engine refuses it", async () => {
    engine((c) => (c.url === "/desk/people?holding=campaigns:work" ? { status: 200, body: PEOPLE } : undefined));
    await draw();
    click(chip("Alice Lund"));
    click(chip("Bob Ek"));
    expect(on()).toEqual([]);
    expect(change().disabled).toBe(true);
    expect(foot()).toBe("Needs one rater left, or anyone with work on Campaigns would rate it.");
    click(chip("Erin Berg"));
    expect(change().disabled).toBe(false);
  });

  it("says the engine's refusal in place, and keeps the dialog", async () => {
    engine((c) => {
      if (c.url === "/desk/people?holding=campaigns:work") return { status: 200, body: PEOPLE };
      if (c.method === "POST") return { status: 409, body: { error: "campaign base-check is closed; raters change while a campaign is open" } };
      return undefined;
    });
    const done = await draw();
    click(chip("Erin Berg"));
    click(change());
    await settle();
    expect(dialog().textContent).toContain("Refused: campaign base-check is closed; raters change while a campaign is open.");
    expect(done).not.toHaveBeenCalled();
    expect(change().disabled).toBe(false);
  });

  it("asks for a principal to be typed where the desk names no people", async () => {
    const e = engine((c) => (c.method === "POST" ? { status: 200, body: { campaign: 6, raters: ["alice@walk", "dave@walk"], added: ["dave@walk"], removed: [], released: 0, warnings: [] } } : undefined));
    const done = await draw(named(["alice@walk"]), vi.fn(), caps({ mode: "off" }));
    expect(e.calls.some((c) => c.url.startsWith("/desk/people"))).toBe(false);
    expect(chips().map((b) => b.textContent)).toEqual(["alice@walk"]);
    await typeInto(dialog().querySelector<HTMLInputElement>('input[aria-label="Add a rater"]')!, "dave@walk");
    expect(foot()).toBe("Adds dave@walk.");
    click(change());
    await settle();
    expect(e.of("POST", "/api/campaigns/6/raters")[0].body).toEqual({ add: ["dave@walk"] });
    expect(done.mock.calls[0][1]).toBe("Added dave@walk. Rating now: alice@walk, dave@walk.");
  });
});

describe("the campaign's page", () => {
  const doors = (state: { campaign: Campaign }, warnings: unknown[] = []) =>
    engine((c) => {
      if (c.method === "GET" && c.url === "/api/campaigns/6") return { status: 200, body: state.campaign };
      if (c.method === "GET" && c.url === "/api/campaigns/6/answers") return { status: 200, body: { campaign: 6, count: 0, answers: [] } };
      if (c.method === "GET" && c.url === "/api/label-sets") return { status: 200, body: { count: 0, label_sets: [] } };
      if (c.url === "/desk/people?holding=campaigns:work") return { status: 200, body: PEOPLE };
      if (c.method === "POST" && c.url === "/api/campaigns/6/raters") {
        state.campaign = named(["alice@walk", "erin@walk"]);
        return { status: 200, body: { campaign: 6, raters: ["alice@walk", "erin@walk"], added: ["erin@walk"], removed: ["bob@walk"], released: 0, warnings } };
      }
      return undefined;
    });

  it("changes who rates from the raters line, reads the campaign again, and names whom the engine warns of", async () => {
    const warning = { principal: "erin@walk", stacks: 3, campaigns: [{ campaign: "earlier-read", stacks: 3 }], why: "erin@walk already answered 3 of the stacks campaign base-check asks, in other campaigns" };
    const state = { campaign: named(["alice@walk", "bob@walk"]) };
    const e = doors(state, [warning]);
    act(() => root.render(<CampaignPage caps={caps()} id="6" />));
    await settle();
    expect(host.textContent).toContain("alice@walk, bob@walk");
    click(button(host, "Change the raters"));
    await settle();
    const dialog = host.querySelector("dialog[open]")!;
    const pick = (words: string) => [...dialog.querySelectorAll<HTMLButtonElement>('[role="group"] .opt')].find((b) => b.textContent === words) ?? null;
    click(pick("Erin Berg"));
    click(pick("Bob Ek"));
    click(button(dialog, "Change raters"));
    await settle();
    expect(e.of("POST", "/api/campaigns/6/raters").map((c) => c.body)).toEqual([{ add: ["erin@walk"], remove: ["bob@walk"] }]);
    // the page reads the campaign again, and says what happened
    expect(e.of("GET", "/api/campaigns/6")).toHaveLength(2);
    expect(host.querySelector("dialog[open]")).toBeNull();
    expect(host.textContent).toContain("Added Erin Berg. Took off Bob Ek. Rating now: Alice Lund, Erin Berg.");
    expect(host.textContent).toContain("alice@walk, erin@walk");
    expect(host.querySelector("p.warn")?.textContent).toBe(warning.why);
  });

  it("offers no Change on a campaign that names no raters", async () => {
    doors({ campaign: named([]) });
    act(() => root.render(<CampaignPage caps={caps()} id="6" />));
    await settle();
    expect(host.textContent).toContain("anyone with work on Campaigns");
    expect(button(host, "Change the raters")).toBeNull();
  });
});
