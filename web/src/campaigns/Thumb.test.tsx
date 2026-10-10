// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A gallery's picture that fails is asked for again after a pause, twice,
// and then says it is not ready, with a button that asks once more; never a
// blank cell.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { afterFailure, Thumb, thumbAttempt, THUMB_RETRIES } from "./Thumb";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("a picture's attempts", () => {
  it("marks a retry so the browser asks the engine again", () => {
    expect(thumbAttempt("/api/instances/7/thumb", 0)).toBe("/api/instances/7/thumb");
    expect(thumbAttempt("/api/instances/7/thumb", 1)).toBe("/api/instances/7/thumb?retry=1");
    expect(thumbAttempt("/api/instances/7/thumb?size=96", 2)).toBe("/api/instances/7/thumb?size=96&retry=2");
  });
  it("pauses longer each time, then gives up", () => {
    expect(THUMB_RETRIES.length).toBe(2);
    expect(afterFailure(0)).toBe(THUMB_RETRIES[0]);
    expect(afterFailure(1)).toBeGreaterThan(THUMB_RETRIES[0]);
    expect(afterFailure(2)).toBeNull();
  });
});

describe("the picture", () => {
  let root: Root;
  let el: HTMLDivElement;
  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    vi.useRealTimers();
  });
  // the door asked why: a plain failure, a picture being built, or one that could not be
  const plain = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
  const fail = async () => {
    await act(async () => {
      el.querySelector("img")!.dispatchEvent(new Event("error"));
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it("is asked for again after a failure, and shows when it comes", async () => {
    act(() => root.render(<Thumb src="/api/instances/7/thumb" ask={plain} />));
    expect(el.querySelector("img")!.getAttribute("src")).toBe("/api/instances/7/thumb");
    await fail();
    // no broken picture while it waits
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector(".thumb-waiting")).not.toBeNull();
    act(() => vi.advanceTimersByTime(THUMB_RETRIES[0]));
    expect(el.querySelector("img")!.getAttribute("src")).toBe("/api/instances/7/thumb?retry=1");
    act(() => el.querySelector("img")!.dispatchEvent(new Event("load")));
    expect(el.querySelector(".thumb-missing")).toBeNull();
  });

  it("says it is not ready after its retries, and a button asks once more", async () => {
    act(() => root.render(<Thumb src="/api/instances/8/thumb" ask={plain} />));
    await fail();
    act(() => vi.advanceTimersByTime(THUMB_RETRIES[0]));
    await fail();
    act(() => vi.advanceTimersByTime(THUMB_RETRIES[1]));
    await fail();
    const missing = el.querySelector(".thumb-missing")!;
    expect(missing.textContent).toContain("picture not ready");
    expect(missing.getAttribute("aria-label")).toBe("picture not ready");
    act(() => (missing.querySelector("button") as HTMLButtonElement).click());
    expect(el.querySelector("img")!.getAttribute("src")).toBe("/api/instances/8/thumb?retry=3");
  });

  it("says Preparing the picture while the engine builds it, asks again when it says, however often, and never shows a grey box", async () => {
    const building = (async () => new Response(JSON.stringify({ stack: 9, building: true, job: 4, state: "running", retry_after: 3 }), { status: 202, headers: { "Retry-After": "3" } })) as unknown as typeof fetch;
    act(() => root.render(<Thumb src="/api/instances/9/thumb" ask={building} />));
    for (let i = 0; i < 4; i++) {
      await fail();
      expect(el.querySelector(".picture-wait")?.textContent).toContain("Preparing the picture");
      expect(el.querySelector(".thumb-missing")).toBeNull();
      act(() => vi.advanceTimersByTime(3000));
      expect(el.querySelector("img")!.getAttribute("src")).toBe(`/api/instances/9/thumb?retry=${i + 1}`);
    }
  });

  it("says a picture could not be built, with the reason in words, and offers no command", async () => {
    const failedBuild = (async () => new Response(JSON.stringify({ error: "x", stack: 9, building: false, job: 4, reason: "compressed" }), { status: 422 })) as unknown as typeof fetch;
    act(() => root.render(<Thumb src="/api/instances/9/thumb" ask={failedBuild} />));
    await fail();
    expect(el.textContent).toBe("This picture could not be built: a compression it cannot read");
    expect(el.textContent).not.toMatch(/pyramid|nils /);
  });
});
