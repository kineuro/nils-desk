// SPDX-License-Identifier: AGPL-3.0-only
// The one ⋯ menu in a conversation's head (the Assistant redesign,
// 2026-10-09): share, rename, pin, archive, export and delete, in place of a
// row of buttons ("I cannot see the messages ... huge number of buttons").
// The page of all conversations keeps its own row (ChatHistory).

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { type Chat, chats, chatTitle } from "./chats";
import { exportName, saveText } from "./download";

export function ChatMenu(props: { chat: Chat; onShare: () => void; onRename: () => void; onChanged: (c: Chat) => void; onDeleted: () => void; onFailed: (why: string) => void }) {
  const { chat, onShare, onRename, onChanged, onDeleted, onFailed } = props;
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  // a click anywhere else, or Esc, closes it
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const act = (p: Promise<Chat>, words: string) => {
    setBusy(true);
    p.then(onChanged, (e: Error) => onFailed(`${words}: ${e.message}`)).finally(() => setBusy(false));
  };
  const choose = (f: () => void) => () => {
    setOpen(false);
    f();
  };
  // the arrows walk the menu
  const walk = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <div className="chat-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="icon-button"
        aria-label="Share, rename, pin, archive, export, delete"
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="chat-menu-pop" role="menu" aria-label="This conversation" onKeyDown={walk}>
          <button type="button" role="menuitem" onClick={choose(onShare)}>
            {chat.shared ? "Shared" : "Share"}
          </button>
          <button type="button" role="menuitem" onClick={choose(onRename)}>
            Rename
          </button>
          <button type="button" role="menuitem" onClick={choose(() => act(chats.patch(chat.id, { pinned: !chat.pinned }), chat.pinned ? "It was not unpinned" : "It was not pinned"))}>
            {chat.pinned ? "Unpin" : "Pin"}
          </button>
          <button type="button" role="menuitem" onClick={choose(() => act(chats.patch(chat.id, { archived: !chat.archived }), chat.archived ? "It was not restored" : "It was not archived"))}>
            {chat.archived ? "Restore" : "Archive"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={choose(() =>
              chats.exportMarkdown(chat.id).then(
                (text) => saveText(exportName(chat.title), text),
                (e: Error) => onFailed(`The conversation could not be exported: ${e.message}`),
              ),
            )}
          >
            Export
          </button>
          <button type="button" role="menuitem" className="danger" onClick={choose(() => setAsking(true))}>
            Delete
          </button>
        </div>
      )}
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
                      (e: Error) => onFailed(`The conversation could not be deleted: ${e.message}`),
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
          <p>{chatTitle(chat)} leaves your list and cannot be opened again. The queries it made stay on the Query page.</p>
        </Dialog>
      )}
    </div>
  );
}
