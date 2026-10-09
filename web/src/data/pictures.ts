// SPDX-License-Identifier: AGPL-3.0-only
// A scan's pictures, made when its dataset was sorted (record 55 H2, the Data
// page's foundations): the preview door answers a small header and the three
// middle planes, and the planes door every plane of the stored axis at
// display size as frames in one body. The browser draws them as plain images
// (createImageBitmap on a canvas): no WASM, no cornerstone, no WebGL for
// looking and scrolling. What was read and decoded is kept in memory, the
// decoded bitmaps in an LRU by bytes, so going back is free and the next two
// scans are warm before they are asked for.

/** The middle planes a preview holds, by the plane they lie in. */
export type Plane = "axial" | "coronal" | "sagittal";

/** A scan's preview: what its frames are, and its three middle planes as data URLs. */
export interface Preview {
  /** The stored volume's shape, planes first: [planes, rows, columns]. */
  shape: [number, number, number] | null;
  /** Millimetres between planes, rows and columns, in the shape's order. */
  spacing: [number, number, number] | null;
  orientation: string | null;
  window: { center: number; width: number } | null;
  /** How many planes the frames door holds. */
  planes: number;
  digest: string | null;
  middle: Partial<Record<Plane, string>>;
}

/** One frame's place in a planes body. */
export interface FrameEntry {
  plane: number;
  offset: number;
  length: number;
  mime: string;
}

type Json = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const triple = (v: unknown): [number, number, number] | null =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number") ? (v as [number, number, number]) : null;

/**
 * A preview as the door answers it. The header may stand at the top or under
 * `header`, and the three pictures at the top or under `middle` (or
 * `pictures`), so the desk reads either shape the engine settles on.
 */
export function previewOf(a: Json): Preview {
  const h = (a.header && typeof a.header === "object" ? a.header : a) as Json;
  const pics = (a.middle && typeof a.middle === "object" ? a.middle : a.pictures && typeof a.pictures === "object" ? a.pictures : a) as Json;
  const w = h.window && typeof h.window === "object" ? (h.window as Json) : null;
  const shape = triple(h.shape);
  const middle: Partial<Record<Plane, string>> = {};
  for (const p of ["axial", "coronal", "sagittal"] as const) {
    const v = str(pics[p]);
    if (v) middle[p] = v;
  }
  return {
    shape,
    spacing: triple(h.spacing),
    orientation: str(h.orientation),
    window: w && num(w.center) !== null && num(w.width) !== null ? { center: num(w.center)!, width: num(w.width)! } : null,
    planes: num(h.planes) ?? shape?.[0] ?? 0,
    digest: str(h.digest),
    middle,
  };
}

/** The plane a scan was taken in, from its orientation word: the one its frames scroll through. */
export function planeOf(orientation: string | null | undefined): Plane {
  const o = (orientation ?? "").toLowerCase();
  if (o.startsWith("sag")) return "sagittal";
  if (o.startsWith("cor")) return "coronal";
  return "axial";
}

/**
 * A planes body read: a little-endian u32 length, that many bytes of JSON
 * index (`{frames: [{plane, offset, length, mime}]}` or the array alone, a
 * `mime` at the top for frames that name none), then the frames one after
 * another. Offsets count from the first byte after the index.
 */
export function parseFrames(buf: ArrayBuffer): { frames: FrameEntry[]; data: ArrayBuffer } {
  if (buf.byteLength < 4) throw new Error("the planes body is too short");
  const len = new DataView(buf).getUint32(0, true);
  if (4 + len > buf.byteLength) throw new Error("the planes body's index runs past its end");
  const index = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len))) as unknown;
  const top = (Array.isArray(index) ? {} : (index as Json)) as Json;
  const rows = (Array.isArray(index) ? index : Array.isArray(top.frames) ? top.frames : []) as Json[];
  const mime = str(top.mime) ?? "image/webp";
  const data = buf.slice(4 + len);
  const frames: FrameEntry[] = [];
  for (const r of rows) {
    const plane = num(r.plane);
    const offset = num(r.offset);
    const length = num(r.length);
    if (plane === null || offset === null || length === null || offset + length > data.byteLength) continue;
    frames.push({ plane, offset, length, mime: str(r.mime) ?? mime });
  }
  return { frames, data };
}

/** The ranges a scan's frames are read in: the planes around `at` first, then the rest below and above. */
export function frameRanges(planes: number, at: number, first = 16): [number, number][] {
  if (planes <= 0) return [];
  const a = Math.max(0, Math.min(planes - first, at - Math.floor(first / 2)));
  const b = Math.min(planes, a + first);
  const out: [number, number][] = [[a, b]];
  if (b < planes) out.push([b, planes]);
  if (a > 0) out.push([0, a]);
  return out;
}

/** The planes from `at` outwards, nearest first: the order they are decoded in. */
export function outwards(planes: number, at: number): number[] {
  const out: number[] = [];
  for (let d = 0; out.length < planes && d <= planes; d++) {
    if (at + d < planes && at + d >= 0) out.push(at + d);
    if (d > 0 && at - d >= 0 && at - d < planes) out.push(at - d);
  }
  return out;
}

/** What a decoded picture is to the cache: something with a size, closed when let go. */
export interface Bitmap {
  width: number;
  height: number;
  close?: () => void;
}

/** A least-recently-used store of decoded pictures, bounded by their bytes; the oldest is closed when the budget is passed. */
export class BitmapLru<B extends Bitmap = Bitmap> {
  private map = new Map<string, B>();
  bytes = 0;
  constructor(readonly budget: number) {}
  private cost(b: B): number {
    return Math.max(1, b.width * b.height * 4);
  }
  get(key: string): B | undefined {
    const b = this.map.get(key);
    if (b !== undefined) {
      this.map.delete(key);
      this.map.set(key, b);
    }
    return b;
  }
  has(key: string): boolean {
    return this.map.has(key);
  }
  set(key: string, b: B): void {
    const was = this.map.get(key);
    if (was !== undefined) {
      this.map.delete(key);
      this.bytes -= this.cost(was);
      if (was !== b) was.close?.();
    }
    this.map.set(key, b);
    this.bytes += this.cost(b);
    while (this.bytes > this.budget && this.map.size > 1) {
      const [k, old] = this.map.entries().next().value as [string, B];
      this.map.delete(k);
      this.bytes -= this.cost(old);
      old.close?.();
    }
  }
  get size(): number {
    return this.map.size;
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}

export const previewUrl = (stack: number) => `/api/instances/${stack}/preview`;
export const planesUrl = (stack: number, from: number, to: number) => `/api/instances/${stack}/preview/planes?from=${from}&to=${to}`;

const HEADERS = { "X-Nils-Desk": "1" };

export interface Fetcher {
  (url: string, init?: RequestInit): Promise<Response>;
}

export interface Decoder {
  (blob: Blob): Promise<Bitmap>;
}

const decodeBlob: Decoder = (blob) => createImageBitmap(blob);

/**
 * The page's pictures: previews by stack (kept as promises, so two asks are
 * one read), the encoded frames of the scans read lately, and their decoded
 * bitmaps in an LRU. One per page; tests make their own with a fetch and a
 * decoder of their own.
 */
export class Pictures {
  private previews = new Map<number, Promise<Preview>>();
  private frames = new Map<number, Map<number, Blob>>();
  private reading = new Map<number, Promise<void>>();
  private listeners = new Set<(stack: number) => void>();
  readonly bitmaps: BitmapLru;
  constructor(
    private fetcher: Fetcher = (u, i) => fetch(u, i),
    private decode: Decoder = decodeBlob,
    budget = 320 * 1024 * 1024,
    private keepScans = 8,
  ) {
    this.bitmaps = new BitmapLru(budget);
  }

  /** Told whenever a frame of `stack` is decoded, so the viewer draws it. */
  on(f: (stack: number) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  /** A scan's preview, read once. */
  preview(stack: number): Promise<Preview> {
    let p = this.previews.get(stack);
    if (!p) {
      p = this.fetcher(previewUrl(stack), { headers: HEADERS })
        .then((r) => {
          if (!r.ok) throw new Error(`the preview answered ${r.status}`);
          return r.json() as Promise<Json>;
        })
        .then(previewOf);
      p.catch(() => this.previews.delete(stack));
      this.previews.set(stack, p);
      if (this.previews.size > 64) this.previews.delete(this.previews.keys().next().value as number);
    }
    return p;
  }

  /** A plane's decoded bitmap, where it is in memory. */
  bitmap(stack: number, plane: number): Bitmap | undefined {
    return this.bitmaps.get(`${stack}:${plane}`);
  }

  /** Whether a plane's encoded frame was read. */
  hasFrame(stack: number, plane: number): boolean {
    return this.frames.get(stack)?.has(plane) ?? false;
  }

  /**
   * Every frame of a scan read (the planes around `at` first) and decoded
   * from `at` outwards; a second ask while the first reads is the same read.
   * A frame already decoded is not decoded again.
   */
  load(stack: number, planes: number, at: number): Promise<void> {
    let r = this.reading.get(stack);
    if (!r) {
      r = this.readAll(stack, planes, at).finally(() => this.reading.delete(stack));
      this.reading.set(stack, r);
    }
    return r;
  }

  private async readAll(stack: number, planes: number, at: number): Promise<void> {
    const have = this.frames.get(stack) ?? new Map<number, Blob>();
    this.frames.delete(stack);
    this.frames.set(stack, have);
    while (this.frames.size > this.keepScans) this.frames.delete(this.frames.keys().next().value as number);
    // the next range is read while the one before decodes
    const decoding: Promise<void>[] = [];
    for (const [from, to] of frameRanges(planes, at)) {
      let missing = false;
      for (let z = from; z < to; z++) if (!have.has(z)) missing = true;
      if (!missing) continue;
      const res = await this.fetcher(planesUrl(stack, from, to), { headers: HEADERS });
      if (!res.ok) throw new Error(`the planes answered ${res.status}`);
      const { frames, data } = parseFrames(await res.arrayBuffer());
      for (const f of frames) have.set(f.plane, new Blob([data.slice(f.offset, f.offset + f.length)], { type: f.mime }));
      decoding.push(this.decodeAround(stack, have, at, frames.map((f) => f.plane)));
    }
    await Promise.all(decoding);
  }

  /** The planes just read decoded, nearest `at` first, a few at a time. */
  private async decodeAround(stack: number, have: Map<number, Blob>, at: number, these: number[]): Promise<void> {
    const order = [...these].sort((a, b) => Math.abs(a - at) - Math.abs(b - at));
    const lanes = 6;
    let i = 0;
    const lane = async () => {
      while (i < order.length) {
        const z = order[i++];
        const key = `${stack}:${z}`;
        if (this.bitmaps.has(key)) continue;
        const blob = have.get(z);
        if (!blob) continue;
        try {
          this.bitmaps.set(key, await this.decode(blob));
          for (const f of this.listeners) f(stack);
        } catch {
          // a frame that does not decode is left out; its neighbours still draw
        }
      }
    };
    await Promise.all(Array.from({ length: lanes }, lane));
  }

  /** A plane decoded again from its frame where the LRU let it go; null where the frame was never read. */
  async again(stack: number, plane: number): Promise<Bitmap | null> {
    const blob = this.frames.get(stack)?.get(plane);
    if (!blob) return null;
    const b = await this.decode(blob);
    this.bitmaps.set(`${stack}:${plane}`, b);
    return b;
  }
}

let shared: Pictures | null = null;
/** The page's one store of pictures. */
export function pictures(): Pictures {
  shared ??= new Pictures();
  return shared;
}
