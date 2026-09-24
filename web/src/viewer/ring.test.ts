// SPDX-License-Identifier: AGPL-3.0-only
// The gate of the slab ring (Wave 5 slice B6): the ring fetches ahead in the
// scroll direction and evicts behind, the level follows the viewport, the
// tiles land where they belong.
import { describe, expect, it } from "vitest";
import { unpackSlab, unpackTiles, type Manifest } from "./doors";
import { direction, fillOrder, fps, levelFor, placeTile, plan, ringSlabs, slabOf, tileGrid, volumeLevel, VOLUME_BUDGET } from "./ring";

describe("the slab ring", () => {
  it("wants the current slab, two ahead and one behind, inside the stack", () => {
    expect(ringSlabs(100, 2500, 1)).toEqual([3, 4, 5, 2]);
    expect(ringSlabs(100, 2500, -1)).toEqual([3, 2, 1, 4]);
    expect(ringSlabs(5, 2500, -1)).toEqual([0, 1]);
    expect(ringSlabs(2490, 2500, 1)).toEqual([77, 78, 76]);
    expect(slabOf(31)).toBe(0);
    expect(slabOf(32)).toBe(1);
  });
  it("fetches the missing slabs nearest first and evicts the farthest behind, down to the budget", () => {
    const resident = new Set([0, 1, 2, 3]);
    const p = plan(100, 2500, 1, resident, 6);
    expect(p.fetch).toEqual([4, 5]);
    expect(p.evict).toEqual([]);
    const full = new Set([0, 1, 2, 3, 4, 5]);
    const q = plan(200, 2500, 1, full, 6);
    expect(q.fetch).toEqual([6, 7, 8]);
    expect(q.evict).toEqual([0, 1, 2]);
    // never resident: the whole stack of 79 slabs never fits the budget of 6
    expect(full.size + q.fetch.length - q.evict.length).toBeLessThanOrEqual(6);
  });
  it("reads the direction of travel from the last two planes", () => {
    expect(direction(null, 10)).toBe(1);
    expect(direction(10, 12)).toBe(1);
    expect(direction(12, 10)).toBe(-1);
  });
});

describe("the level and the tiles", () => {
  it("picks the coarsest level that still fills the viewport, promoted on zoom", () => {
    expect(levelFor(512, 1024, 4)).toBe(1);
    expect(levelFor(1024, 1024, 4)).toBe(0);
    expect(levelFor(200, 1024, 4)).toBe(2);
    expect(levelFor(512, 1024, 4, 2)).toBe(0);
    expect(levelFor(100, 1024, 4)).toBe(3);
    expect(levelFor(4000, 1024, 4)).toBe(0);
  });
  it("counts frames over the last second", () => {
    expect(fps([0, 100, 500, 900, 1500, 1600], 1600)).toBe(3);
  });
  it("lays a plane's tiles row major, clipping the edge", () => {
    expect(tileGrid(1024, 1024, 256)).toEqual({ ty: 4, tx: 4 });
    expect(tileGrid(300, 260, 256)).toEqual({ ty: 2, tx: 2 });
    const plane = new Uint16Array(3 * 3);
    placeTile(plane, 3, 3, 2, 0, new Uint16Array([1, 2, 3, 4]), 2, 2);
    placeTile(plane, 3, 3, 2, 1, new Uint16Array([5, 6, 7, 8]), 2, 2);
    placeTile(plane, 3, 3, 2, 3, new Uint16Array([9, 9, 9, 9]), 2, 2);
    expect([...plane]).toEqual([1, 2, 5, 3, 4, 7, 0, 0, 9]);
  });
  it("unpacks the door's tile pack, offsets from the start of the container as the engine writes them", () => {
    // the engine's container(): [u32 count][u32 offset...][parts], each offset from the container's first byte
    const buf = new ArrayBuffer(4 + 8 + 5);
    const v = new DataView(buf);
    v.setUint32(0, 2, true);
    v.setUint32(4, 12, true);
    v.setUint32(8, 15, true);
    new Uint8Array(buf, 12).set([7, 8, 9, 1, 2]);
    const tiles = unpackTiles(buf);
    expect(tiles.map((t) => [...t])).toEqual([[7, 8, 9], [1, 2]]);
  });
  it("unpacks a slab: the same container one level up, each part a plane's container of tiles", () => {
    const container = (parts: number[][]): number[] => {
      const head = 4 + 4 * parts.length;
      const out = [parts.length, 0, 0, 0];
      let at = head;
      for (const p of parts) {
        out.push(at & 255, (at >> 8) & 255, 0, 0);
        at += p.length;
      }
      return out.concat(...parts);
    };
    const slab = container([container([[1, 1], [2]]), container([[3], [4, 4, 4]])]);
    const planes = unpackSlab(new Uint8Array(slab).buffer);
    expect(planes.map((p) => p.map((t) => [...t]))).toEqual([
      [[1, 1], [2]],
      [[3], [4, 4, 4]],
    ]);
  });
});

const manifest = (shape: [number, number, number], levels = 4): Manifest => ({
  codec: "htj2k",
  tile: 256,
  levels,
  shape,
  spacing: [1, 1, 1],
  dtype: "uint16",
  window: { center: 500, width: 1000 },
});

describe("the planes' level", () => {
  it("takes the finest level whose volume fits the budget", () => {
    // 220 x 1024 x 1024 at 16 bits is 461 MB at level 0: the 256 MB budget takes level 1, as study A3 has it
    expect(volumeLevel(manifest([220, 1024, 1024]))).toEqual({ level: 1, stride: 1, dims: [512, 512, 220], bytes: 220 * 512 * 512 * 2 });
    expect(VOLUME_BUDGET).toBe(256 * 1024 * 1024);
    expect(volumeLevel(manifest([220, 1024, 1024]), 512 * 1024 * 1024)?.level).toBe(0);
  });
  it("takes every second plane of a stack deeper than the card's 3D texture, and a coarser level for the rest", () => {
    // the photon-counting scale: 2500 planes of 1024 by 1024
    const p = volumeLevel(manifest([2500, 1024, 1024]), VOLUME_BUDGET, 2048)!;
    expect(p.stride).toBe(2);
    expect(p.dims[2]).toBe(1250);
    expect(p.level).toBe(2);
    expect(p.bytes).toBeLessThanOrEqual(VOLUME_BUDGET);
    // a card that takes 4096 deep holds every plane, at level 3 within the budget (level 2 would be 327 MB)
    expect(volumeLevel(manifest([2500, 1024, 1024]), VOLUME_BUDGET, 4096)).toMatchObject({ level: 3, stride: 1 });
  });
  it("says none fits when even the coarsest level is over the budget", () => {
    expect(volumeLevel(manifest([2500, 1024, 1024]), 1024 * 1024)).toBeNull();
  });
  it("fills from the current slab outwards, one on each side in turn", () => {
    expect(fillOrder(7, 3)).toEqual([3, 4, 2, 5, 1, 6, 0]);
    expect(fillOrder(5, 0)).toEqual([0, 1, 2, 3, 4]);
    expect(fillOrder(5, 9)).toEqual([4, 3, 2, 1, 0]);
    expect(new Set(fillOrder(79, 40)).size).toBe(79);
  });
});
