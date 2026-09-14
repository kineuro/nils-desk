// SPDX-License-Identifier: AGPL-3.0-only
// The Memory page (the chat, slice 6): what the assistant reads at the start
// of each new conversation. The person sees, adds, edits and deletes what
// they asked it to keep and the notes kept from their work, pauses memory or
// deletes all of it; everyone reads the install's instructions, and an admin
// writes their next version.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { whenWords } from "../data/sources";
import { holds } from "../deployment";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { Markdown } from "./Markdown";
import {
  asked, budgetWords,
  charsLeft,
  fromWork,
  INSTRUCTION_CHARS,
  type InstructionsState,
  MEMORY_CHARS,
  type MemoryItem,
  type MemoryState,
  memory,
  sourceWords,
} from "./memory";

export function MemoryPage({ caps }: { caps: Capabilities }) {
  const [state, setState] = useState<MemoryState | null>(null);
  const [instructions, setInstructions] = useState<InstructionsState | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asked_, setAsked] = useState(0);
  const [since] = useState(() => Date.now());
  const admin = holds(caps, "admin");

  useEffect(() => {
    let alive = true;
    memory.read().then(
      (s) => alive && setState(s),
      (e: Error) => alive && setWhy(e.message),
    );
    memory.instructions().then(
      (s) => alive && setInstructions(s),
      (e: Error) => alive && setWhy(e.message),
    );
    return () => {
      alive = false;
    };
  }, [asked_]);

  const act = (p: Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setWhy(null);
    p.then(
      () => {
        after?.();
        setAsked((n) => n + 1);
      },
      (e: Error) => setWhy(e.message),
    ).finally(() => setBusy(false));
  };

  if (!state && !why) return <Wait phase="reading what the assistant keeps" since={since} size="panel" />;
  const paused = state?.paused ?? false;
  const mine = asked(state?.items ?? []);
  const work = fromWork(state?.items ?? []);
  const current = instructions?.current ?? null;

  return (
    <section className="chat-history memory-page">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Assistant</span>
          <h1>Memory</h1>
          <p className="lede">
            What the assistant reads at the start of each new conversation: the install's instructions, what you asked it to keep, up to 3,000 characters of it, and a few notes from your work. It keeps
            something only when you ask or accept, never a person's data, and what it keeps about you is yours alone.
          </p>
        </div>
      </div>
      {why && <p className="warn">{why}</p>}

      <div className="panel memory-switch">
        <div className="grow">
          <p className="memory-switch-title">{paused ? "Memory is paused" : "Memory is on"}</p>
          <p className="meta">
            {paused
              ? "New conversations start without it, and nothing new is kept. What is kept stays until you delete it."
              : "New conversations start with what is kept below. A conversation already open keeps what it started with."}
          </p>
        </div>
        <div className="row memory-switch-actions">
          <button type="button" className="button secondary small" disabled={busy || !state} onClick={() => act(memory.pause(!paused))}>
            {paused ? "Resume memory" : "Pause memory"}
          </button>
          <button type="button" className="button secondary small" disabled={busy || !state} onClick={() => setResetting(true)}>
            Delete everything
          </button>
        </div>
      </div>

      <section className="chat-group">
        <h2 className="chat-group-label">What you asked it to keep</h2>
        {mine.length > 0 && <p className="meta memory-budget">{budgetWords(mine)}</p>}
        <form
          className="row memory-add"
          onSubmit={(e) => {
            e.preventDefault();
            const text = adding.trim();
            if (text) act(memory.add(text, "page"), () => setAdding(""));
          }}
        >
          <label className="input grow">
            <Icon name="plus" />
            <input
              value={adding}
              maxLength={MEMORY_CHARS}
              placeholder="Something to keep, such as: I count subjects by cohort, not by site"
              aria-label="Something for the assistant to keep"
              disabled={paused}
              onChange={(e) => setAdding(e.target.value)}
            />
          </label>
          <span className="meta num">{charsLeft(adding)}</span>
          <button type="submit" className="button small" disabled={busy || paused || !adding.trim()}>
            Keep it
          </button>
        </form>
        {mine.length === 0 ? (
          <p className="meta">Nothing yet. Say "remember that ..." in a conversation, or type it above.</p>
        ) : (
          <div className="panel chat-rows">
            {mine.map((i) =>
              editing?.id === i.id ? (
                <form
                  key={i.id}
                  className="chat-row memory-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(memory.edit(i.id, editing.text.trim()), () => setEditing(null));
                  }}
                >
                  <label className="input grow">
                    <input value={editing.text} maxLength={MEMORY_CHARS} aria-label="The memory" onChange={(e) => setEditing({ id: i.id, text: e.target.value })} />
                  </label>
                  <button type="submit" className="button small" disabled={busy || !editing.text.trim()}>
                    Save
                  </button>
                  <button type="button" className="button secondary small" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <MemoryRow key={i.id} item={i} busy={busy} onEdit={() => setEditing({ id: i.id, text: i.text })} onDelete={() => act(memory.remove(i.id))} />
              ),
            )}
          </div>
        )}
      </section>

      <section className="chat-group">
        <h2 className="chat-group-label">Kept from your work</h2>
        {work.length === 0 ? (
          <p className="meta">Nothing yet. A query you settle, or a proposal you disregard, leaves a short note here.</p>
        ) : (
          <div className="panel chat-rows">
            {work.map((i) => (
              <MemoryRow key={i.id} item={i} busy={busy} onDelete={() => act(memory.remove(i.id))} />
            ))}
          </div>
        )}
      </section>

      <section className="chat-group">
        <h2 className="chat-group-label">The install's instructions</h2>
        {draft === null ? (
          <>
            {current ? (
              <div className="panel memory-instructions">
                <Markdown text={current.text} />
                <p className="meta">
                  Version {current.version}, written by {current.author}, {whenWords(current.at)}.
                </p>
              </div>
            ) : (
              <p className="meta">No instructions yet.{admin ? " Write the first: the cohorts and what they mean, the conventions, a short glossary." : ""}</p>
            )}
            {admin && (
              <div className="row">
                <button type="button" className="button secondary small" onClick={() => setDraft(current?.text ?? "")}>
                  <Icon name="pencil" />
                  {current ? "Write the next version" : "Write the instructions"}
                </button>
              </div>
            )}
          </>
        ) : (
          <form
            className="memory-draft"
            onSubmit={(e) => {
              e.preventDefault();
              act(memory.writeInstructions(draft), () => setDraft(null));
            }}
          >
            <div className="input composer-input">
              <textarea value={draft} rows={12} maxLength={INSTRUCTION_CHARS} aria-label="The install's instructions" onChange={(e) => setDraft(e.target.value)} />
            </div>
            <div className="row">
              <span className="meta grow">
                Every new conversation reads them, for everyone on this install. {charsLeft(draft, INSTRUCTION_CHARS)} characters left.
              </span>
              <button type="button" className="button secondary small" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" className="button small" disabled={busy || !draft.trim()}>
                Save as version {(current?.version ?? 0) + 1}
              </button>
            </div>
          </form>
        )}
        {(instructions?.history.length ?? 0) > 1 && (
          <p className="meta">
            Earlier versions: {instructions?.history
              .filter((h) => h.version !== current?.version)
              .map((h) => `${h.version} by ${h.author}, ${whenWords(h.at)}`)
              .join("; ")}
            .
          </p>
        )}
      </section>

      {resetting && (
        <Dialog
          title="Delete everything the assistant keeps about you?"
          icon="alert"
          onClose={() => setResetting(false)}
          foot={
            <div className="row actions">
              <button type="button" className="button" disabled={busy} onClick={() => act(memory.reset(), () => setResetting(false))}>
                Delete everything
              </button>
              <button type="button" className="button secondary" onClick={() => setResetting(false)}>
                Cancel
              </button>
            </div>
          }
        >
          <p>
            What you asked it to keep and the notes from your work are deleted at once. A conversation already open keeps what it started with; the install's instructions
            stay.
          </p>
        </Dialog>
      )}
    </section>
  );
}

function MemoryRow({ item, busy, onEdit, onDelete }: { item: MemoryItem; busy: boolean; onEdit?: () => void; onDelete: () => void }) {
  return (
    <div className="chat-row memory-row">
      <div className="grow chat-row-link">
        <span className="chat-row-title">{item.text}</span>
        <span className="meta">
          {sourceWords(item)} · {whenWords(item.edited_at ?? item.at)}
          {item.used_at ? ` · last read ${whenWords(item.used_at)}` : ""}
        </span>
      </div>
      <div className="row chat-actions">
        {onEdit && (
          <button type="button" className="button secondary small" disabled={busy} onClick={onEdit}>
            Edit
          </button>
        )}
        <button type="button" className="button secondary small" disabled={busy} onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
