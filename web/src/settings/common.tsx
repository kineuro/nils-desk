// SPDX-License-Identifier: AGPL-3.0-only
// What every Settings page shares: its head, a part's health, the words of a
// door's refusal, and work that goes on apart from the call, followed until
// it ends.

import { useState } from "react";
import type React from "react";
import { DoorError } from "../ask/client";
import { href } from "../routes";
import { Wait } from "../ui/Wait";
import { followRun, type Run } from "./supervise";

export function messageOf(e: unknown): string {
  if (e instanceof DoorError) {
    const body = (e.body ?? {}) as { error?: unknown };
    return typeof body.error === "string" ? body.error : `the door answered ${e.status}`;
  }
  return e instanceof Error ? e.message : String(e);
}

export type Acting = { kind: "idle" } | { kind: "working"; phase: string; since: number } | { kind: "done"; words: string } | { kind: "failed"; why: string };

/** Work that goes on apart from the call: what it is doing, how it ended. */
export function useActing() {
  const [acting, setActing] = useState<Acting>({ kind: "idle" });
  /** Run `work`, saying `phase` while it runs and its words once it ends. */
  const act = (phase: string, work: () => Promise<string>) => {
    setActing({ kind: "working", phase, since: Date.now() });
    work()
      .then((words) => setActing({ kind: "done", words }))
      .catch((e: unknown) => setActing({ kind: "failed", why: messageOf(e) }));
  };
  return { acting, act, working: acting.kind === "working" };
}

/** Work the supervisor goes on with apart from the call, followed until it ends. */
export function useRun() {
  const { acting, act, working } = useActing();
  const start = (phase: string, begin: () => Promise<Run>, done: (r: Run) => string) =>
    act(phase, async () => {
      const run = await begin();
      const ended = await followRun(run.id, () => undefined);
      if (ended === null) throw new Error("It is still going; look again in a moment.");
      if (ended.state !== "done") throw new Error(ended.tail?.slice(-1)[0] ?? `it ${ended.state}`);
      return done(ended);
    });
  return { acting, start, working };
}

export function Acted({ acting }: { acting: Acting }) {
  if (acting.kind === "working") return <Wait phase={acting.phase} since={acting.since} />;
  if (acting.kind === "done") return <p className="ok-words">{acting.words}</p>;
  if (acting.kind === "failed") return <p className="warn">{acting.why}</p>;
  return null;
}

export function Head({ title, lede, under, children }: { title: string; lede: string; under?: boolean; children?: React.ReactNode }) {
  return (
    <div className="settings-head">
      {under && (
        <a className="meta" href={href("settings", "parts")}>
          Parts / {title}
        </a>
      )}
      <div className="row">
        <h1>{title}</h1>
        {children}
      </div>
      <p className="lede">{lede}</p>
    </div>
  );
}

export function Health({ tone, words }: { tone: "ok" | "caution" | "blocked" | "neutral"; words: string }) {
  const tag = tone === "neutral" ? "tag" : `tag ${tone}`;
  return (
    <span className={tag}>
      <span className={tone === "neutral" ? "dot" : `dot ${tone}`} />
      {words}
    </span>
  );
}
