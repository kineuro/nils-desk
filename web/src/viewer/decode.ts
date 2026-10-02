// SPDX-License-Identifier: AGPL-3.0-only
// The worker pool: planes decode off the main thread, one worker per core
// up to eight, two cores left to the page, the plane handed back as a
// transferred buffer. The three planes decode a whole volume per panel, so
// the reader's next item is drawn sooner with more workers. A plane for
// later (a reader warming the items ahead) waits behind every plane the
// pictures on the screen want.

interface Job {
  resolve: (r: { plane: Uint16Array; ms: number }) => void;
  reject: (e: Error) => void;
}

export class DecodePool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: { msg: unknown; transfer: ArrayBuffer[]; job: Job; later: boolean }[] = [];
  private jobs = new Map<number, Job>();
  private next = 1;

  constructor(size = Math.min(8, Math.max(1, (navigator.hardwareConcurrency || 2) - 2))) {
    for (let i = 0; i < size; i++) {
      const w = new Worker("/codecs/decode.worker.js");
      w.onmessage = (e: MessageEvent<{ id: number; plane?: Uint16Array; ms?: number; error?: string }>) => {
        const job = this.jobs.get(e.data.id);
        this.jobs.delete(e.data.id);
        if (job) {
          if (e.data.error || !e.data.plane) job.reject(new Error(e.data.error ?? "no plane"));
          else job.resolve({ plane: e.data.plane, ms: e.data.ms ?? 0 });
        }
        this.idle.push(w);
        this.pump();
      };
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  /** One plane from its tiles. The tile buffers are copied into the worker, not transferred, because a slab's response holds them all. */
  decode(codec: string, tiles: Uint8Array[], nx: number, ny: number, tile: number, later = false): Promise<{ plane: Uint16Array; ms: number }> {
    return new Promise((resolve, reject) => {
      const id = this.next++;
      const copies = tiles.map((t) => t.slice());
      const q = { msg: { id, codec, tiles: copies, nx, ny, tile }, transfer: copies.map((c) => c.buffer), job: { resolve, reject }, later };
      // a plane wanted now goes before every plane for later
      const at = later ? -1 : this.queue.findIndex((x) => x.later);
      if (at < 0) this.queue.push(q);
      else this.queue.splice(at, 0, q);
      this.jobs.set(id, { resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const w = this.idle.pop()!;
      const q = this.queue.shift()!;
      w.postMessage(q.msg, q.transfer);
    }
  }

  close(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.idle = [];
  }
}
