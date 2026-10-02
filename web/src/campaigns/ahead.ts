// SPDX-License-Identifier: AGPL-3.0-only
// The items ahead, ready before they are shown (the reader, 2026-10-02:
// moving on took more than a second; "the next few items in memory
// already, even 2 before and 5 after"). The claim names the items the same
// claim would offer next, with the stacks each shows (`ahead`, a hint:
// nothing is held for them). Once the item on the screen is drawn, the
// reader warms those, the nearest first, in the view the rater has chosen:
// each stack's manifest, the first picture the viewer draws, the slab its
// opening plane is in and the slabs beside it, its reference tissue for
// the one window, and for the three planes, or a plane that is not the
// stack's own, the whole volume's slabs, and for the next item its volume
// filled (viewer/volume.ts, `prefill`), so its planes are whole at once.
// Two reads at a time, so the
// pictures on the screen never wait behind them. A jump (another item, a
// correction) calls off what is no longer ahead. The two items read last
// stay in memory with the one on the screen (viewer/slabs.ts).

import type { Json } from "../ask/client";
import { doors, levelShape, type Manifest } from "../viewer/doors";
import { firstPlanes, load } from "../viewer/prefetch";
import { reference } from "../viewer/reference";
import { levelFor, SLAB, slabOf } from "../viewer/ring";
import { dropPrefills, prefill, volumePath } from "../viewer/volume";
import { calloff, pin, slab } from "../viewer/slabs";
import { tileManifest } from "../viewer/tiles";
import { needsVolume, type ViewMode } from "../viewer/view";

/** An item the claim says comes next: its id where named, and the stacks it shows, in the order the page draws them. */
export interface Ahead {
  item: number | null;
  stacks: number[];
}

/** How many items ahead are warmed. */
export const AHEAD = 5;

/**
 * The items a claim names as coming next: `ahead` where the engine lists
 * them ({item, position, stacks}), else the one `next` ({item, stack}) of
 * an engine before it. Read defensively; an entry with no stack is left out.
 */
export function aheadOf(c: { ahead?: unknown; next?: unknown }): Ahead[] {
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  if (Array.isArray(c.ahead)) {
    const out: Ahead[] = [];
    for (const x of c.ahead) {
      if (!x || typeof x !== "object" || Array.isArray(x)) continue;
      const o = x as Json;
      const stacks = Array.isArray(o.stacks) ? (o.stacks as unknown[]).map(num).filter((s): s is number => s !== null) : num(o.stack) !== null ? [num(o.stack)!] : [];
      if (stacks.length > 0) out.push({ item: num(o.item), stacks });
    }
    return out.slice(0, AHEAD);
  }
  const n = c.next;
  if (n && typeof n === "object" && !Array.isArray(n)) {
    const o = n as Json;
    const s = num(o.stack) ?? num(o.stack_id);
    if (s !== null) return [{ item: num(o.item) ?? num(o.item_id), stacks: [s] }];
  }
  return [];
}

/** The slab a plane is in, as the viewer asks for it: [z0, z1). */
export function slabRange(m: Manifest, level: number, z: number): [number, number] {
  const [nz] = levelShape(m, level);
  const z0 = slabOf(Math.min(Math.max(0, z), nz - 1)) * SLAB;
  return [z0, Math.min(nz, z0 + SLAB)];
}

/** What a warm needs to know of the page: the view of the stacks ahead, and how wide a picture is drawn. */
export interface WarmView {
  /** The views the panels are in now; a stack ahead is warmed for each that differs. */
  modes: ViewMode[];
  /** The width of a panel's picture in pixels, which picks the level the stack view reads. */
  px: number;
}

type Task = (signal: AbortSignal) => Promise<unknown>;

/** The work of warming one stack, in the order it pays: what the viewer draws first, then the rest. */
async function stackTasks(stack: number, view: WarmView, signal: AbortSignal, next: boolean): Promise<Task[]> {
  const m = await tileManifest(stack);
  if (signal.aborted) return [];
  const [nz] = m.shape;
  const tasks: Task[] = [];
  const mid = Math.floor(nz / 2);
  const stackView = view.modes.some((v) => !needsVolume(v, m));
  const volume = view.modes.some((v) => needsVolume(v, m));
  if (stackView) {
    const level = levelFor(view.px || 512, m.shape[2], m.levels);
    // the first picture the stack view draws: the server's render one level up, then the slab of its plane
    tasks.push((sig) => load(doors.renderUrl(stack, Math.min(m.levels - 1, level + 1), mid, m.window.width, m.window.center), sig));
    const [z0, z1] = slabRange(m, level, mid);
    tasks.push(() => slab(stack, level, z0, z1, { warm: true }));
    // the slabs either side, where a linked panel or the first turn of the wheel goes
    for (const z of [z0 - 1, z1]) {
      if (z < 0 || z >= nz) continue;
      const [a, b] = slabRange(m, level, z);
      tasks.push(() => slab(stack, level, a, b, { warm: true }));
    }
  }
  // the one window's reference tissue: the coarsest level, a few small slabs
  tasks.push(() => reference(stack, m, true));
  if (volume) {
    // the server's planes, the first picture of the three; the next item's volume is filled instead
    if (!next) tasks.push((sig) => Promise.all(firstPlanes(stack, m).map((src) => load(src, sig))));
    const path = volumePath(m);
    const plan = "plan" in path ? path.plan : null;
    if (plan) {
      const [pz] = levelShape(m, plan.level);
      // from the middle outwards, as the volume fills
      const n = Math.ceil(pz / SLAB);
      const at = slabOf(Math.floor(pz / 2));
      const order = [at, ...Array.from({ length: n }, (_, d) => [at + d + 1, at - d - 1]).flat()].filter((s, i, a) => s >= 0 && s < n && a.indexOf(s) === i);
      for (const s of order) tasks.push(() => slab(stack, plan.level, s * SLAB, Math.min(pz, (s + 1) * SLAB), { warm: true }));
      // the next item's volume filled, from the slabs just read
      if (next) tasks.push(() => prefill(stack, m, plan)?.ready ?? Promise.resolve());
    }
  }
  return tasks;
}

/**
 * The page's warmer. `warm` is told what is ahead and what was read last
 * each time either changes; it calls off what is no longer wanted and
 * starts again from the nearest item, two reads at a time.
 */
export class Warmer {
  private gen = 0;
  private ctl: AbortController | null = null;
  /** Stacks warmed whole in this view, so a list told again does not ask again. */
  private done = new Set<string>();
  lanes = 2;
  /** What it did, for the tests and the viewer's numbers. */
  stats = { stacks: 0, tasks: 0, failed: 0 };

  warm(ahead: readonly Ahead[], view: WarmView, keep: { current: readonly number[]; behind: readonly number[] }): Promise<void> {
    const gen = ++this.gen;
    this.ctl?.abort();
    const ctl = new AbortController();
    this.ctl = ctl;
    const wanted = new Set<number>([...keep.current, ...keep.behind, ...ahead.flatMap((a) => a.stacks)]);
    pin(wanted);
    calloff(wanted);
    // only the next item's volumes are filled ahead (and those on the screen kept)
    dropPrefills(new Set([...keep.current, ...(ahead[0]?.stacks ?? [])]));
    const nextOnes = new Set(ahead[0]?.stacks ?? []);
    const viewKey = `${[...new Set(view.modes)].sort().join(",")}@${Math.round(view.px / 64)}`;
    // a stack warmed in this view is not warmed again, unless it is now next and its volume is filled ahead
    const doneKey = (s: number) => `${s}:${viewKey}:${nextOnes.has(s) ? 1 : 0}`;
    const queue = ahead.flatMap((a) => a.stacks).filter((s, i, all) => all.indexOf(s) === i && !this.done.has(doneKey(s)));
    const live = () => gen === this.gen && !ctl.signal.aborted;
    const lane = async () => {
      while (live() && queue.length > 0) {
        const stack = queue.shift()!;
        try {
          const tasks = await stackTasks(stack, view, ctl.signal, nextOnes.has(stack));
          for (const t of tasks) {
            if (!live()) return;
            this.stats.tasks += 1;
            await t(ctl.signal).catch(() => {
              this.stats.failed += 1;
            });
          }
          if (live()) {
            this.done.add(doneKey(stack));
            this.stats.stacks += 1;
          }
        } catch {
          this.stats.failed += 1;
        }
      }
    };
    return Promise.all(Array.from({ length: this.lanes }, lane)).then(() => undefined);
  }

  /**
   * Hold the warming while the next item is asked for and drawn: the reads
   * in flight for later are called off, so the answer, the claim and the
   * next item's pictures go first. The next `warm` starts again.
   */
  pause(keep: readonly number[]): void {
    this.gen += 1;
    this.ctl?.abort();
    this.ctl = null;
    calloff(new Set(keep));
  }

  /** Stop warming (the page goes, or the reader stops). */
  stop(): void {
    this.gen += 1;
    this.ctl?.abort();
    this.ctl = null;
  }
}
