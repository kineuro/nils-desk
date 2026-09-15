// SPDX-License-Identifier: AGPL-3.0-only
// Sharing one conversation (the chat, slice 5): with people named from the
// desk or with everyone on it, brought up to the latest turn, or no longer
// shared. The dialog says what a share shows, which class it guards once the
// assistant has weighed it, and who has opened it.

import { useEffect, useState } from "react";
import { whenWords } from "../data/sources";
import { href } from "../routes";
import { Dialog } from "../ui/Dialog";
import { useCopy } from "../ui/clipboard";
import { Icon } from "../ui/Icon";
import type { Chat } from "./chats";
import { audienceWords, type DeskPerson, guardWords, matching, namesOf, peopleKept, readsWords, type Share, ShareRefused, shares } from "./shares";

export function ShareDialog({ chat, onClose }: { chat: Chat; onClose: (shared: boolean) => void }) {
  // undefined while it is read
  const [share, setShare] = useState<Share | null | undefined>(undefined);
  const [people, setPeople] = useState<DeskPerson[] | null>(null);
  const [alone, setAlone] = useState(false);
  const [audience, setAudience] = useState<"people" | "desk">("people");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [copied, copyNow] = useCopy();

  useEffect(() => {
    let alive = true;
    shares.of(chat.id).then(
      (r) => {
        if (!alive) return;
        setShare(r.share);
        if (r.share) {
          setAudience(r.share.audience);
          setPicked(new Set(r.share.people.map((p) => p.subject)));
        }
      },
      (e: Error) => {
        if (!alive) return;
        setShare(null);
        setWhy(e.message);
      },
    );
    shares.people().then(
      (r) => {
        if (!alive) return;
        setPeople(r.people);
        peopleKept.put(r.people);
      },
      (e: unknown) => {
        if (!alive) return;
        setPeople([]);
        // a desk nobody signs in to has one person
        if (e instanceof ShareRefused && e.status === 404) setAlone(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [chat.id]);

  const chosen = (people ?? []).filter((p) => picked.has(p.subject));
  const toggle = (subject: string) =>
    setPicked((was) => {
      const next = new Set(was);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  const act = (p: Promise<unknown>) => {
    setBusy(true);
    setWhy(null);
    p.catch((e: Error) => setWhy(e.message)).finally(() => setBusy(false));
  };
  const save = () => act(shares.put(chat.id, audience, audience === "people" ? chosen : []).then((r) => setShare(r.share)));
  const stop = () => act(shares.stop(chat.id).then(() => setShare(null)));
  const link = share ? `${location.origin}${location.pathname}${href("assistant", share.id)}` : "";
  const copy = () => copyNow(link);
  const done = () => onClose(Boolean(share));

  return (
    <Dialog
      title="Share this conversation"
      icon="users"
      onClose={done}
      foot={
        <div className="row actions">
          {!alone && (
            <button type="button" className="button" disabled={busy || share === undefined || (audience === "people" && chosen.length === 0)} onClick={save}>
              {share ? "Update the share" : "Share"}
            </button>
          )}
          {share && (
            <button type="button" className="button secondary" disabled={busy} onClick={stop}>
              Stop sharing
            </button>
          )}
          <button type="button" className="button secondary" onClick={done}>
            Close
          </button>
        </div>
      }
    >
      <p>
        The people you share with see what was said and the query versions proposed, as the conversation stands when you share it or update the share, never what a tool
        returned. A card they open is read again with what they may see.
      </p>
      {alone && <p className="meta">This desk has one person, so there is nobody to share with.</p>}
      {share && (
        <div className="share-state">
          <p>
            <strong>Shared with {audienceWords(share)}</strong>, as it stood {whenWords(share.updated_at)}. {readsWords(share.reads, namesOf(people))}.
          </p>
          {guardWords(share.guards) && <p className="meta">{guardWords(share.guards)}</p>}
          <div className="row share-link">
            <span className="input static grow">
              <input readOnly value={link} aria-label="The share's link" />
            </span>
            <button type="button" className="button secondary small" onClick={copy}>
              <Icon name={copied === "copied" ? "check" : copied === "failed" ? "alert" : "copy"} />
              {copied === "copied" ? "Copied" : copied === "failed" ? "Could not copy" : "Copy link"}
            </button>
          </div>
        </div>
      )}
      {!alone && (
        <fieldset className="share-audience">
          <legend className="meta">Who may read it</legend>
          <label className="row">
            <input type="radio" name="audience" checked={audience === "people"} onChange={() => setAudience("people")} />
            People I name
          </label>
          <label className="row">
            <input type="radio" name="audience" checked={audience === "desk"} onChange={() => setAudience("desk")} />
            Everyone on this desk who uses the assistant
          </label>
        </fieldset>
      )}
      {!alone && audience === "people" && (
        <div className="share-people">
          <label className="input">
            <Icon name="search" />
            <input value={q} placeholder="Find a person" aria-label="Find a person on this desk" onChange={(e) => setQ(e.target.value)} />
          </label>
          {people === null && <p className="meta">Reading the people on this desk.</p>}
          {people !== null && people.length === 0 && <p className="meta">Nobody else is on this desk yet.</p>}
          {people !== null && people.length > 0 && (
            <ul className="share-people-list">
              {matching(people, q).map((p) => (
                <li key={p.subject}>
                  <label className="row">
                    <input type="checkbox" checked={picked.has(p.subject)} onChange={() => toggle(p.subject)} />
                    <span className="grow">{p.display || p.subject}</span>
                    <span className="meta">{p.subject}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {why && <p className="warn">{why}</p>}
    </Dialog>
  );
}
