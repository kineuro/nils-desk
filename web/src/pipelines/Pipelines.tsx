// SPDX-License-Identifier: AGPL-3.0-only
// Pipelines (Wave 5 section 6.2): jobs live where they are queued. The
// batches' stage strip joins here in B4.

import type { Capabilities } from "../capabilities";
import { Jobs } from "../ops/tables";
import { usePageContext } from "../Rail";

export function Pipelines({ caps }: { caps: Capabilities }) {
  usePageContext({ page: { kind: "pipelines", id: null } });
  return (
    <section className="ops">
      <header className="ask-head">
        <div>
          <h1>Pipelines</h1>
          <p className="meta">Every job with its clock, live from the events door when a stream is free.</p>
        </div>
      </header>
      <Jobs caps={caps} />
    </section>
  );
}
