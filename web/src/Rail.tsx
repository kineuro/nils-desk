// SPDX-License-Identifier: AGPL-3.0-only
// The rail (Wave 5 section 6.4): the right-hand third of every page is the
// assistant's conversation, present when the assistant is and the person
// holds assist, absent otherwise without a gap. It knows which object is
// under it through the typed context each page contributes (section 9.2).

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type React from "react";
import { Pane } from "./assistant/Pane";
import type { Capabilities } from "./capabilities";
import { holds } from "./sections";
import { admit, type PageContext } from "./ui/context";

interface RailState {
  context: PageContext;
  contribute: (c: PageContext | null) => void;
}

const Ctx = createContext<RailState>({ context: { page: { kind: "home", id: null } }, contribute: () => undefined });

/** Whether the rail renders for this document and person. */
export function railPresent(caps: Capabilities): boolean {
  return caps.assistant !== null && holds(caps, "assist");
}

export function RailProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<PageContext>({ page: { kind: "home", id: null } });
  const value = useMemo<RailState>(
    () => ({
      context,
      contribute: (c) => setContext(admit(c ?? { page: { kind: "home", id: null } })),
    }),
    [context],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** A page declares what it contributes; the allowlist admits it. Cleared when the page goes. */
export function usePageContext(c: PageContext | null): void {
  const { contribute } = useContext(Ctx);
  const key = JSON.stringify(c);
  useEffect(() => {
    contribute(c);
    return () => contribute(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the serialised context is the dependency
  }, [key, contribute]);
}

export function useRailContext(): PageContext {
  return useContext(Ctx).context;
}

/** What the rail says it is looking at: identifiers only. */
export function aboutWords(c: PageContext): string {
  if (c.document_id !== undefined) return `on question ${c.document_id}${c.epoch !== undefined ? `, epoch ${c.epoch}` : ""}`;
  if (c.handle_id !== undefined) return `on result ${c.handle_id}`;
  if (c.job_ids && c.job_ids.length === 1) return `on job ${c.job_ids[0]}`;
  if (c.page.id) return `on ${c.page.kind} ${c.page.id}`;
  return `on ${c.page.kind}`;
}

export function Rail({ caps }: { caps: Capabilities }) {
  const c = useRailContext();
  const docId = c.document_id ?? null;
  const chain = c.chain ?? [];
  const epoch = c.epoch ?? caps.engine?.registry.epoch ?? 0;
  return (
    <aside className="rail" aria-label="assistant">
      <p className="meta rail-about">{aboutWords(c)}</p>
      <Pane key={docId ?? "none"} caps={caps} docId={docId} chain={chain} epoch={epoch} onOpen={(id) => { location.hash = `#ask/${id}`; }} />
    </aside>
  );
}
