// SPDX-License-Identifier: AGPL-3.0-only
// The light viewer of a dataset's scan (record 55 H2: first picture under
// 100 ms, scrolling with no wait, the next scan under 30 ms). It shows the
// grid's picture of the middle plane at once, then the preview's, then draws
// the scan's own frames on a canvas from decoded bitmaps: the wheel and the
// up and down keys move through the planes, left and right (or j and k) to
// the next and previous scan. The next two scans' previews and this scan's
// frames are read ahead. Window, level and the three planes are the full
// viewer's, one key away (3), loaded only then.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StackView } from "../campaigns/StackView";
import { Icon } from "../ui/Icon";
import { pictures as sharedPictures, planeOf, type Bitmap, type Pictures, type Preview } from "./pictures";
import { questionWords, type Scan } from "./scans";

/** The mark a click on a scan sets, and the measure of its first picture. */
export const OPEN_MARK = "nils-scan-open";
export const FIRST_PICTURE = "nils-scan-first-picture";

/** Marks the moment a scan was asked for, so its first picture can be timed. */
export function markOpen(stack: number): void {
  try {
    performance.mark(`${OPEN_MARK}:${stack}`);
  } catch {
    // a browser without user timing still opens the scan
  }
}

/** The milliseconds from the click to the first picture, measured once per open; null where no mark was set. */
function measureFirst(stack: number): number | null {
  try {
    const start = `${OPEN_MARK}:${stack}`;
    if (performance.getEntriesByName(start, "mark").length === 0) return null;
    const m = performance.measure(`${FIRST_PICTURE}:${stack}`, start);
    performance.clearMarks(start);
    return m ? Math.round(m.duration * 10) / 10 : null;
  } catch {
    return null;
  }
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
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(b as unknown as CanvasImageSource, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return true;
}

export function ScanViewer({ scans, at, onAt, onClose, store }: { scans: Scan[]; at: number; onAt: (i: number) => void; onClose: () => void; store?: Pictures }) {
  const pics = store ?? sharedPictures();
  const scan = scans[at];
  const stack = scan.id;
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [z, setZ] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [three, setThree] = useState(false);
  const [first, setFirst] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const firstDone = useRef(false);
  const live = useRef({ stack, z: null as number | null, preview: null as Preview | null });
  live.current = { stack, z, preview };

  const firstPicture = useCallback(() => {
    if (firstDone.current) return;
    firstDone.current = true;
    setFirst(measureFirst(stack));
  }, [stack]);

  // a new scan: its still picture at once, then its preview, then its frames
  useLayoutEffect(() => {
    firstDone.current = false;
    setPreview(null);
    setZ(null);
    setDrawn(false);
    setFirst(null);
    setFailed(false);
  }, [stack]);

  useEffect(() => {
    let alive = true;
    pics.preview(stack).then(
      (p) => {
        if (!alive) return;
        setPreview(p);
        const mid = Math.floor(p.planes / 2);
        setZ((was) => was ?? mid);
        if (p.planes > 0) void pics.load(stack, p.planes, mid).catch(() => alive && setFailed(true));
      },
      () => alive && setFailed(true),
    );
    // the next two scans' previews read ahead, and the one before
    for (const i of [at + 1, at + 2, at - 1]) if (i >= 0 && i < scans.length) void pics.preview(scans[i].id).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [stack, pics, at, scans]);

  /** The plane `at` drawn where it is decoded; decoded again from its frame where the LRU let it go. */
  const paint = useCallback(
    (plane: number) => {
      const c = canvas.current;
      if (!c) return;
      const b = pics.bitmap(stack, plane);
      if (b) {
        if (draw(c, b, aspectOf(live.current.preview, b))) {
          setDrawn(true);
          firstPicture();
        }
        return;
      }
      if (pics.hasFrame(stack, plane))
        void pics.again(stack, plane).then((x) => {
          if (x && live.current.stack === stack && live.current.z === plane) paint(plane);
        });
    },
    [pics, stack, firstPicture],
  );

  useEffect(() => {
    if (z !== null && !three) paint(z);
  }, [z, paint, three]);

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
  const turn = useCallback((by: number) => setZ((was) => (was === null || planes === 0 ? was : Math.max(0, Math.min(planes - 1, was + by)))), [planes]);
  const move = useCallback(
    (by: number) => {
      const i = at + by;
      if (i < 0 || i >= scans.length) return;
      markOpen(scans[i].id);
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

  // the still: the grid's picture, else the preview's middle plane in the scan's own plane
  const still = scan.picture ?? preview?.middle[planeOf(scan.orientation ?? preview?.orientation)] ?? null;
  const look = scan.questions.length > 0;

  return (
    <div className={look ? "scan-view look" : "scan-view"} data-stack={stack} data-first-ms={first ?? undefined}>
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
      {three ? (
        <StackView stack={stack} view="planes" keys />
      ) : (
        <div className="scan-canvas" ref={box}>
          {still && !drawn && <img className="scan-still" src={still} alt="" decoding="sync" onLoad={firstPicture} />}
          <canvas ref={canvas} className={drawn ? "on" : undefined} aria-label={`${scan.name}${z !== null && planes > 0 ? `, plane ${z + 1} of ${planes}` : ""}`} role="img" />
          {!still && !drawn && !failed && <span className="scan-wait meta">…</span>}
          {failed && !drawn && !still && <span className="scan-wait warn">No picture</span>}
        </div>
      )}
    </div>
  );
}
