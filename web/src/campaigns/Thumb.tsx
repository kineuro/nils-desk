// SPDX-License-Identifier: AGPL-3.0-only
// A stack's small picture (record 50 R3), for the gallery and one's own
// answers. The engine draws it from the pyramid at the first look, and a
// first look can fail where a second one does not: a gallery asks for
// hundreds at once, and an engine whose database had restarted answered
// some of them 500 until a reload. A picture that fails is asked for again
// after a pause, twice, and one that still fails says so, with a button to
// ask once more, rather than leaving a blank where the stack should be. A
// picture the engine is still building (202) says "Preparing the picture"
// and is asked for again when the engine says; one it could not build (422)
// says so with the reason (Wave 7a).

import { useEffect, useRef, useState } from "react";
import { PictureFailed } from "../viewer/PictureWait";

/** The pauses before asking again, ms: one per retry. */
export const THUMB_RETRIES = [1500, 5000];

/** The picture's address for an attempt: the first as given, a retry marked so the browser asks the engine again. */
export function thumbAttempt(src: string, attempt: number): string {
  if (attempt === 0) return src;
  return `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}`;
}

/** What follows a failed attempt: the pause before the next, or null when the picture is given up on. */
export function afterFailure(attempt: number, pauses: readonly number[] = THUMB_RETRIES): number | null {
  return attempt < pauses.length ? pauses[attempt] : null;
}

/** Why a thumbnail did not draw, asked of the door itself: a picture being built (with when to ask again), one that could not be built, or neither. */
export async function thumbWhy(src: string, ask: typeof fetch = fetch): Promise<{ kind: "building"; after: number } | { kind: "failed"; reason: string } | { kind: "other" }> {
  try {
    const r = await ask(src, { headers: { "X-Nils-Desk": "1" } });
    if (r.status !== 202 && r.status !== 422) return { kind: "other" };
    const body = (await r.json().catch(() => ({}))) as { retry_after?: unknown; reason?: unknown };
    if (r.status === 422) return { kind: "failed", reason: typeof body.reason === "string" ? body.reason : "build_failed" };
    const header = Number(r.headers.get("Retry-After"));
    const after = typeof body.retry_after === "number" && body.retry_after > 0 ? body.retry_after : Number.isFinite(header) && header > 0 ? header : 2;
    return { kind: "building", after };
  } catch {
    return { kind: "other" };
  }
}

export function Thumb({ src, loading = "eager", draggable, pauses = THUMB_RETRIES, ask = fetch }: { src: string; loading?: "eager" | "lazy"; draggable?: boolean; pauses?: readonly number[]; ask?: typeof fetch }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"asking" | "waiting" | "building" | "failed">("asking");
  const [notBuilt, setNotBuilt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setAttempt(0);
    setState("asking");
    setNotBuilt(null);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [src]);
  const again = (ms: number, next: "waiting" | "building") => {
    setState(next);
    timer.current = setTimeout(() => {
      timer.current = null;
      setAttempt((a) => a + 1);
      setState("asking");
    }, ms);
  };
  const failed = () => {
    // a picture the engine is still building is asked for again when it says, however long that takes; one it could not build says so
    void thumbWhy(thumbAttempt(src, attempt), ask).then((why) => {
      if (why.kind === "building") return again(why.after * 1000, "building");
      if (why.kind === "failed") {
        setNotBuilt(why.reason);
        return setState("failed");
      }
      const pause = afterFailure(attempt, pauses);
      if (pause === null) return setState("failed");
      again(pause, "waiting");
    });
  };
  if (state === "failed" && notBuilt !== null) return <PictureFailed reason={notBuilt} small />;
  if (state === "failed")
    return (
      <span className="thumb-missing" role="img" aria-label="picture not ready">
        picture not ready
        <button
          type="button"
          className="button quiet small"
          onClick={(e) => {
            // the grid's cell takes a click as focus; this one asks again
            e.stopPropagation();
            setAttempt((a) => a + 1);
            setState("asking");
          }}
        >
          try again
        </button>
      </span>
    );
  if (state === "building") return <PreparingThumb />;
  if (state === "waiting") return <span className="thumb-missing thumb-waiting" aria-label="picture coming" />;
  return <img key={attempt} src={thumbAttempt(src, attempt)} alt="" loading={loading} decoding="async" draggable={draggable} onError={failed} />;
}

/** "Preparing the picture", small, in a thumbnail's place. */
function PreparingThumb() {
  return (
    <span className="picture-wait small" role="status">
      <span>Preparing the picture</span>
      <progress aria-label="preparing" />
    </span>
  );
}
