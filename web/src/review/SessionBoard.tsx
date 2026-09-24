// SPDX-License-Identifier: AGPL-3.0-only
// The session board (record 45 S5, study A3): one occasion's candidates for a
// role, each the stacks of one acquisition as small pictures that scroll
// together, the run's pick marked, a main toggle and a why that is required.
// A `pick.border` item opens it in Review, and a pick question in a campaign
// renders it as its answer. The pictures come from the render door at the
// smallest level; where no pyramid is built the tile says so.

import { useEffect, useState } from "react";
import { Wait } from "../ui/Wait";
import { doors, levelShape, type Manifest } from "../viewer/doors";
import "./grown.css";

export interface BoardCandidate {
  stacks: number[];
  score: number | null;
  /** The run's own pick. */
  chosen: boolean;
}

const score = (v: number | null) => (v === null ? "no score" : `score ${v.toFixed(2)}`);

export interface BoardProps {
  candidates: BoardCandidate[];
  /** The candidate marked main, by index. */
  main: number | null;
  /** Null draws the board read only. */
  onMain: ((i: number) => void) | null;
  why: string;
  onWhy: ((why: string) => void) | null;
  /** Off in tests and where the pictures are not wanted. */
  pictures?: boolean;
}

export function SessionBoard({ candidates, main, onMain, why, onWhy, pictures = true }: BoardProps) {
  // one place along the stacks for every tile, so the bundles scroll together
  const [at, setAt] = useState(0.5);
  const step = (dy: number) => setAt((a) => Math.min(1, Math.max(0, a + (dy > 0 ? 0.03 : -0.03))));
  if (candidates.length === 0) return <p className="meta">The run considered nothing here.</p>;
  return (
    <div className="board">
      {candidates.map((c, i) => (
        <div key={c.stacks.join(",")} className={main === i ? "bundle on" : "bundle"}>
          <div className="bundle-head">
            {onMain ? (
              <label className="row">
                <input type="radio" name="main" checked={main === i} onChange={() => onMain(i)} />
                Main
              </label>
            ) : (
              main === i && <span className="tag brand">main</span>
            )}
            <span className="meta num">{score(c.score)}</span>
            {c.chosen && <span className="tag">the run&apos;s pick</span>}
          </div>
          {pictures && (
            <div className="bundle-tiles" onWheel={(e) => step(e.deltaY)}>
              {c.stacks.map((s) => (
                <BoardTile key={s} stack={s} at={at} />
              ))}
            </div>
          )}
          <span className="meta">
            {c.stacks.length === 1 ? "stack" : "stacks"} {c.stacks.join(", ")}
          </span>
        </div>
      ))}
      {onWhy && (
        <div className="field board-why">
          <span className="label">Why</span>
          <span className="input">
            <input required value={why} placeholder="what a reader of this pick has in place of the run's scores" aria-label="Why" onChange={(e) => onWhy(e.target.value)} />
          </span>
        </div>
      )}
    </div>
  );
}

type TileLoad = { kind: "loading"; since: number } | { kind: "none"; why: string } | { kind: "ready"; m: Manifest };

/** One stack as a small picture at a place along it, from the render door. */
export function BoardTile({ stack, at }: { stack: number; at: number }) {
  const [load, setLoad] = useState<TileLoad>(() => ({ kind: "loading", since: Date.now() }));
  useEffect(() => {
    let alive = true;
    doors.manifest(stack).then(
      (m) => alive && setLoad({ kind: "ready", m }),
      (e: { status?: number }) => alive && setLoad({ kind: "none", why: e.status === 403 ? "not at this detail" : e.status === 404 ? "no picture built" : "no picture" }),
    );
    return () => {
      alive = false;
    };
  }, [stack]);
  if (load.kind === "loading") return <span className="board-tile"><Wait phase="" since={load.since} /></span>;
  if (load.kind === "none") return <span className="board-tile meta">{load.why}</span>;
  const level = Math.max(0, Math.min(3, load.m.levels - 1));
  const depth = levelShape(load.m, level)[0];
  const z = Math.round(at * Math.max(0, depth - 1));
  return (
    <span className="board-tile">
      <img src={doors.renderUrl(stack, level, z, load.m.window.width, load.m.window.center)} alt={`stack ${stack}, plane ${z + 1} of ${depth}`} loading="lazy" />
    </span>
  );
}

/**
 * The pick question's renderer (record 45 S5) for the rating workspace: the
 * board over the session's candidates, and the answer as the campaign door
 * takes it, the chosen stacks as a list with the why beside it.
 */
export function PickQuestion({ role, candidates, busy = false, onAnswer, pictures = true }: { role: string; candidates: BoardCandidate[]; busy?: boolean; onAnswer: (value: number[], why: string) => void; pictures?: boolean }) {
  const [main, setMain] = useState<number | null>(null);
  const [why, setWhy] = useState("");
  const ready = main !== null && why.trim() !== "" && !busy;
  return (
    <div className="stack roomy">
      <p className="lede">Which acquisition stands for {role || "the role"} on this occasion?</p>
      <SessionBoard candidates={candidates} main={main} onMain={setMain} why={why} onWhy={setWhy} pictures={pictures} />
      <div className="row actions">
        <button type="button" className="button" disabled={!ready} onClick={() => main !== null && onAnswer(candidates[main].stacks, why.trim())}>
          Answer
        </button>
      </div>
    </div>
  );
}
