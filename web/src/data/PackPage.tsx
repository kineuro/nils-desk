// SPDX-License-Identifier: AGPL-3.0-only
// A pack's page (Wave 5 section 8.1): its version, contract and modality,
// its axes, rule sets and passes, and the cases it ships.

import { useEffect, useState } from "react";
import type { Json } from "../ask/client";
import { data } from "../ops/client";
import { usePageContext } from "../Rail";
import { classify, Failure, type Failed } from "../ui/Failure";
import { Wait } from "../ui/Wait";

export function PackPage({ name }: { name: string }) {
  const [pack, setPack] = useState<Json | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [since] = useState(() => Date.now());
  useEffect(() => {
    data
      .pack(name)
      .then((p) => setPack(p))
      .catch((e: unknown) => setFailed(classify(e)));
  }, [name]);
  usePageContext({ page: { kind: "pack", id: name }, pack: pack ? { name: String(pack.pack ?? name), version: String(pack.version ?? "") } : undefined });
  if (failed) return <Failure failed={failed} />;
  if (!pack) return <Wait phase="reading the pack" since={since} size="panel" />;
  const list = (k: string): unknown[] => (Array.isArray(pack[k]) ? (pack[k] as unknown[]) : []);
  const nameOf = (x: unknown): string => (typeof x === "string" ? x : x && typeof x === "object" && "name" in (x as Json) ? String((x as Json).name) : JSON.stringify(x));
  return (
    <div className="pack">
      <dl className="facts">
        <dt>version</dt>
        <dd>{String(pack.version ?? "")}</dd>
        <dt>contract</dt>
        <dd>{String(pack.contract ?? "")}</dd>
        <dt>modality</dt>
        <dd>{String(pack.modality ?? "")}</dd>
        <dt>cases</dt>
        <dd>{String(pack.cases ?? "")}</dd>
      </dl>
      <h3>Axes</h3>
      <ul className="chips">
        {list("axes").map((a, i) => (
          <li key={i}>
            <span className="chip">{nameOf(a)}</span>
          </li>
        ))}
      </ul>
      <h3>Rule sets</h3>
      <ul className="chips">
        {list("rule_sets").map((r, i) => (
          <li key={i}>
            <span className="chip">{nameOf(r)}</span>
          </li>
        ))}
      </ul>
      <h3>Passes</h3>
      <ul className="chips">
        {list("passes").map((p, i) => (
          <li key={i}>
            <span className="chip">{nameOf(p)}</span>
          </li>
        ))}
      </ul>
      <details>
        <summary>The pack as the engine loaded it</summary>
        <pre>{JSON.stringify(pack, null, 2)}</pre>
      </details>
    </div>
  );
}
