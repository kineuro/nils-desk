// SPDX-License-Identifier: AGPL-3.0-only
// A dataset's proposed rule fixes in one line on its detail (record 56,
// section 5.3: "a dataset's detail shows what its read found ('3 proposed
// rule fixes from this read')"), from the dataset summary's count of the
// proposals that touch it, with the way to them on the Rules page. The line
// takes the caution colour as a bar while one waits for a person.

import { href, narrow } from "../routes";
import "./rules.css";

const n = (v: number) => v.toLocaleString("en-US");

export interface FixCounts {
  proposed: number;
  adopted: number;
  rejected: number;
}

/** The line's words: how many wait, or that none does. */
export function fixesWords(c: FixCounts): string {
  if (c.proposed === 0) return "No rule fix proposed from this read";
  return `${n(c.proposed)} proposed rule ${c.proposed === 1 ? "fix" : "fixes"} from this read`;
}

export function RuleFixesLine({ dataset, counts, link }: { dataset: string; counts: FixCounts; link: boolean }) {
  const waiting = counts.proposed > 0;
  return (
    <div className={waiting ? "fixes-line waiting" : "fixes-line"} aria-label="Proposed rule fixes">
      <span>{fixesWords(counts)}</span>
      {counts.adopted > 0 && <span className="meta">{n(counts.adopted)} adopted</span>}
      {link && (
        <a className="button quiet small" href={narrow(href("review", "rules", waiting ? "proposals" : "quality"), { dataset })}>
          {waiting ? "Review them" : "Rules"}
        </a>
      )}
    </div>
  );
}
