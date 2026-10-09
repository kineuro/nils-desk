// SPDX-License-Identifier: AGPL-3.0-only
// Where a new conversation can begin (the chat, slice 4; one chat): a few
// things to ask, one set for everyone, offered before the first message.
// Choosing one puts it in the message box, to change or to send; nothing is
// sent by itself.

export const STARTERS = [
  "What does the registry hold?",
  "Subjects with a T1w and a FLAIR in the same session",
  "What is queued or running now?",
];

export function Starters({ onPick }: { onPick: (words: string) => void }) {
  return (
    <div className="starters" role="group" aria-label="Ways to begin">
      {STARTERS.map((s) => (
        <button key={s} type="button" className="starter" onClick={() => onPick(s)}>
          {s}
        </button>
      ))}
    </div>
  );
}
