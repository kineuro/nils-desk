// SPDX-License-Identifier: AGPL-3.0-only
// One plane from the server's render door, turned so it reads the way a
// radiologist expects and drawn at its true size in millimetres (a coronal
// plane of 2 mm slices is not stretched to square pixels): the first
// picture of a plane before the volume holds it, and the planes' view when
// the volume path is not taken.

import { useEffect, useRef, useState } from "react";
import { conventional, edgeLabels, type EdgeLabels, type Vec3 } from "./geometry";

export function Letters({ labels, unknown = false }: { labels: EdgeLabels | null; unknown?: boolean }) {
  if (unknown) return <span className="viewer-unknown">orientation unknown</span>;
  if (!labels) return null;
  return (
    <>
      {(["top", "bottom", "left", "right"] as const).map((e) => (
        <span key={e} className={`viewer-edge viewer-edge-${e}`} data-edge={e}>
          {labels[e]}
        </span>
      ))}
    </>
  );
}

export interface RenderAxes {
  right: Vec3;
  down: Vec3;
  w: number;
  h: number;
  mmW: number;
  mmH: number;
}

/** Draw the render onto a canvas through the conventional turn, at the plane's size in mm. */
export function RenderPlane({ src, axes, known, onLoad }: { src: string; axes: RenderAxes; known: boolean; onLoad?: () => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const turn = known ? conventional(axes.right, axes.down) : { m: [1, 0, 0, 1] as [number, number, number, number], right: axes.right, down: axes.down };
  const [a, b, c, d] = turn.m;
  const key = `${src}|${a}${b}${c}${d}`;
  useEffect(() => {
    const img = new Image();
    let alive = true;
    img.onload = () => {
      const el = canvas.current;
      if (!alive || !el) return;
      // the plane in mm, on the finer of its two spacings
      const px = Math.min(axes.mmW, axes.mmH) || 1;
      const W = (img.naturalWidth * axes.mmW) / px;
      const H = (img.naturalHeight * axes.mmH) / px;
      const swap = a === 0;
      el.width = Math.round(swap ? H : W);
      el.height = Math.round(swap ? W : H);
      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.translate(el.width / 2, el.height / 2);
      ctx.transform(a, b, c, d, 0, 0);
      ctx.drawImage(img, -W / 2, -H / 2, W, H);
      setFailed(false);
      onLoad?.();
    };
    img.onerror = () => alive && setFailed(true);
    img.src = src;
    return () => {
      alive = false;
      img.onload = null;
      img.onerror = null;
    };
    // the key carries the source and the turn; the sizes follow the source
  }, [key]);
  return (
    <div className="viewer-render">
      <canvas ref={canvas} hidden={failed} />
      {!failed && <Letters labels={edgeLabels(turn.right, turn.down)} unknown={!known} />}
    </div>
  );
}
