// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// A tile whose manifest is still being read says nothing; only a picture the
// engine builds says it is being prepared (review of 2026-10-10).

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { forgetPictures, pictureAnswer, untilBuilt } from "./building";
import { Tile } from "./Tile";
import { forgetManifests } from "./tiles";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.unstubAllGlobals();
  forgetManifests();
  forgetPictures();
});

it("says it prepares the picture only while the engine builds it, not while it is read", async () => {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<Tile stack={7} />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(host.textContent).not.toContain("Preparing the picture");
  // the engine says it builds it: the tile says so
  void untilBuilt(
    7,
    async () => {
      await pictureAnswer(new Response(JSON.stringify({ stack: 7, building: true, job: 1, state: "running" }), { status: 202 }), 7);
      return 1;
    },
    () => new Promise<void>(() => undefined),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(host.textContent).toContain("Preparing the picture");
  act(() => root.unmount());
  host.remove();
});
