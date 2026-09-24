// SPDX-License-Identifier: AGPL-3.0-only
// What the section's pages share: the tabs and the bar of items by state.

import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { mayAny } from "../grants";
import { href } from "../routes";
import { itemTotal, progress, type Counts } from "./client";

const n = (v: number) => v.toLocaleString("en-US");

/** The tabs of the section: the campaigns, and the label sets where the person may read them. */
export function Tabs({ caps, on }: { caps: Capabilities; on: "campaigns" | "label-sets" }) {
  const sets = served(caps, "GET /api/label-sets") && mayAny(caps, "campaigns:see", "review:see");
  return (
    <div className="chips pages">
      <a className={on === "campaigns" ? "opt on" : "opt"} href={href("campaigns")} aria-current={on === "campaigns" ? "page" : undefined}>
        Campaigns
      </a>
      {sets && (
        <a className={on === "label-sets" ? "opt on" : "opt"} href={href("campaigns", "label-sets")} aria-current={on === "label-sets" ? "page" : undefined}>
          Label sets
        </a>
      )}
    </div>
  );
}

/** The items by state as one bar, with the total. */
export function StateBar({ counts }: { counts: Counts }) {
  const parts = progress(counts);
  const total = itemTotal(counts);
  return (
    <span className="state-bar" title={parts.map((p) => `${p.words} ${n(p.n)}`).join(" · ")}>
      <span className="state-track" aria-hidden="true">
        {parts.map((p) => (
          <i key={p.state} className={`s-${p.tone || "open"}`} style={{ width: `${(p.share * 100).toFixed(1)}%` }} />
        ))}
      </span>
      <span className="meta nowrap">
        {parts
          .filter((p) => p.state !== "open")
          .map((p) => `${n(p.n)} ${p.words}`)
          .join(" · ") || "none settled"}{" "}
        of {n(total)}
      </span>
    </span>
  );
}
