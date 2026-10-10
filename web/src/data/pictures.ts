// SPDX-License-Identifier: AGPL-3.0-only
// A scan's pictures, made when its dataset was sorted (record 55 H2, the Data
// page's foundations): the preview door answers a small header and the three
// middle planes, and the planes door every plane of the stored axis at
// display size as frames in one body. The browser draws them as plain images
// (createImageBitmap on a canvas): no WASM, no cornerstone, no WebGL for
// looking and scrolling. Frames are read in ranges from the plane shown
// outwards and the planes near it kept decoded, so neither the first sharp
// frame nor scrolling near it waits for the whole stack. What was read and
// decoded is kept in memory, the decoded bitmaps in an LRU by bytes, so going
// back is free; the next two scans' middle frames are read and decoded ahead,
// so the next scan is sharp in the frame after the key.

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
  /**
   * The first picture of a scan with no preview yet, decoded from its middle
   * plane's one file (`partial: true`): only `middle.axial`, never cached;
   * the whole preview is made after, and asked for again.
   */
  partial: boolean;
  /** How long the engine says to wait before asking a partial preview again; null where it says nothing. */
  retryMs: number | null;
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
    partial: a.partial === true,
    retryMs: num(a.retry_after_ms),
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

/**
 * The next range of planes to read: around the missing plane nearest `at`
 * (the one above first on a tie), grown over the missing planes on both
 * sides to at most `span`; null when none is missing. `inside` limits the
 * search to a window of planes ([from, to), to exclusive).
 */
export function nextRange(planes: number, at: number, missing: (z: number) => boolean, span: number, inside: [number, number] = [0, planes]): [number, number] | null {
  const lo = Math.max(0, inside[0]);
  const hi = Math.min(planes, inside[1]);
  if (hi <= lo || span <= 0) return null;
  const c = Math.min(hi - 1, Math.max(lo, at));
  let p = -1;
  for (let d = 0; c + d < hi || c - d >= lo; d++) {
    if (c + d < hi && missing(c + d)) {
      p = c + d;
      break;
    }
    if (d > 0 && c - d >= lo && missing(c - d)) {
      p = c - d;
      break;
    }
  }
  if (p < 0) return null;
  let a = p;
  let b = p + 1;
  while (b - a < span) {
    const down = a > lo && missing(a - 1);
    if (down) a--;
    const up = b - a < span && b < hi && missing(b);
    if (up) b++;
    if (!up && !down) break;
  }
  return [a, b];
}

/** The ranges a whole scan is read in, from `at` outwards: `first` planes around it, then `span` at a time, the nearest first. */
export function frameRanges(planes: number, at: number, first = 16, span = 48): [number, number][] {
  const got = new Set<number>();
  const out: [number, number][] = [];
  for (;;) {
    const r = nextRange(planes, at, (z) => !got.has(z), out.length === 0 ? first : span);
    if (!r) return out;
    for (let z = r[0]; z < r[1]; z++) got.add(z);
    out.push(r);
  }
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
/**
 * A range of planes; naming the preview's digest (`v`) and the held state it
 * was served (`held`) lets the browser keep the answer for good. The held and
 * the whole picture of one stack share a digest, so the engine keeps an
 * answer for good only where the address names both (2026-10-10).
 */
export const planesUrl = (stack: number, from: number, to: number, digest?: string | null, held = false) =>
  `/api/instances/${stack}/preview/planes?from=${from}&to=${to}${digest ? `&v=${encodeURIComponent(digest)}&held=${held ? 1 : 0}` : ""}`;

const HEADERS = { "X-Nils-Desk": "1" };

export interface Fetcher {
  (url: string, init?: RequestInit): Promise<Response>;
}

export interface Decoder {
  (blob: Blob): Promise<Bitmap>;
}

const decodeBlob: Decoder = (blob) => createImageBitmap(blob);

/** A read given up on because the scan was left: not a failure. */
export class Left extends Error {
  constructor() {
    super("the scan was left");
  }
}

/** A door's answer worth asking again: the engine or the way to it was short of something for a moment. */
const passing = (status: number) => status === 408 || status === 429 || status >= 500;

/** How the store reads, decodes and waits; the defaults are the page's, tests make theirs small. */
export interface PicturesOptions {
  /** Planes read in the first request of a scan, around the plane shown. */
  first: number;
  /** Planes read in each later request. */
  span: number;
  /** Requests in flight for one scan once its first range is in. */
  inflight: number;
  /** Planes either side of the plane shown kept decoded. */
  radius: number;
  /** Planes either side of the middle a scan read ahead reads and decodes. */
  ahead: number;
  /** Decodes at once for the scan shown. */
  lanes: number;
  /** The pauses before each new ask of a read that failed for a moment; one more failure gives up. */
  backoff: number[];
  /** A read with no answer after this long is asked again. */
  stallMs: number;
  /** How many 503s with `retry_after_ms` (a range held while the preview is made) are waited out before they count as failures. */
  holds: number;
  /** Planes a request asks for while the scan's preview is partial: what the engine decodes in the request. */
  partialSpan: number;
  /** The pause before a partial preview is asked again where the engine names none. */
  partialMs: number;
  /** How many times a partial preview is asked again before the partial one is kept. */
  partialTries: number;
  /** Waits for the browser to be idle (a read-ahead scan's decoding). */
  idle: () => Promise<void>;
  /** Waits a pause. */
  pause: (ms: number) => Promise<void>;
}

const idleTime = (): Promise<void> =>
  new Promise((done) => {
    const w = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(() => done(), { timeout: 150 });
    else setTimeout(done, 0);
  });

export const PICTURES_DEFAULTS: PicturesOptions = {
  first: 16,
  span: 48,
  inflight: 2,
  radius: 64,
  ahead: 8,
  lanes: 6,
  backoff: [150, 400, 1000, 2500],
  stallMs: 15_000,
  holds: 30,
  partialSpan: 32,
  partialMs: 500,
  partialTries: 120,
  idle: idleTime,
  pause: (ms) => new Promise((done) => setTimeout(done, ms)),
};

/** One scan's frames: what is read, being read, decoded, and who waits for them. */
interface Reel {
  stack: number;
  planes: number;
  digest: string | null | undefined;
  /** The preview was partial: ranges kept to what the engine decodes in the request, and never kept for good by the browser. */
  partial: boolean;
  /** The preview was served with its band held: named on the planes' address beside the digest. */
  held: boolean;
  have: Map<number, Blob>;
  /** Planes asked for and not answered yet. */
  asking: Set<number>;
  /** Planes asked for that the engine's answer left out: not asked again. */
  absent: Set<number>;
  focus: number;
  /** Every plane read (the scan is shown); else only `around` either side of the focus (read ahead). */
  all: boolean;
  around: number;
  /** Decoding waits for idle time (read ahead). */
  idle: boolean;
  reads: number;
  abort: AbortController;
  failed: unknown;
  decoding: Set<number>;
  /** Planes decoded since the focus last moved, so a budget smaller than the window never decodes in a circle. */
  decoded: Set<number>;
  /** Bytes one decoded plane takes. */
  frameBytes: number;
  waiters: { done: () => void; fail: (e: unknown) => void }[];
}

/**
 * The page's pictures: previews by stack (kept as promises, so two asks are
 * one read), the encoded frames of the scans read lately, and their decoded
 * bitmaps in an LRU. One per page; tests make their own with a fetch and a
 * decoder of their own.
 *
 * A scan's frames are read in ranges from the plane shown outwards, the
 * first range small so the first sharp frame never waits for the stack, and
 * re-aimed whenever the person scrolls; the planes near the one shown are
 * kept decoded. A scan read ahead reads only the planes around its middle
 * and decodes them in idle time, so its sharp middle frame is ready when it
 * is opened. What fails for a moment (a 5xx, a dropped connection, a read
 * with no answer) is asked again after a pause; reads for a scan the person
 * left are cancelled.
 */
export class Pictures {
  private previews = new Map<number, Promise<Preview>>();
  private known = new Map<number, Preview>();
  private reels = new Map<number, Reel>();
  private listeners = new Set<(stack: number) => void>();
  private peeking = new Set<string>();
  /** Frames peeked before their scan had a reel, taken in when it has. */
  private peeked = new Map<string, Blob>();
  readonly bitmaps: BitmapLru;
  private o: PicturesOptions;
  constructor(
    private fetcher: Fetcher = (u, i) => fetch(u, i),
    private decode: Decoder = decodeBlob,
    budget = 320 * 1024 * 1024,
    private keepScans = 8,
    options: Partial<PicturesOptions> = {},
  ) {
    this.bitmaps = new BitmapLru(budget);
    this.o = { ...PICTURES_DEFAULTS, ...options };
  }

  /** Told whenever a frame of `stack` is decoded, so the viewer draws it. */
  on(f: (stack: number) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  /**
   * One door asked until it answers: a failure that passes (a 5xx, 408,
   * 429, a dropped connection, no answer within `stallMs`) is asked again
   * after the next pause; anything else, or the last failure, is thrown. An
   * abort from `signal` throws `Left` at once.
   */
  private async ask(url: string, signal?: AbortSignal): Promise<Response> {
    let holds = 0;
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw new Left();
      const own = new AbortController();
      const stop = () => own.abort();
      signal?.addEventListener("abort", stop, { once: true });
      let stalled = false;
      const timer = setTimeout(() => {
        stalled = true;
        own.abort();
      }, this.o.stallMs);
      let why: unknown;
      let wait: number | null = null;
      let held: number | null = null;
      try {
        const r = await this.fetcher(url, { headers: HEADERS, signal: own.signal });
        if (r.ok || !passing(r.status)) return r;
        why = new Error(`${url.split("?")[0]} answered ${r.status}`);
        const after = Number(r.headers.get("Retry-After"));
        if (Number.isFinite(after) && after > 0) wait = Math.min(2000, after * 1000);
        // a range held while the preview is made: asked again when the engine says, not counted as a failure
        if (r.status === 503) held = num(((await r.json().catch(() => null)) as Json | null)?.retry_after_ms);
      } catch (e) {
        if (signal?.aborted) throw new Left();
        why = stalled ? new Error(`${url.split("?")[0]} gave no answer`) : e;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", stop);
      }
      if (held !== null && held >= 0 && holds < this.o.holds) {
        holds++;
        attempt--;
        await this.o.pause(Math.min(5000, Math.max(50, held)));
        continue;
      }
      if (attempt >= this.o.backoff.length) throw why;
      await this.o.pause(Math.min(wait ?? Infinity, this.o.backoff[attempt]));
    }
  }

  /** A scan's preview, read once; one that failed is read again at the next ask. */
  preview(stack: number): Promise<Preview> {
    let p = this.previews.get(stack);
    if (!p) {
      p = this.ask(previewUrl(stack))
        .then((r) => {
          if (!r.ok) throw new Error(`the preview answered ${r.status}`);
          return r.json() as Promise<Json>;
        })
        .then((j) => {
          const v = previewOf(j);
          // a partial preview is shown, never kept as the answer: the next ask reads the door again
          if (v.partial) {
            if (this.previews.get(stack) === p) this.previews.delete(stack);
            if (this.known.get(stack)?.partial === false) return this.known.get(stack)!;
          }
          this.known.set(stack, v);
          if (this.known.size > 64) this.known.delete(this.known.keys().next().value as number);
          return v;
        });
      p.catch(() => {
        if (this.previews.get(stack) === p) this.previews.delete(stack);
      });
      this.previews.set(stack, p);
      if (this.previews.size > 64) this.previews.delete(this.previews.keys().next().value as number);
    }
    return p;
  }

  /**
   * A scan's whole preview: where the door answers a partial one, asked
   * again after the engine's `retry_after_ms` (else `partialMs`) until it
   * is whole; the last partial one where it never comes, or the scan was
   * left (`signal`).
   */
  async whole(stack: number, signal?: AbortSignal): Promise<Preview> {
    let v = await this.preview(stack);
    for (let i = 0; v.partial && i < this.o.partialTries && !signal?.aborted; i++) {
      await this.o.pause(Math.min(5000, Math.max(50, v.retryMs ?? this.o.partialMs)));
      if (signal?.aborted) break;
      v = await this.preview(stack);
    }
    return v;
  }

  /** A scan's preview where it was read already, at once; null where not (yet). */
  previewNow(stack: number): Preview | null {
    return this.known.get(stack) ?? null;
  }

  /** A plane's decoded bitmap, where it is in memory. */
  bitmap(stack: number, plane: number): Bitmap | undefined {
    return this.bitmaps.get(`${stack}:${plane}`);
  }

  /** Whether a plane's encoded frame was read. */
  hasFrame(stack: number, plane: number): boolean {
    return this.reels.get(stack)?.have.has(plane) ?? false;
  }

  /** How many requests for a scan's frames are in flight (a test, the measures). */
  reading(stack: number): number {
    return this.reels.get(stack)?.reads ?? 0;
  }

  private reel(stack: number, planes: number, at: number, digest: string | null | undefined, partial: boolean, held: boolean): Reel {
    let r = this.reels.get(stack);
    if (r) {
      this.reels.delete(stack);
      r.planes = planes;
      r.digest = digest;
      r.partial = partial;
      r.held = held;
    } else {
      const have = new Map<number, Blob>();
      for (const [k, b] of this.peeked) {
        const [s0, z] = k.split(":").map(Number);
        if (s0 === stack) {
          have.set(z, b);
          this.peeked.delete(k);
        }
      }
      r = { stack, planes, digest, partial, held, have, asking: new Set(), absent: new Set(), focus: at, all: false, around: 0, idle: true, reads: 0, abort: new AbortController(), failed: null, decoding: new Set(), decoded: new Set(), frameBytes: 0, waiters: [] };
    }
    this.reels.set(stack, r);
    // the scans read longest ago let go of their frames (their decoded planes stay in the LRU)
    for (const [k, old] of this.reels) {
      if (this.reels.size <= this.keepScans) break;
      if (k === stack) continue;
      this.cancel(old);
      this.reels.delete(k);
    }
    this.aim(r, at);
    return r;
  }

  private aim(r: Reel, at: number): void {
    const z = Math.max(0, Math.min(r.planes - 1, at));
    if (z !== r.focus) {
      r.focus = z;
      r.decoded.clear();
    }
  }

  /**
   * Every frame of a scan read, the planes around `at` first and then
   * outwards, and the planes near `at` decoded, nearest first; resolves
   * when that is done, or when the scan is left. A second ask while the
   * first reads joins it; a scan whose reads failed is read again.
   */
  load(stack: number, planes: number, at: number, digest?: string | null, partial = false, held = false): Promise<void> {
    const r = this.reel(stack, planes, at, digest, partial, held);
    r.all = true;
    r.idle = false;
    r.failed = null;
    return this.wait(r);
  }

  /**
   * A scan read ahead: its frames `ahead` either side of `at` (its middle)
   * read, and decoded in idle time, so its sharp frame is there when it is
   * opened. Nothing more where it is read whole already.
   */
  ahead(stack: number, planes: number, at: number, digest?: string | null, partial = false, held = false): Promise<void> {
    const r = this.reel(stack, planes, at, digest, partial, held);
    if (!r.all) r.around = Math.max(r.around, this.o.ahead);
    if (r.failed) r.failed = null;
    return this.wait(r);
  }

  /**
   * One plane read and decoded at once, before the preview says the scan's
   * size: the middle the grid's count of images names, read beside the
   * preview so the first sharp frame waits for one round trip, not two. A
   * guess the engine refuses (a scan whose images are not its planes) is
   * let go quietly; the preview's own middle follows.
   */
  async peek(stack: number, plane: number): Promise<void> {
    if (plane < 0 || this.hasFrame(stack, plane) || this.bitmaps.has(`${stack}:${plane}`)) return;
    const key = `${stack}:${plane}`;
    if (this.peeking.has(key)) return;
    this.peeking.add(key);
    try {
      const res = await this.fetcher(planesUrl(stack, plane, plane + 1), { headers: HEADERS });
      if (!res.ok) return;
      const { frames, data } = parseFrames(await res.arrayBuffer());
      const f = frames.find((x) => x.plane === plane);
      if (!f) return;
      const blob = new Blob([data.slice(f.offset, f.offset + f.length)], { type: f.mime });
      const r = this.reels.get(stack);
      if (r) r.have.set(plane, blob);
      else this.peeked.set(key, blob);
      if (this.peeked.size > 16) this.peeked.delete(this.peeked.keys().next().value as string);
      if (!this.bitmaps.has(key)) {
        this.bitmaps.set(key, await this.decode(blob));
        for (const l of this.listeners) l(stack);
      }
    } catch {
      // a guess that did not come is no failure: the preview's middle is read next
    } finally {
      this.peeking.delete(key);
    }
  }

  /** The plane shown moved: reads and decoding turn to the planes around it. */
  focus(stack: number, at: number): void {
    const r = this.reels.get(stack);
    if (!r) return;
    this.aim(r, at);
    this.pump(r);
    this.decodeNext(r);
  }

  /** Cancel the reads of every scan but these (the one shown and the ones read ahead); what was read stays. */
  keep(stacks: Iterable<number>): void {
    const keep = new Set(stacks);
    for (const [k, r] of this.reels) if (!keep.has(k)) this.cancel(r);
  }

  private cancel(r: Reel): void {
    if (r.reads > 0 || r.asking.size > 0) {
      r.abort.abort();
      r.abort = new AbortController();
      r.asking.clear();
      r.reads = 0;
    }
    r.all = false;
    r.around = 0;
    // whoever waited is let go: a scan left is not a scan that failed
    const w = r.waiters.splice(0);
    for (const x of w) x.done();
  }

  private wait(r: Reel): Promise<void> {
    const p = new Promise<void>((done, fail) => r.waiters.push({ done, fail }));
    this.pump(r);
    this.decodeNext(r);
    this.settle(r);
    return p;
  }

  /** The window of planes a reel reads: all, or `around` either side of its focus. */
  private window(r: Reel): [number, number] {
    return r.all ? [0, r.planes] : [r.focus - r.around, r.focus + r.around];
  }

  private missing(r: Reel): (z: number) => boolean {
    return (z) => !r.have.has(z) && !r.asking.has(z) && !r.absent.has(z);
  }

  /** Start the next reads: one at first, so the first range is not shared, then up to `inflight`. */
  private pump(r: Reel): void {
    if (r.failed || r.planes <= 0 || (!r.all && r.around <= 0)) return;
    const limit = r.have.size === 0 ? 1 : this.o.inflight;
    while (r.reads < limit) {
      const want = r.have.size === 0 && r.reads === 0 ? this.o.first : this.o.span;
      const range = nextRange(r.planes, r.focus, this.missing(r), r.partial ? Math.min(want, this.o.partialSpan) : want, this.window(r));
      if (!range) return;
      void this.read(r, range[0], range[1]);
    }
  }

  private async read(r: Reel, from: number, to: number): Promise<void> {
    const signal = r.abort.signal;
    for (let z = from; z < to; z++) r.asking.add(z);
    r.reads++;
    try {
      const res = await this.ask(planesUrl(r.stack, from, to, r.partial ? null : r.digest, r.held), signal);
      if (!res.ok) throw new Error(`the planes answered ${res.status}`);
      const { frames, data, width, height } = parseFrames(await res.arrayBuffer());
      if (signal.aborted) return;
      if (width > 0 && height > 0) r.frameBytes = width * height * 4;
      for (const f of frames) r.have.set(f.plane, new Blob([data.slice(f.offset, f.offset + f.length)], { type: f.mime }));
      for (let z = from; z < to; z++) if (!r.have.has(z)) r.absent.add(z);
    } catch (e) {
      if (signal.aborted || e instanceof Left) return;
      r.failed = e;
    } finally {
      if (!signal.aborted) {
        for (let z = from; z < to; z++) r.asking.delete(z);
        r.reads--;
      }
    }
    if (signal.aborted) return;
    this.decodeNext(r);
    this.pump(r);
    this.settle(r);
  }

  /** How far either side of the focus planes are kept decoded: the window, held to a quarter of the budget. */
  private radius(r: Reel): number {
    if (!r.all) return r.around;
    const fit = r.frameBytes > 0 ? Math.floor(this.bitmaps.budget / r.frameBytes / 8) : this.o.radius;
    return Math.max(2, Math.min(this.o.radius, fit));
  }

  /** The next plane to decode: read, not decoded, near the focus, nearest first. */
  private nextDecode(r: Reel): number | null {
    const rad = this.radius(r);
    for (let d = 0; d <= rad; d++) {
      for (const z of d === 0 ? [r.focus] : [r.focus + d, r.focus - d]) {
        if (z < 0 || z >= r.planes || !r.have.has(z) || r.decoding.has(z) || r.decoded.has(z)) continue;
        if (this.bitmaps.has(`${r.stack}:${z}`)) continue;
        return z;
      }
    }
    return null;
  }

  private decodeNext(r: Reel): void {
    const lanes = r.idle ? 1 : this.o.lanes;
    while (r.decoding.size < lanes) {
      const z = this.nextDecode(r);
      if (z === null) return;
      r.decoding.add(z);
      void this.decodeOne(r, z);
    }
  }

  private async decodeOne(r: Reel, z: number): Promise<void> {
    try {
      if (r.idle) await this.o.idle();
      const blob = r.have.get(z);
      if (blob && !this.bitmaps.has(`${r.stack}:${z}`)) {
        this.bitmaps.set(`${r.stack}:${z}`, await this.decode(blob));
        for (const f of this.listeners) f(r.stack);
      }
    } catch {
      // a frame that does not decode is left out; its neighbours still draw
    } finally {
      r.decoding.delete(z);
      r.decoded.add(z);
    }
    this.decodeNext(r);
    this.settle(r);
  }

  /** Tell the waiters once nothing is left to read or decode, or the reads failed. */
  private settle(r: Reel): void {
    if (r.waiters.length === 0) return;
    if (r.failed) {
      const w = r.waiters.splice(0);
      for (const x of w) x.fail(r.failed);
      return;
    }
    if (r.reads > 0 || r.decoding.size > 0) return;
    const [lo, hi] = this.window(r);
    if (nextRange(r.planes, r.focus, this.missing(r), 1, [lo, hi]) !== null) return;
    if (this.nextDecode(r) !== null) return;
    const w = r.waiters.splice(0);
    for (const x of w) x.done();
  }

  /** A plane decoded again from its frame where the LRU let it go; null where the frame was never read. */
  async again(stack: number, plane: number): Promise<Bitmap | null> {
    const blob = this.reels.get(stack)?.have.get(plane);
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
