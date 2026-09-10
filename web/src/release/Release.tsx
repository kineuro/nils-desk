// SPDX-License-Identifier: AGPL-3.0-only
// Release (Wave 5 section 6.2): releases, handovers and custody.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { Custody, Handovers, Releases } from "../ops/tables";
import { usePageContext } from "../Rail";
import { parse } from "../routes";
import { controls } from "../sections";

const TITLES: Record<string, string> = { releases: "Releases", handovers: "Handovers", custody: "Custody" };

export function Release({ caps }: { caps: Capabilities }) {
  const tabs = controls(caps, "release");
  const [tab, setTab] = useState<string>(() => {
    const r = parse();
    return (r.kind === "section" ? r.tab : null) ?? tabs[0] ?? "releases";
  });
  useEffect(() => {
    const onHash = () => {
      const r = parse();
      if (r.kind === "section" && r.tab) setTab(r.tab);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const active = tabs.includes(tab) ? tab : tabs[0];
  usePageContext({ page: { kind: "release", id: null } });
  return (
    <section className="ops">
      <header className="ask-head">
        <div>
          <h1>Release</h1>
          <p className="meta">What leaves: a release names exactly what goes and who authored each edit.</p>
        </div>
      </header>
      {tabs.length > 1 && (
        <nav className="tabs">
          {tabs.map((t) => (
            <button key={t} type="button" className={t === active ? "on" : ""} onClick={() => { setTab(t); location.hash = `#release/${t}`; }}>
              {TITLES[t] ?? t}
            </button>
          ))}
        </nav>
      )}
      {active === "releases" && <Releases caps={caps} />}
      {active === "handovers" && <Handovers />}
      {active === "custody" && <Custody />}
    </section>
  );
}
