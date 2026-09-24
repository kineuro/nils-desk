// SPDX-License-Identifier: AGPL-3.0-only
// The tile (record 45 S2, study A3 "Components"): one plane of a stack from
// the server's render door at the level that fills it, read only once the
// tile is on screen; the wheel moves it a plane at a time, and a set of tiles
// given one TileSync moves together. For session boards, seed cards and the
// change matrix's grid. It puts nothing in the browser but a small JPEG.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { doors, type Manifest } from "./doors";
import type { Axis } from "./geometry";
import { planeAt, planesAlong, step, tileAbsence, tileLevel, tileManifest, TileSync } from "./tiles";
import "./viewer.css";

export { TileSync } from "./tiles";

export interface TileProps {
  stack: number;
  axis?: Axis;
  /** Tiles given the same sync scroll together; without one the tile keeps its own place. */
  sync?: TileSync | null;
  /** The tile's width in CSS pixels, which chooses the level. */
  size?: number;
  /** A line under the picture; the stack's number when absent. */
  caption?: string;
  /** Opening the stack, when the page has somewhere to open it. */
  onOpen?: (stack: number) => void;
  /** When the picture landed, for a page that counts them. */
  onShown?: (stack: number) => void;
}

const own = () => new TileSync();

export function Tile({ stack, axis = "z", sync = null, size = 128, caption, onOpen, onShown }: TileProps) {
  const el = useRef<HTMLDivElement | null>(null);
  const [mine] = useState(own);
  const at = sync ?? mine;
  const pos = useSyncExternalStore(at.subscribe, at.get, at.get);
  const [seen, setSeen] = useState(false);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [absent, setAbsent] = useState<string | null>(null);

  // read nothing until the tile is on screen
  useEffect(() => {
    const node = el.current;
    if (!node || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(node);
    return () => io.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen) return;
    let alive = true;
    tileManifest(stack)
      .then((m) => alive && setManifest(m))
      .catch((e: unknown) => alive && setAbsent(tileAbsence(e)));
    return () => {
      alive = false;
    };
  }, [seen, stack]);

  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  const level = manifest ? tileLevel(manifest, size * dpr) : 0;
  const planes = manifest ? planesAlong(manifest, level, axis) : 1;

  // the wheel moves a plane at a time; it is the tile's, not the page's scroll
  useEffect(() => {
    const node = el.current;
    if (!node || !manifest) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      at.set(step(at.get(), planes, e.deltaY > 0 ? 1 : -1));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [manifest, planes, at]);

  const z = planeAt(pos, planes);
  const src = manifest ? doors.renderUrl(stack, level, z, manifest.window.width, manifest.window.center, axis) : null;
  const body = (
    <>
      <span className="tile-picture">
        {src && <img src={src} alt="" decoding="async" onLoad={() => onShown?.(stack)} onError={() => setAbsent("no picture")} hidden={absent !== null} />}
        {absent && <span className="tile-absent">{absent}</span>}
      </span>
      <span className="tile-caption meta">
        {caption ?? `stack ${stack}`}
        {manifest && planes > 1 && <span className="tile-plane"> {z + 1}/{planes}</span>}
      </span>
    </>
  );
  return (
    <div ref={el} className="tile" style={{ width: size }} data-stack={stack}>
      {onOpen ? (
        <button type="button" className="tile-open" onClick={() => onOpen(stack)} aria-label={`open stack ${stack}`}>
          {body}
        </button>
      ) : (
        body
      )}
    </div>
  );
}
