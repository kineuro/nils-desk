// SPDX-License-Identifier: AGPL-3.0-only
// A stack's small picture (record 50 R3), for the gallery and one's own
// answers. The engine draws it from the pyramid at the first look, and a
// first look can fail where a second one does not: a gallery asks for
// hundreds at once, and an engine whose database had restarted answered
// some of them 500 until a reload. A picture that fails is asked for again
// after a pause, twice, and one that still fails says so, with a button to
// ask once more, rather than leaving a blank where the stack should be.

import { useEffect, useRef, useState } from "react";

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

export function Thumb({ src, loading = "eager", draggable, pauses = THUMB_RETRIES }: { src: string; loading?: "eager" | "lazy"; draggable?: boolean; pauses?: readonly number[] }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"asking" | "waiting" | "failed">("asking");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setAttempt(0);
    setState("asking");
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [src]);
  const failed = () => {
    const pause = afterFailure(attempt, pauses);
    if (pause === null) {
      setState("failed");
      return;
    }
    setState("waiting");
    timer.current = setTimeout(() => {
      timer.current = null;
      setAttempt((a) => a + 1);
      setState("asking");
    }, pause);
  };
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
  if (state === "waiting") return <span className="thumb-missing thumb-waiting" aria-label="picture coming" />;
  return <img key={attempt} src={thumbAttempt(src, attempt)} alt="" loading={loading} decoding="async" draggable={draggable} onError={failed} />;
}
