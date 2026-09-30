// SPDX-License-Identifier: AGPL-3.0-only
// Correcting one's own answer in the anchored and the pair reader (the
// post-contrast study; Nima, reading an anchored campaign: "how can i
// fix/change my answers?"). `b` opens the answer given last, and again the
// one before it; `m` lists the answers still standing, each by its place in
// the campaign ("item 12"), never by a stack. An answer opened shows the same
// blind view with that answer marked; another choice and Enter correct it
// through the engine's amend door, which keeps the earlier answer and marks
// the new one as its correction. The lease on the item being read is kept
// while a correction is open, and the reader comes back to it after.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { campaigns, refused as refusedWords, type Campaign, type MyAnswer } from "./client";
import { amendRefusal } from "./MyAnswers";

/**
 * The answer `b` opens: the latest of one's own answers still standing, or,
 * while one is open, the one given before it. `mine` is the mine door's
 * list, the latest first. Null where there is none.
 */
export function backTarget(mine: readonly MyAnswer[], open: number | null): MyAnswer | null {
  const own = mine.filter((a) => a.role !== "adjudicator");
  if (open === null) return own[0] ?? null;
  const at = own.findIndex((a) => a.answer === open);
  // the one open was corrected meanwhile, or is not in the list: start from the latest
  if (at < 0) return own[0] ?? null;
  return own[at + 1] ?? null;
}

/** An answer's value as one of the words a kind takes, or null where it is none of them. */
export function answerOf<A extends string>(answers: readonly A[], value: unknown): A | null {
  return typeof value === "string" && (answers as readonly string[]).includes(value.trim()) ? (value.trim() as A) : null;
}

export interface Correction {
  /** The answer open to correct, or null while the item leased is read. */
  amending: MyAnswer | null;
  /** Why nothing here can be corrected (a closed campaign, an engine without the door), or null. */
  refusal: string | null;
  /** Open one's own answer to correct. */
  open: (a: MyAnswer) => void;
  /** `b`: the last answer given, or the one before the one open. */
  back: () => void;
  /** Leave the answer open as it was, back to the item leased. */
  leave: () => void;
  /** The correction of `a` was sent: back to the item leased, unless another answer was opened meanwhile. */
  done: (a: MyAnswer) => void;
  /** The list of one's own answers, open or not. */
  listOpen: boolean;
  setListOpen: (open: boolean | ((was: boolean) => boolean)) => void;
}

/**
 * The corrections of one reader. `amendAt` is an answer a link names
 * (`?amend=<answer>`, from My answers elsewhere), opened once the campaign
 * is read. `say` tells the person what happened in the reader's own line.
 */
export function useCorrection(o: { caps: Capabilities; id: string; campaign: Campaign | null; amendAt: number | null; busy: boolean; say: (words: string) => void; words: (a: MyAnswer) => string }): Correction {
  const { caps, id, campaign, amendAt, busy, say, words } = o;
  const [amending, setAmending] = useState<MyAnswer | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const refusal = campaign ? amendRefusal(caps, campaign, null) : null;
  const now = useRef({ refusal, busy, say, words });
  now.current = { refusal, busy, say, words };
  // the answer open now, set at once so quick keys see it before a render
  const openNow = useRef<MyAnswer | null>(null);
  // each look at one's answers is numbered; only the latest may open one, and opening or leaving outdates them all
  const asked = useRef(0);

  const show = useCallback((a: MyAnswer | null) => {
    asked.current += 1;
    openNow.current = a;
    setAmending(a);
  }, []);

  const open = useCallback((a: MyAnswer) => {
    // an answer or a correction being sent: nothing is opened over it
    if (now.current.busy) return;
    setListOpen(false);
    show(a);
    now.current.say(`Correcting ${now.current.words(a)}: choose again and press Enter, or s to leave it as it was.`);
  }, [show]);

  // a link's answer, once the campaign is read
  const opened = useRef(false);
  useEffect(() => {
    if (!campaign || amendAt === null || opened.current) return;
    opened.current = true;
    if (now.current.refusal) {
      now.current.say(now.current.refusal);
      return;
    }
    campaigns.mine(id).then(
      (m) => {
        const a = m.answers.find((x) => x.answer === amendAt);
        if (a) open(a);
        else now.current.say(`That answer is not one of yours still standing: it may have been corrected already. Open My answers (m) for the latest.`);
      },
      (e: unknown) => now.current.say(refusedWords(e)),
    );
  }, [campaign, amendAt, id, open]);

  const back = useCallback(() => {
    const { refusal, busy } = now.current;
    if (busy) return;
    if (refusal) {
      now.current.say(refusal);
      return;
    }
    const n = ++asked.current;
    const from = openNow.current;
    campaigns.mine(id).then(
      (m) => {
        if (n !== asked.current) return;
        const a = backTarget(m.answers, from?.answer ?? null);
        if (a) open(a);
        else now.current.say(from ? "No answer of yours before this one." : "You have answered nothing here yet.");
      },
      (e: unknown) => n === asked.current && now.current.say(refusedWords(e)),
    );
  }, [id, open]);

  const finish = useCallback(() => {
    show(null);
    // a link's address named the answer; the reader's own address again, without a new page
    if (/[?&]amend=/u.test(location.hash)) history.replaceState(null, "", location.hash.replace(/\?.*$/u, ""));
  }, [show]);

  const leave = useCallback(() => {
    const a = openNow.current;
    if (a) now.current.say(`${now.current.words(a)} left as it was.`);
    finish();
  }, [finish]);

  const done = useCallback(
    (a: MyAnswer) => {
      if (openNow.current?.answer === a.answer) finish();
    },
    [finish],
  );

  return { amending, refusal, open, back, leave, done, listOpen, setListOpen };
}
