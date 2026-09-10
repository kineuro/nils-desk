// SPDX-License-Identifier: AGPL-3.0-only
// Review (Wave 5 section 6.2): review items and decisions, and the keyword
// tuner beside them when the assistant serves it. Overlays, rehearsals and
// identity rules join here as their doors land (B4).

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { Keyword } from "../ops/Keyword";
import { Review as ReviewTable } from "../ops/tables";
import { usePageContext } from "../Rail";
import { parse } from "../routes";
import { controls } from "../sections";

const TITLES: Record<string, string> = { review: "Items", keyword: "Keyword" };

export function Review({ caps }: { caps: Capabilities }) {
  const tabs = controls(caps, "review");
  const [tab, setTab] = useState<string>(() => (parse().kind === "section" ? (parse() as { tab: string | null }).tab : null) ?? tabs[0] ?? "review");
  useEffect(() => {
    const onHash = () => {
      const r = parse();
      if (r.kind === "section" && r.tab) setTab(r.tab);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const active = tabs.includes(tab) ? tab : tabs[0];
  usePageContext({ page: { kind: "review", id: null } });
  return (
    <section className="ops">
      <header className="ask-head">
        <div>
          <h1>Review</h1>
          <p className="meta">What a person decides: items the engine opened, and the rules that opened them.</p>
        </div>
      </header>
      {tabs.length > 1 && (
        <nav className="tabs">
          {tabs.map((t) => (
            <button key={t} type="button" className={t === active ? "on" : ""} onClick={() => { setTab(t); location.hash = `#review/${t}`; }}>
              {TITLES[t] ?? t}
            </button>
          ))}
        </nav>
      )}
      {active === "review" && <ReviewTable />}
      {active === "keyword" && <Keyword caps={caps} />}
    </section>
  );
}
