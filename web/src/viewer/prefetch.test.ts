// SPDX-License-Identifier: AGPL-3.0-only
// The pictures ready (record 48 R1): warming a stack asks for its manifest
// once and then exactly the three first planes the viewer's planes view
// draws, so the browser's cache holds what the next item shows.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Manifest } from "./doors";
import { geometry } from "./geometry";
import { firstPlanes, PLANES, serverPlane, warmStack } from "./prefetch";
import { forgetManifests } from "./tiles";

const m: Manifest = { codec: "htj2k", tile: 256, levels: 4, shape: [96, 256, 256], spacing: [1.2, 1, 1], dtype: "uint16", window: { center: 500, width: 1000 } };

afterEach(() => {
  forgetManifests();
  vi.unstubAllGlobals();
});

describe("the first planes", () => {
  it("are the middle of each plane at the server's level, the same addresses the viewer draws", () => {
    const urls = firstPlanes(7, m);
    expect(urls).toEqual(PLANES.map((p) => serverPlane(7, m, geometry(m), p, 0.5).src));
    expect(urls).toEqual(["/api/instances/7/render/2/48?w=1000&c=500&axis=z", "/api/instances/7/render/2/32?w=1000&c=500&axis=y", "/api/instances/7/render/2/32?w=1000&c=500&axis=x"]);
  });

  it("warms a stack: its manifest once, then its three planes", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", (url: string) => {
      asked.push(url);
      return Promise.resolve(new Response(JSON.stringify(m), { status: 200, headers: { "content-type": "application/json" } }));
    });
    // no Image in the test's world: the planes are fetched instead
    vi.stubGlobal("Image", undefined);
    expect(await warmStack(7)).toBe(3);
    expect(await warmStack(7)).toBe(3);
    expect(asked.filter((u) => u.endsWith("/manifest"))).toEqual(["/api/instances/7/manifest"]);
    expect(asked.filter((u) => u.includes("/render/")).length).toBe(6);
  });
});
