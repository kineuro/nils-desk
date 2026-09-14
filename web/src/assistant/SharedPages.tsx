// SPDX-License-Identifier: AGPL-3.0-only
// Shared conversations (the chat, slice 5): the page of what others share
// with the person and what the person shares, and one share opened. A share
// is a snapshot of what was said; its cards open on the Query page under the
// reader's own roles, and a reader may continue it as a conversation of their
// own.

import { useEffect, useState } from "react";
import { whenWords } from "../data/sources";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { useKept } from "../ui/kept";
import { Wait } from "../ui/Wait";
import { chatsKept } from "./chats";
import { audienceWords, guardWords, namesOf, peopleKept, readsWords, type Share, type SharedWithMe, type ShareOpened, ShareRefused, shares, turnsOf } from "./shares";
import { TurnView } from "./TurnView";

const titleOf = (s: { title: string | null }) => s.title?.trim() || "A conversation";

export function SharedList() {
  const [withMe, setWithMe] = useState<SharedWithMe[] | null>(null);
  const [byMe, setByMe] = useState<Share[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [asked, setAsked] = useState(0);
  const [since] = useState(() => Date.now());
  // people are named from the desk's own directory
  const directory = useKept(peopleKept);
  const name = namesOf(directory.value);
  useEffect(() => peopleKept.ensure(), []);

  useEffect(() => {
    let alive = true;
    shares.withMe().then(
      (r) => alive && setWithMe(r.shared),
      (e: Error) => alive && setWhy(e.message),
    );
    shares.mine().then(
      (r) => alive && setByMe(r.shares),
      (e: Error) => alive && setWhy(e.message),
    );
    return () => {
      alive = false;
    };
  }, [asked]);

  const stop = (s: Share) =>
    shares.stop(s.conversation).then(
      () => {
        setAsked((n) => n + 1);
        chatsKept.refresh().catch(() => undefined);
      },
      (e: Error) => setWhy(e.message),
    );

  return (
    <section className="chat-history">
      <div className="data-head">
        <div className="grow">
          <span className="eyebrow">Assistant</span>
          <h1>Shared</h1>
          <p className="lede">Conversations others share with you, and the ones you share. A share shows what was said as it stood when shared; its cards open under your own roles.</p>
        </div>
      </div>
      {why && <p className="warn">The shares could not be read: {why}</p>}
      <section className="chat-group">
        <h2 className="chat-group-label">Shared with you</h2>
        {withMe === null && !why && <Wait phase="reading what is shared with you" since={since} size="panel" />}
        {withMe !== null && withMe.length === 0 && <p className="meta">Nobody shares a conversation with you yet.</p>}
        {withMe !== null && withMe.length > 0 && (
          <div className="panel chat-rows">
            {withMe.map((s) => (
              <div key={s.id} className="chat-row">
                {s.readable ? (
                  <a className="grow chat-row-link" href={href("assistant", s.id)}>
                    <span className="chat-row-title">{titleOf(s)}</span>
                    <span className="meta">
                      {name(s.owner_subject ?? "", s.owner)} · {whenWords(s.updated_at)}
                    </span>
                  </a>
                ) : (
                  <div className="grow chat-row-link">
                    <span className="chat-row-title">{titleOf(s)}</span>
                    <span className="meta">
                      {name(s.owner_subject ?? "", s.owner)} · {s.guards ? `It may have read ${s.guards.words}, which your roles do not reach.` : "Your roles do not reach what it read."}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="chat-group">
        <h2 className="chat-group-label">Shared by you</h2>
        {byMe === null && !why && <Wait phase="reading your shares" since={since} size="panel" />}
        {byMe !== null && byMe.length === 0 && <p className="meta">You share no conversation. Share one from its head.</p>}
        {byMe !== null && byMe.length > 0 && (
          <div className="panel chat-rows">
            {byMe.map((s) => (
              <div key={s.id} className="chat-row">
                <a className="grow chat-row-link" href={href("assistant", s.conversation)}>
                  <span className="chat-row-title">{titleOf(s)}</span>
                  <span className="meta">
                    With {audienceWords(s)} · {readsWords(s.reads, name)} · {whenWords(s.updated_at)}
                  </span>
                </a>
                <button type="button" className="button secondary small" onClick={() => void stop(s)}>
                  Stop sharing
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

export function SharedPage({ id }: { id: string }) {
  const [opened, setOpened] = useState<ShareOpened | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const [since] = useState(() => Date.now());
  const directory = useKept(peopleKept);
  const name = namesOf(directory.value);
  useEffect(() => peopleKept.ensure(), []);

  useEffect(() => {
    let alive = true;
    setOpened(null);
    setRefused(null);
    shares.open(id).then(
      (s) => alive && setOpened(s),
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof ShareRefused && e.status === 404) setRefused("This share is not for you, or it is no longer shared.");
        else setRefused(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      alive = false;
    };
  }, [id]);

  const go = () => {
    setBusy(true);
    setWhy(null);
    shares
      .continue(id)
      .then(
        (c) => {
          chatsKept.refresh().catch(() => undefined);
          location.hash = href("assistant", c.id);
        },
        (e: Error) => setWhy(e.message),
      )
      .finally(() => setBusy(false));
  };
  const toggle = (turn: string) =>
    setUnfolded((was) => {
      const next = new Set(was);
      if (next.has(turn)) next.delete(turn);
      else next.add(turn);
      return next;
    });

  if (refused)
    return (
      <section className="talk-page">
        <div className="talk-head">
          <h1 className="grow">A shared conversation</h1>
        </div>
        <p className="warn">{refused}</p>
        <p>
          <a href={href("assistant", "shared")}>Shared conversations</a>
        </p>
      </section>
    );
  if (!opened) return <Wait phase="reading the share" since={since} size="panel" />;
  const { turns, proposals } = turnsOf(opened.snapshot.messages);
  return (
    <section className="talk-page">
      <div className="talk-head">
        <h1 className="grow">{titleOf(opened)}</h1>
        {opened.mine ? (
          <a className="button secondary small" href={href("assistant", opened.conversation)}>
            Open the conversation
          </a>
        ) : (
          <button type="button" className="button small" disabled={busy} onClick={go}>
            <Icon name="assistant" />
            Continue as mine
          </button>
        )}
      </div>
      <p className="meta share-byline">
        {opened.mine ? `You share this with ${audienceWords(opened)}` : `Shared by ${name(opened.owner_subject ?? "", opened.owner)}`}, as it stood {whenWords(opened.updated_at)}. A card opens under your
        own roles.
      </p>
      {opened.mine && guardWords(opened.guards) && <p className="meta">{guardWords(opened.guards)}</p>}
      <div className="talk">
        {turns.map((t) => (
          <TurnView
            key={t.id}
            turn={t}
            open={unfolded.has(t.id)}
            onToggle={() => toggle(t.id)}
            proposals={proposals.filter((p) => p.turn === t.id)}
            choice={null}
            onChoose={() => undefined}
            openQuery={(document) => href("query", String(document))}
          />
        ))}
        {turns.length === 0 && <p className="meta">Nothing was said in it yet.</p>}
      </div>
      {why && <p className="warn">It could not be continued: {why}</p>}
    </section>
  );
}
