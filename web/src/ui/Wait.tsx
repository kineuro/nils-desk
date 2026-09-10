// SPDX-License-Identifier: AGPL-3.0-only
// One wait component in three sizes (Wave 5 section 6.5), re-timed for a
// station whose turn takes twenty seconds: the phase name, an elapsed count
// from the first second, "usually about N seconds" at the measured median,
// "longer than usual" past the ninetieth percentile, and the tab's title
// changed for an engine run so a person on another system sees it finish.

import { useEffect, useState } from "react";

export interface WaitProps {
  /** What is happening, as a phase: "running the question", "reading the chain". */
  phase: string;
  /** When it started, in ms since the epoch; the count runs from the first second. */
  since: number;
  /** The measured median and ninetieth percentile, in seconds, when the part reports them. */
  median?: number | null;
  p90?: number | null;
  size?: "line" | "panel" | "page";
  /** When set, the tab's title carries the phase while this waits, and comes back after. */
  title?: boolean;
}

export function elapsedWords(seconds: number, median?: number | null, p90?: number | null): string {
  if (seconds < 1) return "";
  const parts: string[] = [`${seconds} s`];
  if (p90 && seconds > p90) parts.push("longer than usual");
  else if (median && median >= 1) parts.push(`usually about ${Math.round(median)} s`);
  return parts.join(", ");
}

export function Wait({ phase, since, median, p90, size = "line", title = false }: WaitProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!title) return;
    const before = document.title;
    document.title = `${phase}: NILS`;
    return () => {
      document.title = before;
    };
  }, [title, phase]);
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  const words = elapsedWords(seconds, median, p90);
  const Tag = size === "page" ? "section" : size === "panel" ? "div" : "span";
  return (
    <Tag className={`wait wait-${size}`} role="status" aria-live="polite">
      <span className="wait-phase">{phase}</span>
      {words && <span className="wait-count">{words}</span>}
    </Tag>
  );
}
