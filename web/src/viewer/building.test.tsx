// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A picture built when first asked for (Wave 7a, H2 round 3): the manifest
// door's 202 is waited out, asking again after each Retry-After, with the
// build's progress kept for the page to show as "Preparing the picture"; a
// 422 is "This picture could not be built" with the reason in words; a tile
// says the same; and nowhere is a command to copy.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetPictures, fractionOf, NotBuilt, pictureState, untilBuilt, pictureAnswer, retryPause, Preparing } from "./building";
import { doors } from "./doors";
import { PictureWait } from "./PictureWait";
import { tileAbsence } from "./tiles";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const building = (state = "running", progress: unknown = { done: 3, total: 12 }) =>
  new Response(JSON.stringify({ stack: 7, building: true, job: 41, state, progress, place: "working", retry_after: 2, message: "the picture is being built" }), { status: 202, headers: { "Retry-After": "2" } });
const failed = () => new Response(JSON.stringify({ error: "the build failed", disclosure: "safe", stack: 7, building: false, job: 41, reason: "mixed_matrix" }), { status: 422 });
const MANIFEST = { stack: 7, levels: 4, shape: [20, 256, 256], spacing: [1, 1, 1], window: { center: 40, width: 80 } };

afterEach(() => {
  vi.unstubAllGlobals();
  forgetPictures();
});

describe("the manifest while the picture is built", () => {
  it("asks again after each Retry-After until it is there, keeping the build's progress for the page", async () => {
    const answers = [building("queued", null), building("running", { done: 3, total: 12 }), new Response(JSON.stringify(MANIFEST), { status: 200 })];
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return answers.shift()!;
    });
    const waits: number[] = [];
    const seen: (string | number | null)[] = [];
    const m = await untilBuilt(
      7,
      async () => {
        const r = await fetch("/api/instances/7/manifest");
        await pictureAnswer(r, 7);
        return (await r.json()) as typeof MANIFEST;
      },
      async (ms) => {
        waits.push(ms);
        const s = pictureState(7);
        seen.push(s?.kind === "building" ? (s.building.fraction ?? s.building.state) : null);
      },
    );
    expect(m.stack).toBe(7);
    expect(asked).toHaveLength(3);
    // quickly first, then longer, never past what the engine asked
    expect(waits).toEqual([250, 375]);
    expect(seen).toEqual(["queued", 0.25]);
    // once there, nothing is waited for
    expect(pictureState(7)).toBeNull();
  });

  it("asks again quickly at first, half again longer each time, never past what the engine asked", async () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => retryPause(n, 2))).toEqual([250, 375, 563, 844, 1266, 1898, 2000]);
    // an engine that asks a quarter of a second is asked every quarter of a second
    expect([0, 3, 9].map((n) => retryPause(n, 0.25))).toEqual([250, 250, 250]);
    // its pause in milliseconds is read too
    const r = new Response(JSON.stringify({ stack: 7, building: true, job: 1, state: "running", retry_after_ms: 250 }), { status: 202 });
    const e = await pictureAnswer(r, 7).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Preparing);
    expect((e as Preparing).building.retryAfter).toBe(0.25);
  });

  it("is the doors' own manifest: a 202 never reads as a manifest", async () => {
    const answers = [building(), new Response(JSON.stringify(MANIFEST), { status: 200 })];
    vi.stubGlobal("fetch", async () => answers.shift()!);
    vi.useFakeTimers();
    const p = doors.manifest(7);
    await vi.advanceTimersByTimeAsync(2000);
    vi.useRealTimers();
    expect((await p).shape).toEqual([20, 256, 256]);
  });

  it("stops at a 422 as a picture that could not be built, with its reason, and asks no more", async () => {
    let asked = 0;
    vi.stubGlobal("fetch", async () => {
      asked += 1;
      return failed();
    });
    const e = await doors.manifest(7).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(NotBuilt);
    expect((e as NotBuilt).reason).toBe("mixed_matrix");
    expect(asked).toBe(1);
    expect(pictureState(7)).toEqual({ kind: "failed", reason: "mixed_matrix" });
    expect(tileAbsence(e)).toBe("could not be built: images of different sizes");
  });

  it("reads the build's progress from the shapes a job writes", () => {
    expect(fractionOf({ done: 1, total: 4 })).toBe(0.25);
    expect(fractionOf({ fraction: 0.5 })).toBe(0.5);
    expect(fractionOf(40)).toBe(0.4);
    expect(fractionOf(null)).toBeNull();
  });
});

describe("what the page shows", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("is a quiet Preparing the picture with progress, then the reason when it failed, never a command", async () => {
    let answer = building("running", { done: 6, total: 12 });
    vi.stubGlobal("fetch", async () => answer);
    act(() => root.render(<PictureWait stack={7} />));
    let go: () => void = () => undefined;
    const paused = new Promise<void>((done) => (go = done));
    const p = untilBuilt(
      7,
      async () => {
        const r = await fetch("/x");
        await pictureAnswer(r, 7);
        return 1;
      },
      () => paused,
    ).catch(() => null);
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
    expect(host.textContent).toBe("Preparing the picture");
    expect(host.querySelector("progress")?.getAttribute("value")).toBe("0.5");
    answer = failed();
    go();
    await act(async () => {
      await p;
    });
    expect(host.textContent).toBe("This picture could not be built: images of different sizes");
    expect(host.textContent).not.toMatch(/pyramid|nils |build --/);
  });
});
