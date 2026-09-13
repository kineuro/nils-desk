// SPDX-License-Identifier: AGPL-3.0-only
// A section of the desk that is being built back: what it will do, and that
// the engine does it today from its command line.

import { Command } from "../ui/Command";
import { Icon } from "../ui/Icon";
import { PLACEHOLDERS } from "./placeholders";

export function PlaceholderPage({ id }: { id: string }) {
  const p = PLACEHOLDERS.find((x) => x.id === id);
  if (!p) return null;
  return (
    <section className="placeholder">
      <span className="placeholder-icon">
        <Icon name={p.icon} size="xl" />
      </span>
      <span className="eyebrow">Being built back</span>
      <h1>{p.title}</h1>
      <p className="lede">{p.words}</p>
      <p className="meta">This page comes back in a later release of the desk. The engine does all of it today, from its command line:</p>
      <Command text="nils --help" />
    </section>
  );
}
