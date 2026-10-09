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
  /** The patient plane nearest the scan's own. */
  plane: Plane | null;
  window: { center: number; width: number } | null;
  /** How many planes the frames door holds. */
  planes: number;
  digest: string | null;
  /** The band at the top and bottom of each plane held (burned-in annotation below detail sensitive). */
  held: boolean;
  /**
   * The middle planes by the engine's names, which are the scan's own:
   * `axial` is the middle of the planes it was taken in, `coronal` and
   * `sagittal` the two across them.
   */
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
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const triple = (v: unknown): [number, number, number] | null =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number") ? (v as [number, number, number]) : null;
const PLANES = ["axial", "coronal", "sagittal"] as const;

/**
 * A preview as the engine's preview door answers it: the header at the top,
 * `middle` the three planes as `{width, height, bytes, data}` (data a JPEG
 * data URL), and `frames` `{count, width, height, bytes, url}`.
 */
export function previewOf(a: Json): Preview {
  const w = obj(a.window);
  const shape = triple(a.shape);
  const m = obj(a.middle) ?? {};
  const middle: Partial<Record<Plane, string>> = {};
  for (const p of PLANES) {
    const v = str(obj(m[p])?.data);
    if (v) middle[p] = v;
  }
  const plane = str(a.plane);
  return {
    shape,
    spacing: triple(a.spacing),
    plane: plane !== null && (PLANES as readonly string[]).includes(plane) ? (plane as Plane) : null,
    window: w && num(w.center) !== null && num(w.width) !== null ? { center: num(w.center)!, width: num(w.width)! } : null,
    planes: num(obj(a.frames)?.count) ?? shape?.[0] ?? 0,
    digest: str(a.digest),
    held: a.held === true,
    middle,
  };
}

/**
 * A planes body (`application/x-nils-frames`) read: little-endian u32
 * `from`, u32 count, u32 width, u32 height, then count + 1 u32 offsets
 * counted from the start of the body, then the JPEGs back to back; frame i
 * is plane `from + i`. A frame whose offsets fall outside the body is left
 * out.
 */
export function parseFrames(buf: ArrayBuffer): { frames: FrameEntry[]; data: ArrayBuffer; width: number; height: number } {
  if (buf.byteLength < 16) throw new Error("the planes body is too short");
  const v = new DataView(buf);
  const from = v.getUint32(0, true);
  const count = v.getUint32(4, true);
  const width = v.getUint32(8, true);
  const height = v.getUint32(12, true);
  const lead = 16 + 4 * (count + 1);
  if (lead > buf.byteLength) throw new Error("the planes body's offsets run past its end");
  const at = (i: number) => v.getUint32(16 + 4 * i, true);
  const frames: FrameEntry[] = [];
  for (let i = 0; i < count; i++) {
    const a = at(i);
    const b = at(i + 1);
    if (a < lead || b < a || b > buf.byteLength) continue;
    frames.push({ plane: from + i, offset: a, length: b - a, mime: "image/jpeg" });
  }
  return { frames, data: buf, width, height };
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
/** A range of planes; naming the preview's digest (`v`) lets the browser keep the answer for good. */
export const planesUrl = (stack: number, from: number, to: number, digest?: string | null) =>
  `/api/instances/${stack}/preview/planes?from=${from}&to=${to}${digest ? `&v=${encodeURIComponent(digest)}` : ""}`;

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
  load(stack: number, planes: number, at: number, digest?: string | null): Promise<void> {
    let r = this.reading.get(stack);
    if (!r) {
      r = this.readAll(stack, planes, at, digest).finally(() => this.reading.delete(stack));
      this.reading.set(stack, r);
    }
    return r;
  }

  private async readAll(stack: number, planes: number, at: number, digest?: string | null): Promise<void> {
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
      const res = await this.fetcher(planesUrl(stack, from, to, digest), { headers: HEADERS });
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
