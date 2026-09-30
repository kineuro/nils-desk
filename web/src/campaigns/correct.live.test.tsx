// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Correcting one's own anchored and pair answers against a live engine (the
// post-contrast study): the anchored and the pair reader, drawn as the desk
// draws them, read two items each with their keys, go back with `b`, change
// one answer, and send it; the engine's values door then resolves the
// correction, and its answers door keeps the earlier answer beside it.
// Skipped unless an engine is named:
//
//   CORRECT_LIVE_ENGINE=http://127.0.0.1:18731 \
//   CORRECT_LIVE_TOKEN=<a rater's token> \
//   CORRECT_LIVE_ANCHORED=<an open anchored campaign> CORRECT_LIVE_PAIR=<an open pair campaign> \
//   npx vitest run src/campaigns/correct.live.test.tsx
//
// It answers and corrects in those campaigns, so it is run against a
// throwaway registry (nils synth, then nils campaign anchored and pair with
// the token's principal as rater).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { door, type Json } from "../ask/client";
import type { Capabilities, EngineCapabilities } from "../capabilities";
import type { ViewerProps } from "../viewer/Viewer";
import { AnchoredReader } from "./AnchoredReader";
import { campaigns } from "./client";
import { PairReader } from "./PairReader";

vi.mock("../viewer/Viewer", () => ({ Viewer: (_: ViewerProps) => null }));
vi.mock("../viewer/reference", async (orig) => ({ ...(await orig<typeof import("../viewer/reference")>()), reference: () => Promise.reject(new Error("no sample")) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ENGINE = process.env.CORRECT_LIVE_ENGINE ?? "";
const TOKEN = process.env.CORRECT_LIVE_TOKEN ?? "";
const ANCHORED = process.env.CORRECT_LIVE_ANCHORED ?? "";
const PAIR = process.env.CORRECT_LIVE_PAIR ?? "";
const say = (line: string) => console.log(`correct: ${line}`);

describe.skipIf(!ENGINE || !TOKEN || !ANCHORED || !PAIR)("correcting anchored and pair answers on a live engine", () => {
  const realFetch = globalThis.fetch;
  let caps: Capabilities;
  let host: HTMLDivElement;
  let root: Root | null = null;
  beforeAll(async () => {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => realFetch(`${ENGINE}${String(input)}`, { ...init, headers: { ...(init?.headers as Record<string, string>), authorization: `Bearer ${TOKEN}` } })) as typeof fetch;
    const engine = await door<EngineCapabilities>("GET", "/api/capabilities");
    caps = { engine, kvasir: null, assistant: null, apps: [], person: { subject: engine.principal ?? "", display_name: "", grants: engine.grants ?? [], detail: engine.detail ?? "plain", groups: [] }, desk: {} } as unknown as Capabilities;
    say(`engine ${engine.engine.version}, OpenAPI ${engine.contracts.openapi ?? "?"}`);
    host = document.createElement("div");
    document.body.appendChild(host);
  });
  afterAll(async () => {
    await act(async () => root?.unmount());
    host?.remove();
    globalThis.fetch = realFetch;
  });

  async function until<T>(what: () => T | null | undefined | false, ms = 10_000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = what();
      if (v) return v;
      if (Date.now() > end) throw new Error(`waited in vain; the page says: ${host.textContent?.slice(0, 400)}`);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
    }
  }
  async function press(key: string) {
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
  }
  const shownItem = () => host.querySelector(".rate-item > b")?.textContent ?? null;

  /** Two items read with the keys `first` and `second`, `b` twice back to the first, corrected with `fix`; the first item's words. */
  async function readAndCorrect(first: string, second: string, fix: string): Promise<string> {
    await until(() => shownItem() && host.querySelector(".pair-answers"));
    const one = shownItem()!;
    await press(first);
    await press("Enter");
    await until(() => shownItem() && shownItem() !== one && host.querySelector(".pair-answers"));
    const two = shownItem()!;
    await press(second);
    await press("Enter");
    await until(() => host.querySelector(".said")?.textContent?.includes(two));
    await until(() => shownItem() !== two || !host.querySelector(".pair-answers"));
    say(`read ${one} and ${two}`);
    await press("b");
    await until(() => shownItem() === two && host.querySelector(".pair-answer.yours"));
    await press("b");
    await until(() => shownItem() === one && host.querySelector(".pair-answer.yours"));
    say(`b, b: ${one} open, marked "${host.querySelector(".pair-answer.yours")?.textContent}"`);
    await press(fix);
    await press("Enter");
    await until(() => host.querySelector(".said")?.textContent?.startsWith(`Corrected ${one}`));
    say(host.querySelector(".said")!.textContent!);
    return one;
  }

  it("anchored: answer, go back, change; the values resolve the correction and the earlier answer is kept", async () => {
    const c = await campaigns.one(ANCHORED);
    root = createRoot(host);
    await act(async () => root!.render(<AnchoredReader caps={caps} id={String(c.id)} />));
    await readAndCorrect("2", "3", "1");
    const text = host.textContent ?? "";
    expect(text).not.toMatch(/\bstack \d/u);
    const mine = await campaigns.mine(c.id);
    const fixed = mine.answers.find((a) => a.via === "amend")!;
    expect(fixed.value).toBe("like_pre");
    const values = await door<Json>("GET", `/api/campaigns/${c.id}/anchored/values`);
    const rows = values.values as Json[];
    const row = rows.find((r) => r.answer === fixed.answer)!;
    say(`values: ${JSON.stringify(rows.map((r) => [r.item, r.said, r.value]))}`);
    expect(row.said).toBe("like_pre");
    expect(row.value).toBe("not_given");
    // the earlier answer is kept, superseded by the correction
    const all = (await campaigns.answers(c.id)) as unknown as Json[];
    const earlier = all.find((a) => a.id === fixed.supersedes);
    say(`answers: ${JSON.stringify(all.map((a) => [a.id, a.value, a.via ?? null, a.supersedes_id ?? a.supersedes ?? null, a.superseded_by ?? null]))}`);
    expect(earlier?.value).toBe("like_post");
    await act(async () => root!.unmount());
    root = null;
  });

  it("pair: answer, go back, change; the values resolve the correction per stack", async () => {
    const c = await campaigns.one(PAIR);
    root = createRoot(host);
    await act(async () => root!.render(<PairReader caps={caps} id={String(c.id)} />));
    await readAndCorrect("1", "5", "4");
    const mine = await campaigns.mine(c.id);
    const fixed = mine.answers.find((a) => a.via === "amend")!;
    expect(fixed.value).toBe("both_post");
    const values = await door<Json>("GET", `/api/campaigns/${c.id}/pair/values`);
    const rows = (values.values as Json[]).filter((r) => r.answer === fixed.answer);
    say(`values: ${JSON.stringify(rows.map((r) => [r.item, r.side, r.said, r.value]))}`);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.value).toBe("given");
    const all = (await campaigns.answers(c.id)) as unknown as Json[];
    expect(all.find((a) => a.id === fixed.supersedes)?.value).toBe("left_post");
  });
});
