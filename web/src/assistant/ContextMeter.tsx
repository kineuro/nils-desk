// SPDX-License-Identifier: AGPL-3.0-only
// How full a conversation's context is (the chat, slice 3): a thin bar and
// its share of the model's window, amber once most of it is used; earlier
// turns are summarized before it fills.

import { type ChatContext, meterOf } from "./chats";

export function ContextMeter({ context }: { context: ChatContext | null }) {
  const m = meterOf(context);
  if (!m) return null;
  return (
    <span className={m.tone === "caution" ? "context-meter caution" : "context-meter"} title={m.title}>
      <span className="context-track" aria-hidden="true">
        <i style={{ width: `${m.percent}%` }} />
      </span>
      <span className="meta num">{m.words}</span>
    </span>
  );
}

/** The note a thread carries once its earlier turns were summarized. */
export function CompactionNote({ context }: { context: ChatContext | null }) {
  const n = context?.compactions ?? 0;
  if (n === 0) return null;
  return (
    <p className="meta compaction-note">
      Earlier turns were summarized {n === 1 ? "once" : `${n} times`} to keep the conversation within the model's window. All of it still shows here.
    </p>
  );
}
