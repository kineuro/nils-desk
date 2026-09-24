// SPDX-License-Identifier: AGPL-3.0-only
// The gate of the tile (record 45 S2): a grid reads each stack's manifest
// once and a few at a time, a position names a plane and a step moves one,
// tiles given one sync move together, the level fills the tile, and a tile
// says in the fewest words why it has no picture.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DoorError } from "../ask/client";
import type { Manifest } from "./doors";
import { Tile } from "./Tile";
import { forgetManifests, MANIFESTS_AT_ONCE, planeAt, planesAlong, step, tileAbsence, tileLevel, tileManifest, TileSync } from "./tiles";

const m = (shape: [number, number, number]): Manifest => ({ codec: "htj2k", tile: 256, levels: 4, shape, spacing: [1, 1, 1], dtype: "uint16", window: { center: 500, width: 1000 } });

describe("the tile", () => {
  it("reads each stack's manifest once, and no more than a few at a time", async () => {
    forgetManifests();
    let running = 0;
    let most = 0;
    let reads = 0;
    const read = () => {
      reads++;
      running++;
      most = Math.max(most, running);
      return new Promise<Manifest>((r) => setTimeout(() => (running--, r(m([24, 128, 128]))), 5));
    };
    const stacks = Array.from({ length: 40 }, (_, i) => i + 1);
    await Promise.all([...stacks, ...stacks].map((s) => tileManifest(s, read)));
    expect(reads).toBe(40);
    expect(most).toBeLessThanOrEqual(MANIFESTS_AT_ONCE);
  });
  it("asks again after a refusal, since a grant may have changed", async () => {
    forgetManifests();
    let reads = 0;
    const refuse = () => (reads++, Promise.reject(new DoorError(403, { error: "gated" })));
    await expect(tileManifest(7, refuse)).rejects.toBeInstanceOf(DoorError);
    await expect(tileManifest(7, refuse)).rejects.toBeInstanceOf(DoorError);
    expect(reads).toBe(2);
  });
  it("names a plane from a position and moves one plane a step, inside the stack", () => {
    expect(planeAt(0.5, 24)).toBe(12);
    expect(planeAt(0, 24)).toBe(0);
    expect(planeAt(1, 24)).toBe(23);
    expect(planeAt(step(0.5, 24, 1), 24)).toBe(13);
    expect(planeAt(step(0.5, 24, -1), 24)).toBe(11);
    expect(step(1, 24, 1)).toBe(1);
    expect(step(0, 24, -1)).toBe(0);
    expect(step(0.3, 1, 1)).toBe(0.3);
  });
  it("counts the planes along its axis at its level", () => {
    expect(planesAlong(m([24, 128, 96]), 0, "z")).toBe(24);
    expect(planesAlong(m([24, 128, 96]), 1, "y")).toBe(64);
    expect(planesAlong(m([24, 128, 96]), 1, "x")).toBe(48);
  });
  it("takes the coarsest level that still fills its pixels", () => {
    expect(tileLevel(m([220, 1024, 1024]), 128)).toBe(3);
    expect(tileLevel(m([220, 1024, 1024]), 256)).toBe(2);
    expect(tileLevel(m([24, 128, 128]), 96)).toBe(0);
  });
  it("moves every tile of a set together", () => {
    const sync = new TileSync(0.5);
    let heard = 0;
    const off = sync.subscribe(() => heard++);
    sync.set(0.75);
    sync.set(0.75);
    sync.set(2);
    expect(sync.get()).toBe(1);
    expect(heard).toBe(2);
    off();
    sync.set(0);
    expect(heard).toBe(2);
  });
  it("says why there is no picture in the fewest words", () => {
    expect(tileAbsence(new DoorError(404, {}))).toBe("no picture yet");
    expect(tileAbsence(new DoorError(403, {}))).toBe("not open to you");
    expect(tileAbsence(new DoorError(409, {}))).toBe("no working place");
    expect(tileAbsence(new TypeError("fetch"))).toBe("no picture");
  });
  it("renders its frame and caption before it has read anything, and a button when it can open the stack", () => {
    const plain = renderToStaticMarkup(<Tile stack={12} />);
    expect(plain).toContain('data-stack="12"');
    expect(plain).toContain("stack 12");
    expect(plain).not.toContain("<img");
    const open = renderToStaticMarkup(<Tile stack={12} caption="T1w" onOpen={() => undefined} />);
    expect(open).toContain("<button");
    expect(open).toContain('aria-label="open stack 12"');
    expect(open).toContain("T1w");
  });
});
