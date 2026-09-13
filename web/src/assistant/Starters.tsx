// SPDX-License-Identifier: AGPL-3.0-only
// Where a new conversation can begin (the chat, slice 4): a few questions each
// station answers well, offered before the first message. Choosing one puts it
// in the message box, to change or to send; nothing is sent by itself.

const STARTERS: Record<string, string[]> = {
  concierge: [
    "What does the registry hold?",
    "Which saved queries are there, and what does each find?",
    "Which jobs ran most recently, and how did they end?",
  ],
  "ask-help": [
    "Subjects with a T1w and a FLAIR in the same session",
    "How many sessions does each cohort have?",
    "Subjects scanned at least twice, a year or more apart",
  ],
  operator: ["Digest what is new in every source", "What is queued or running now?", "Every night at two, digest what is new"],
};

export function startersOf(station: string): string[] {
  return STARTERS[station] ?? [];
}

export function Starters({ station, onPick }: { station: string; onPick: (words: string) => void }) {
  const list = startersOf(station);
  if (list.length === 0) return null;
  return (
    <div className="starters" role="group" aria-label="Ways to begin">
      {list.map((s) => (
        <button key={s} type="button" className="starter" onClick={() => onPick(s)}>
          {s}
        </button>
      ))}
    </div>
  );
}
