// SPDX-License-Identifier: AGPL-3.0-only
// The light viewer of a dataset's scan (record 55 H2: first picture under
// 100 ms, scrolling with no wait, the next scan under 30 ms). It shows the
// grid's picture of the middle plane at once, then the preview's, then draws
// the scan's own frames on a canvas from decoded bitmaps: the wheel and the
// up and down keys move through the planes, left and right (or j and k) to
// the next and previous scan. The middle frame is read beside the preview,
// the rest from the plane shown outwards; the next two scans' previews and
// middle frames are read and decoded ahead. Each read that fails for a
// moment is asked again, and one that fails for good says so with Try
// again. Window, level and the three planes are the full viewer's, one key
// away (3), loaded only then.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StackView } from "../campaigns/StackView";
import { Icon } from "../ui/Icon";
import { pictures as sharedPictures, type Bitmap, type Pictures, type Preview } from "./pictures";
import { needsLook, questionWords, type Scan } from "./scans";

/** The mark an open sets, and the measures timed from it. */
export const OPEN_MARK = "nils-scan-open";
/** The first picture of any kind, the still or a sharp frame (kept from the first round). */
export const FIRST_PICTURE = "nils-scan-first-picture";
/** The still (the grid's picture or the preview's middle) on the screen. */
export const FIRST_STILL = "nils-scan-first-still";
/** The first sharp frame (a decoded plane on the canvas). */
export const FIRST_SHARP = "nils-scan-first-sharp";
/** The first sharp frame of a scan opened with next or previous, not from the grid. */
export const NEXT_SHARP = "nils-scan-next-sharp";

const how = new Map<number, "click" | "next">();

/** Marks the moment a scan was asked for, so its pictures can be timed: from the grid, or as the next or previous scan. */
export function markOpen(stack: number, by: "click" | "next" = "click"): void {
  try {
    performance.clearMarks(`${OPEN_MARK}:${stack}`);
    performance.mark(`${OPEN_MARK}:${stack}`);
    how.set(stack, by);
  } catch {
    // a browser without user timing still opens the scan
  }
}

/** The milliseconds from the open to now as the measure `name:stack`; null where no mark was set. */
function measure(name: string, stack: number): number | null {
  try {
    const start = `${OPEN_MARK}:${stack}`;
    if (performance.getEntriesByName(start, "mark").length === 0) return null;
    performance.clearMeasures(`${name}:${stack}`);
    const m = performance.measure(`${name}:${stack}`, start);
    return m ? Math.round(m.duration * 10) / 10 : null;
  } catch {
    return null;
  }
}

/** The open's mark let go once its sharp frame is timed. */
function doneTiming(stack: number): void {
  try {
    performance.clearMarks(`${OPEN_MARK}:${stack}`);
  } catch {
    // nothing to let go
  }
  how.delete(stack);
}

/** How the plane is fitted to the canvas: its physical width over height. */
function aspectOf(p: Preview | null, b: Bitmap): number {
  if (p?.shape && p.spacing) {
    const [, rows, cols] = p.shape;
    const [, dy, dx] = p.spacing;
    if (rows > 0 && cols > 0 && dy > 0 && dx > 0) return (cols * dx) / (rows * dy);
  }
  return b.height > 0 ? b.width / b.height : 1;
}

function draw(canvas: HTMLCanvasElement, b: Bitmap, aspect: number): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const ratio = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * ratio)) || b.width;
  const h = Math.max(1, Math.round(canvas.clientHeight * ratio)) || b.height;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  let dw = w;
  let dh = w / aspect;
  if (dh > h) {
    dh = h;
    dw = h * aspect;
  }
  // the canvas box's own background (the theme's image black) shows around the plane
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(b as unknown as CanvasImageSource, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return true;
}

/** The middle the grid's count of images names, for a scan of more than one: a guess the preview confirms. */
function guessOf(scan: Scan): number | null {
  return scan.images !== null && scan.images >= 2 ? Math.floor(scan.images / 2) : null;
}

/** The plane a scan opens on: its middle. */
function middleOf(p: Preview | null): number | null {
  return p && p.planes > 0 ? Math.floor(p.planes / 2) : null;
}

/**
 * The viewer. `bare` draws the scan alone, with no head of its own, for a
 * page that says the scan's name and place around it (the dataset view):
 * the plane counter sits in the picture's corner and the keys do the rest.
 */
export function ScanViewer({ scans, at, onAt, onClose, store, bare = false }: { scans: Scan[]; at: number; onAt: (i: number) => void; onClose: () => void; store?: Pictures; bare?: boolean }) {
  const pics = store ?? sharedPictures();
  const scan = scans[at];
  const stack = scan.id;
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const [preview, setPreview] = useState<Preview | null>(() => pics.previewNow(stack));
  const [z, setZ] = useState<number | null>(() => middleOf(pics.previewNow(stack)) ?? guessOf(scan));
  // the middle the grid's count of images names, drawn before the preview says the scan's own; dropped once the person moves
  const guess = useRef<number | null>(null);
  const moved = useRef(false);
  const [drawn, setDrawn] = useState(false);
  const [three, setThree] = useState(false);
  const [first, setFirst] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [framesFailed, setFramesFailed] = useState(false);
  const [again, setAgain] = useState(0);
  const timed = useRef({ first: false, still: false, sharp: false });
  const live = useRef({ stack, z: null as number | null, preview: null as Preview | null });
  live.current = { stack, z, preview };

  const stillShown = useCallback(() => {
    const t = timed.current;
    if (t.still) return;
    t.still = true;
    measure(FIRST_STILL, stack);
    if (!t.first) {
      t.first = true;
      setFirst(measure(FIRST_PICTURE, stack));
    }
  }, [stack]);
  const sharpShown = useCallback(() => {
    const t = timed.current;
    if (t.sharp) return;
    t.sharp = true;
    measure(FIRST_SHARP, stack);
    if (how.get(stack) === "next") measure(NEXT_SHARP, stack);
    if (!t.first) {
      t.first = true;
      setFirst(measure(FIRST_PICTURE, stack));
    }
    doneTiming(stack);
  }, [stack]);

  // a new scan: its still picture at once, and its preview and middle plane
  // at once where they were read ahead, set while rendering so the first
  // frame after the key never draws the plane the scan before was on
  const [shown, setShown] = useState(stack);
  if (shown !== stack) {
    const known = pics.previewNow(stack);
    setShown(stack);
    setPreview(known);
    setZ(middleOf(known) ?? guessOf(scan));
    setDrawn(false);
    setFirst(null);
    setFailed(false);
    setFramesFailed(false);
  }
  useLayoutEffect(() => {
    timed.current = { first: false, still: false, sharp: false };
    moved.current = false;
    guess.current = pics.previewNow(stack) ? null : guessOf(scan);
    // its middle frame read beside its preview, one round trip to the first sharp frame
    if (guess.current !== null) void pics.peek(stack, guess.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new scan is what asks
  }, [stack, pics]);

  // its preview, then its frames from the middle outwards; a read that
  // failed for good is said, and asked again on "Try again"
  // A partial preview (a scan whose preview is still being made) shows its
  // still and its frames near the plane shown at once, and is asked again
  // until it is whole.
  useEffect(() => {
    let alive = true;
    const stop = new AbortController();
    const take = (p: Preview) => {
      if (!alive) return;
      setPreview(p);
      const mid = middleOf(p);
      // the guess gives way to the scan's own middle where the person has not moved
      const g = guess.current;
      guess.current = null;
      setZ((was) => (was === null || (was === g && !moved.current) ? mid : was));
      if (p.planes > 0)
        pics.load(stack, p.planes, live.current.z ?? mid ?? 0, p.digest, p.partial).then(
          () => undefined,
          () => alive && setFramesFailed(true),
        );
    };
    pics.preview(stack).then(
      (p) => {
        take(p);
        if (alive && p.partial)
          pics.whole(stack, stop.signal).then(
            (w) => alive && !w.partial && take(w),
            () => undefined,
          );
      },
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
      stop.abort();
    };
  }, [stack, pics, again]);

  // the scans around: the next two read ahead (preview, and the frames
  // around the middle decoded in idle time) once this one's first sharp
  // frame is drawn or a moment has passed; the one before, its preview. The
  // reads of any other scan are cancelled.
  const id = (i: number) => (i >= 0 && i < scans.length ? scans[i].id : null);
  const aheadKey = [id(at + 1), id(at + 2)].filter((x) => x !== null).join(",");
  const before = id(at - 1);
  useEffect(() => {
    const next = aheadKey === "" ? [] : aheadKey.split(",").map(Number);
    pics.keep([stack, ...next, ...(before !== null ? [before] : [])]);
    let alive = true;
    const go = () => {
      for (const n of next)
        pics.preview(n).then(
          (p) => {
            if (alive && p.planes > 0) pics.ahead(n, p.planes, middleOf(p) ?? 0, p.digest, p.partial).catch(() => undefined);
          },
          () => undefined,
        );
      if (before !== null) pics.preview(before).catch(() => undefined);
    };
    const t = drawn ? undefined : setTimeout(go, 250);
    if (drawn) go();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [stack, aheadKey, before, pics, drawn]);

  /** The plane `at` drawn where it is decoded; decoded again from its frame where the LRU let it go. */
  const paint = useCallback(
    (plane: number) => {
      const c = canvas.current;
      if (!c) return;
      const b = pics.bitmap(stack, plane);
      if (b) {
        if (draw(c, b, aspectOf(live.current.preview, b))) {
          setDrawn(true);
          sharpShown();
        }
        return;
      }
      if (pics.hasFrame(stack, plane))
        void pics.again(stack, plane).then((x) => {
          if (x && live.current.stack === stack && live.current.z === plane) paint(plane);
        });
    },
    [pics, stack, sharpShown],
  );

  useLayoutEffect(() => {
    if (z !== null && !three) paint(z);
  }, [z, paint, three]);

  // reads and decoding follow the plane shown
  useEffect(() => {
    if (z !== null) pics.focus(stack, z);
  }, [pics, stack, z]);

  // a frame decoded: drawn when it is the plane shown
  useEffect(
    () =>
      pics.on((s) => {
        const cur = live.current;
        if (s === cur.stack && cur.z !== null && pics.bitmap(s, cur.z)) paint(cur.z);
      }),
    [pics, paint],
  );

  // the canvas drawn again when its box changes size
  useEffect(() => {
    const c = canvas.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(() => live.current.z !== null && paint(live.current.z));
    o.observe(c);
    return () => o.disconnect();
  }, [paint, three]);

  const planes = preview?.planes ?? 0;
  const turn = useCallback(
    (by: number) => {
      if (planes === 0) return;
      moved.current = true;
      setZ((was) => (was === null ? was : Math.max(0, Math.min(planes - 1, was + by))));
    },
    [planes],
  );
  const move = useCallback(
    (by: number) => {
      const i = at + by;
      if (i < 0 || i >= scans.length) return;
      markOpen(scans[i].id, "next");
      onAt(i);
    },
    [at, scans, onAt],
  );

  // the wheel turns the planes, never the page under the picture
  useEffect(() => {
    const el = box.current;
    if (!el || three) return;
    let acc = 0;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaMode !== 0) return turn(Math.sign(e.deltaY));
      acc += e.deltaY;
      const steps = Math.trunc(acc / 30);
      if (steps !== 0) {
        acc -= steps * 30;
        turn(steps);
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [turn, three]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "3") {
        e.preventDefault();
        return setThree((x) => !x);
      }
      if (e.key === "Escape") return three ? setThree(false) : onClose();
      if (three) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        return turn(e.key === "ArrowUp" ? 1 : -1);
      }
      if (e.key === "ArrowRight" || e.key === "j") {
        e.preventDefault();
        return move(1);
      }
      if (e.key === "ArrowLeft" || e.key === "k") {
        e.preventDefault();
        return move(-1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [turn, move, onClose, three]);

  // the still: the grid's picture, else the preview's middle plane in the
  // scan's own plane, which the engine names axial whatever the scan's plane
  const still = scan.picture ?? preview?.middle.axial ?? null;
  const look = needsLook(scan);

  return (
    <div className={`scan-view${look && !bare ? " look" : ""}${bare ? " bare" : ""}`} data-stack={stack} data-first-ms={first ?? undefined}>
      {!bare && (
      <div className="row scan-view-head">
        <b className="grow scan-view-name" title={look ? questionWords(scan) : undefined}>
          {scan.name}
        </b>
        <span className="meta num">
          {!three && planes > 0 && z !== null ? `${z + 1} / ${planes}` : ""}
        </span>
        <button type="button" className={three ? "button quiet small on" : "button quiet small"} aria-pressed={three} title="Three planes, window and level (3)" onClick={() => setThree((x) => !x)}>
          3
        </button>
        <button type="button" className="icon-button" aria-label="Previous scan" disabled={at === 0} onClick={() => move(-1)}>
          <Icon name="chevron-left" />
        </button>
        <button type="button" className="icon-button" aria-label="Next scan" disabled={at === scans.length - 1} onClick={() => move(1)}>
          <Icon name="chevron-right" />
        </button>
        <button type="button" className="icon-button" aria-label="Close the scan" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      )}
      {three ? (
        <StackView stack={stack} view="planes" keys />
      ) : (
        <div className="scan-canvas" ref={box}>
          {still && !drawn && <img className="scan-still" src={still} alt="" decoding="sync" onLoad={stillShown} />}
          <canvas ref={canvas} className={drawn ? "on" : undefined} aria-label={`${scan.name}${z !== null && planes > 0 ? `, plane ${z + 1} of ${planes}` : ""}`} role="img" />
          {!still && !drawn && !failed && <span className="scan-wait meta">…</span>}
          {bare && planes > 0 && z !== null && <span className="scan-count num">{`${z + 1} / ${planes}`}</span>}
          {(failed || framesFailed) && !drawn && (
            <span className="scan-wait">
              {!still && <span className="warn">No picture </span>}
              <button
                type="button"
                className="button quiet small"
                onClick={() => {
                  setFailed(false);
                  setFramesFailed(false);
                  setAgain((n) => n + 1);
                }}
              >
                Try again
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
