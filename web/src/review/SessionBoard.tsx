// SPDX-License-Identifier: AGPL-3.0-only
// The session board (record 45 S5, study A3): one occasion's candidates for a
// role, each the stacks of one acquisition as small pictures that scroll
// together, the run's pick marked, a main toggle and a why that is required.
// A `pick.border` item opens it in Review, and a pick question in a campaign
// renders it as its answer. The pictures are the viewer's tiles (record 45
// S2), one TileSync a board, so the wheel over any of them moves them all;
// where no pyramid is built the tile says so.

import { useState } from "react";
import { Tile, TileSync } from "../viewer/Tile";
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
  const [sync] = useState(() => new TileSync());
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
            <div className="bundle-tiles">
              {c.stacks.map((s) => (
                <Tile key={s} stack={s} sync={sync} size={128} />
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

/**
 * The pick question's renderer (record 45 S5) for the rating workspace: the
 * board over the session's candidates, which the candidates door names
 * (record 45), with the chosen acquisition's stacks as the answer. The
 * workspace keeps the why and the Answer, as for every question.
 */
export function PickQuestion({ role, candidates, stacks, onStacks, pictures = true }: { role: string; candidates: BoardCandidate[]; stacks: number[]; onStacks: (stacks: number[]) => void; pictures?: boolean }) {
  const key = (x: number[]) => [...x].sort((a, b) => a - b).join(",");
  const main = candidates.findIndex((c) => key(c.stacks) === key(stacks));
  return (
    <div className="stack roomy">
      <p className="lede">Which acquisition stands for {role || "the role"} on this occasion?</p>
      <SessionBoard candidates={candidates} main={main >= 0 ? main : null} onMain={(i) => onStacks(candidates[i].stacks)} why="" onWhy={null} pictures={pictures} />
    </div>
  );
}
