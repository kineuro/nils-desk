// SPDX-License-Identifier: AGPL-3.0-only
// Where a new conversation can begin (the chat, slice 4; one chat): a few
// things to ask, one set for everyone, offered before the first message.
// Choosing one puts it in the message box, to change or to send; nothing is
// sent by itself. Where the assistant serves the analysis-plan station
// (2026-10-13), one more begins a plan: it puts /plan in the box, and the
// question after it opens the run filled in on the Pipelines page.

export const STARTERS = [
  "What does the registry hold?",
  "Subjects with a T1w and a FLAIR in the same session",
  "What is queued or running now?",
];

/** The starter that begins a plan, and what it puts in the box. */
export const PLAN_STARTER = { words: "Plan a pipeline run", text: "/plan " };

export function Starters({ onPick, plan = false }: { onPick: (words: string) => void; plan?: boolean }) {
  return (
    <div className="starters" role="group" aria-label="Ways to begin">
      {STARTERS.map((s) => (
        <button key={s} type="button" className="starter" onClick={() => onPick(s)}>
          {s}
        </button>
      ))}
      {plan && (
        <button type="button" className="starter" onClick={() => onPick(PLAN_STARTER.text)}>
          {PLAN_STARTER.words}
        </button>
      )}
    </div>
  );
}
