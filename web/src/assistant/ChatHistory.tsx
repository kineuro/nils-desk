// SPDX-License-Identifier: AGPL-3.0-only
// All of a person's conversations (the chat, slice 2): searched by title,
// grouped by when each was last used with the pinned first, the archived on a
// tab of their own, and each renamed, pinned, archived or deleted in place.
// The same actions sit in a conversation's own head.

import { useEffect, useState } from "react";
import { whenWords } from "../data/sources";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { type Chat, chats, chatsKept, chatTitle, groupsOf, STATION_WORDS } from "./chats";

export function ChatHistory() {
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [rows, setRows] = useState<Chat[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [since] = useState(() => Date.now());
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    let alive = true;
    // a search waits for the typing to pause
    const t = setTimeout(
      () =>
        chats.list({ q: q.trim() || undefined, archived, limit: 100 }).then(
          (r) => {
            if (!alive) return;
            setRows(r.conversations);
            setNext(r.next);
            setWhy(null);
          },
          (e: Error) => alive && setWhy(e.message),
        ),
      q ? 250 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, archived, asked]);

  const more = () => {
    if (!next) return;
    chats.list({ q: q.trim() || undefined, archived, limit: 100, before: next }).then(
      (r) => {
        setRows((was) => [...(was ?? []), ...r.conversations]);
        setNext(r.next);
      },
      (e: Error) => setWhy(e.message),
    );
  };
  const changed = () => {
    setAsked((n) => n + 1);
    chatsKept.refresh().catch(() => undefined);
  };

  return (
    <section className="chat-history">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Assistant</span>
          <h1>All conversations</h1>
          <p className="lede">Every conversation you have had with the assistant, the pinned first. They are yours alone.</p>
        </div>
        <a className="button" href={href("assistant", "new")}>
          <Icon name="plus" />
          New conversation
        </a>
      </div>
      <div className="row chat-history-tools">
        <label className="input grow chat-search">
          <Icon name="search" />
          <input value={q} placeholder="Search by title" aria-label="Search your conversations by title" onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chart-tabs" role="tablist" aria-label="Which conversations">
          <button type="button" role="tab" aria-selected={!archived} className={archived ? "" : "on"} onClick={() => setArchived(false)}>
            Current
          </button>
          <button type="button" role="tab" aria-selected={archived} className={archived ? "on" : ""} onClick={() => setArchived(true)}>
            Archived
          </button>
        </div>
      </div>
      {why && <p className="warn">Your conversations could not be read: {why}</p>}
      {rows === null && !why && <Wait phase="reading your conversations" since={since} size="panel" />}
      {rows !== null && rows.length === 0 && (
        <p className="meta">{q.trim() ? "No conversation has that in its title." : archived ? "Nothing is archived." : "No conversation yet."}</p>
      )}
      {rows !== null &&
        groupsOf(rows).map((g) => (
          <section key={g.label} className="chat-group">
            <h2 className="chat-group-label">{g.label}</h2>
            <div className="panel chat-rows">
              {g.chats.map((c) => (
                <div key={c.id} className="chat-row">
                  <a className="grow chat-row-link" href={href("assistant", c.id)}>
                    <span className="chat-row-title">{chatTitle(c)}</span>
                    <span className="meta">
                      {STATION_WORDS[c.station] ?? c.station} · {whenWords(c.updated_at)}
                      {c.shared ? " · shared" : ""}
                    </span>
                  </a>
                  <ChatActions chat={c} onChanged={changed} onDeleted={changed} />
                </div>
              ))}
            </div>
          </section>
        ))}
      {next && (
        <button type="button" className="button secondary" onClick={more}>
          Show earlier conversations
        </button>
      )}
    </section>
  );
}

/** What a person does to one of their conversations: rename it, pin it, archive it, delete it. */
export function ChatActions({ chat, onChanged, onDeleted }: { chat: Chat; onChanged: (c: Chat) => void; onDeleted: () => void }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(chat.title ?? "");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  const act = (p: Promise<Chat>) => {
    setBusy(true);
    setWhy(null);
    p.then(
      (c) => {
        setNaming(false);
        onChanged(c);
      },
      (e: Error) => setWhy(e.message),
    ).finally(() => setBusy(false));
  };

  if (naming)
    return (
      <form
        className="row chat-rename"
        onSubmit={(e) => {
          e.preventDefault();
          act(chats.patch(chat.id, { title: name.trim() || null }));
        }}
      >
        <span className="input">
          <input
            value={name}
            autoFocus
            aria-label="The conversation's name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setNaming(false);
            }}
          />
        </span>
        <button type="submit" className="button small" disabled={busy}>
          Save
        </button>
        <button type="button" className="button secondary small" onClick={() => setNaming(false)}>
          Cancel
        </button>
        {why && <span className="warn">{why}</span>}
      </form>
    );

  return (
    <div className="row chat-actions">
      <button
        type="button"
        className="button secondary small"
        disabled={busy}
        onClick={() => {
          setName(chat.title ?? "");
          setNaming(true);
        }}
      >
        Rename
      </button>
      <button type="button" className="button secondary small" disabled={busy} aria-pressed={chat.pinned} onClick={() => act(chats.patch(chat.id, { pinned: !chat.pinned }))}>
        {chat.pinned ? "Unpin" : "Pin"}
      </button>
      <button type="button" className="button secondary small" disabled={busy} onClick={() => act(chats.patch(chat.id, { archived: !chat.archived }))}>
        {chat.archived ? "Restore" : "Archive"}
      </button>
      <button type="button" className="button secondary small" disabled={busy} onClick={() => setAsking(true)}>
        Delete
      </button>
      {why && <span className="warn">{why}</span>}
      {asking && (
        <Dialog
          title="Delete this conversation?"
          icon="alert"
          onClose={() => setAsking(false)}
          foot={
            <div className="row actions">
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  chats
                    .remove(chat.id)
                    .then(
                      () => {
                        setAsking(false);
                        onDeleted();
                      },
                      (e: Error) => setWhy(e.message),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                Delete
              </button>
              <button type="button" className="button secondary" onClick={() => setAsking(false)}>
                Cancel
              </button>
            </div>
          }
        >
          <p>
            {chatTitle(chat)} leaves your list and cannot be opened again. The queries it made stay on the Query page.
          </p>
        </Dialog>
      )}
    </div>
  );
}
