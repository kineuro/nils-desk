// SPDX-License-Identifier: AGPL-3.0-only
// The vocabulary record 27 rewrote the pages on: a fact as its value under a
// small label, and the sentence that used to stand in grey beside every value,
// closed until it is asked for. The Pseudonymisation page carries its own copy
// from slice R1; every page rewritten after it shares these.

import type React from "react";

/** A fact as its value: what it is in small letters, then the value alone. */
export interface Cell {
  k: string;
  v: string;
  title?: string;
}

export function Values({ cells }: { cells: Cell[] }) {
  return (
    <div className="values">
      {cells.map((c) => (
        <div key={c.k} title={c.title}>
          <span className="k">{c.k}</span>
          <span className="v">{c.v}</span>
        </div>
      ))}
    </div>
  );
}

/** The sentence that used to stand beside every value, closed until it is asked for. */
export function Says({ head, children }: { head: string; children: React.ReactNode }) {
  return (
    <details className="says">
      <summary>{head}</summary>
      <p>{children}</p>
    </details>
  );
}
