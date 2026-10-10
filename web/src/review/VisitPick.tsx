// SPDX-License-Identifier: AGPL-3.0-only
// One visit's pick on the Main scans page (record 55, decision 6): the
// visit's candidates for the role on the session board, the one the rules
// took marked, and a person's own pick with a why. The pick belongs to the
// page's dataset or cohort: later runs of its rules leave it standing, and
// withdrawing it lets the rules' pick apply again. Nothing is asked of
// anyone; this is for a visit a person wants otherwise.

import { useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { may } from "../grants";
import { Dialog } from "../ui/Dialog";
import { refusalWords } from "./client";
import { mainScans, roleWord, type MapSubject, type MapVisit, type Scope } from "./mainScans";
import { SessionBoard, type BoardCandidate } from "./SessionBoard";

const SCAN_WORDS = { one: "scan", many: "scans", chosen: "the rules' pick", why: "motion in series 9" };

const sameScans = (a: readonly number[], b: readonly number[]) => a.length === b.length && [...a].sort((x, y) => x - y).every((s, i) => s === [...b].sort((x, y) => x - y)[i]);

/** The visit's candidates as the board draws them: the engine's list, or the scans picked alone where it names none. */
export function boardOf(v: MapVisit, slot: (kind: string | null) => number | null): BoardCandidate[] {
  const listed = v.candidates ?? (v.stacks.length > 0 ? [{ stacks: v.stacks, kind: v.kind, score: null }] : []);
  return listed.map((c) => ({ stacks: c.stacks, score: c.score, chosen: v.by !== "person" && sameScans(c.stacks, v.stacks), label: c.kind, slot: slot(c.kind) }));
}

/** Who picked the visit's scan, in one line. */
export function pickedWords(v: MapVisit, version: number | null, draft: boolean): string {
  if (v.by === "person") return `A person picked it${v.why ? `: ${v.why}` : ""}. Later runs leave it standing.`;
  if (v.stacks.length === 0) return draft ? "Your changed rules pick nothing here." : "The rules pick nothing here.";
  if (draft) return "Picked by your changed rules, not saved yet. Nobody was asked.";
  return `Picked by rules version ${version ?? 1}. Nobody was asked.`;
}

export interface VisitPickProps {
  caps: Capabilities;
  scope: Scope;
  role: string;
  subject: MapSubject;
  visit: MapVisit;
  /** The version the page's picks are made with, and whether a draft stands in for it. */
  version: number | null;
  draft: boolean;
  slot: (kind: string | null) => number | null;
  onClose: () => void;
  onDone: (words: string) => void;
  pictures?: boolean;
}

export function VisitPick({ caps, scope, role, subject, visit, version, draft, slot, onClose, onDone, pictures = true }: VisitPickProps) {
  const candidates = boardOf(visit, slot);
  const now = candidates.findIndex((c) => sameScans(c.stacks, visit.stacks));
  const [main, setMain] = useState<number | null>(now >= 0 ? now : null);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const work = may(caps, "review:work");
  const mayPick = work && served(caps, "POST /api/picks") && candidates.length > 0;
  const mayWithdraw = work && served(caps, "POST /api/picks/{id}/withdraw") && visit.by === "person" && visit.pick !== null;
  const where = `subject ${subject.subject}, visit ${visit.visit}`;
  const run = (act: Promise<unknown>, words: string) => {
    setBusy(true);
    setRefused(null);
    act.then(
      () => onDone(words),
      (e: unknown) => {
        setBusy(false);
        setRefused(refusalWords(e));
      },
    );
  };
  const pick = () => {
    if (main === null) return;
    const scans = candidates[main].stacks;
    run(mainScans.pick(scope, role, scans, why), `Picked ${scans.length === 1 ? "scan" : "scans"} ${scans.join(", ")} for ${where}. Later runs leave it standing.`);
  };
  const withdraw = () => visit.pick !== null && run(mainScans.withdraw(scope, visit.pick, why), `Withdrew the pick for ${where}; the rules' pick applies again.`);
  return (
    <Dialog
      title={`This visit's ${roleWord(role)}`}
      icon="review"
      onClose={onClose}
      foot={
        <div className="row actions">
          {mayPick && (
            <button type="button" className="button" disabled={busy || main === null || why.trim() === ""} onClick={pick}>
              Keep my pick
            </button>
          )}
          {mayWithdraw && (
            <button type="button" className="button secondary" disabled={busy} onClick={withdraw}>
              Withdraw my pick
            </button>
          )}
          <button type="button" className="button quiet" onClick={onClose}>
            Close
          </button>
          {refused && <span className="warn">{refused}</span>}
        </div>
      }
    >
      <p className="eyebrow">
        Subject {subject.subject} · visit {visit.visit}
        {visit.column ? ` · ${visit.column}` : ""}
      </p>
      <p className="meta">{pickedWords(visit, version, draft)}</p>
      {visit.candidates === null && candidates.length > 0 && <p className="meta">Only the picked scan is named here.</p>}
      <SessionBoard candidates={candidates} main={main} onMain={mayPick ? setMain : null} why={why} onWhy={mayPick || mayWithdraw ? setWhy : null} pictures={pictures} words={SCAN_WORDS} />
    </Dialog>
  );
}
