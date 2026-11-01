// SPDX-License-Identifier: AGPL-3.0-only
// The stack page's Header fold: the header facts the rules read, from
// `GET /api/stacks/{stack}/header`, as tables of name and value. A stack of a
// sealed sample shows one line; an engine without the door shows nothing.

import { useEffect, useState } from "react";
import type { StackHeader } from "./client";
import { review } from "./client";

type Facts = Record<string, string | number | null> | undefined;

const shown = (v: string | number | null): string => (v === null || v === "" ? "none" : typeof v === "number" ? v.toLocaleString("en-US") : v);
const label = (k: string) => k.replace(/_/g, " ");

function FactTable({ title, facts }: { title: string; facts: Facts }) {
  const rows = Object.entries(facts ?? {});
  if (rows.length === 0) return null;
  return (
    <div className="table-wrap">
      <table className="thin">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Name</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>{label(k)}</td>
              <td>{shown(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The header facts as tables; the sealed line alone for a sealed stack. */
export function HeaderTables({ header }: { header: StackHeader }) {
  if (header.blind && header.sealed) return <p className="meta">Sealed: the header is not shown</p>;
  const withheld = header.private_withheld ?? 0;
  return (
    <>
      {typeof header.files === "number" && <p className="meta">{header.files.toLocaleString("en-US")} files</p>}
      <FactTable title="Fingerprint" facts={header.fingerprint} />
      <FactTable title="Text" facts={header.texts} />
      <FactTable title="Physics" facts={header.physics} />
      <FactTable title="Private elements" facts={header.private} />
      {withheld > 0 && <p className="meta">{withheld.toLocaleString("en-US")} private elements withheld</p>}
    </>
  );
}

/** Reads the header and shows it under a fold; nothing where the engine has no such door. */
export function HeaderFold({ stack }: { stack: number }) {
  const [header, setHeader] = useState<StackHeader | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setHeader(null);
    setWhy(null);
    review
      .header(stack)
      .then((h) => alive && setHeader(h))
      .catch((e: Error) => alive && setWhy(e.message));
    return () => {
      alive = false;
    };
  }, [stack]);
  if (why) return <p className="warn">Header: {why}</p>;
  if (!header) return null;
  return (
    <details className="header-facts">
      <summary>Header</summary>
      <HeaderTables header={header} />
    </details>
  );
}
