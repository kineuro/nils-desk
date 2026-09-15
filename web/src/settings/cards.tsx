// SPDX-License-Identifier: AGPL-3.0-only
// What the Kvasir page's cards share (record 25): the square that marks where
// a model runs, the menu of a card's quieter acts, and the card of a model
// Kvasir holds on this machine's llama.cpp, a server of yours or a provider,
// with its check, its key and its removal for a person with Kvasir: Work.

import { useEffect, useRef } from "react";
import type React from "react";
import { Icon } from "../ui/Icon";
import { Health } from "./common";
import type { Mark } from "./gateway";
import type { ModelCard } from "./models";

/** Where a model runs, as a square beside its name. */
export function MarkSquare({ mark }: { mark: Mark }) {
  return (
    <span className={mark.tone === "neutral" ? "sq" : `sq ${mark.tone}`}>
      <Icon name={mark.icon} />
    </span>
  );
}

/** A card's quieter acts behind a button of three dots; an act, a click beside the menu or Escape closes it. */
export function MoreMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const menu = ref.current;
      if (!menu?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menu.contains(e.target as Node)) menu.open = false;
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details ref={ref} className="more-menu">
      <summary className="button quiet small" aria-label={label}>
        <Icon name="more" />
      </summary>
      <div
        className="more-list"
        onClick={() => {
          if (ref.current) ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}

/** A card's tags: a state with its dot, where prompts go without one. */
export function CardTags({ tags, aside }: { tags: { tone: "ok" | "caution" | "blocked" | "neutral" | "brand"; words: string; dot: boolean }[]; aside?: string | null }) {
  return (
    <div className="row">
      {tags.map((t) =>
        t.dot ? (
          <Health key={t.words} tone={t.tone} words={t.words} />
        ) : (
          <span key={t.words} className={t.tone === "neutral" ? "tag" : `tag ${t.tone}`}>
            {t.words}
          </span>
        ),
      )}
      {aside && <span className="meta">{aside}</span>}
    </div>
  );
}

/** A model Kvasir holds. `work` gives its backend's first model the check or the key, and the removal. */
export function BackendCard(props: { card: ModelCard; work: boolean; busy?: boolean; onCheck?: () => void; onKey?: () => void; onForget?: () => void; onRemove?: () => void }) {
  const { card: c, work, busy = false, onCheck, onKey, onForget, onRemove } = props;
  return (
    <div className="mcard">
      <div className="name">
        <MarkSquare mark={c.mark} />
        <span className="path" title={c.address ?? c.name}>
          {c.name}
        </span>
      </div>
      <span className="meta">{c.meta}</span>
      <CardTags tags={c.tags} aside={c.aside} />
      {c.detail && <span className="meta">{c.detail}</span>}
      {c.answers && <span className="meta">{c.answers}</span>}
      {work && c.first && (
        <div className="row">
          {c.kind === "provider" ? (
            <button type="button" className="button secondary small" disabled={busy} onClick={onKey}>
              {c.backend.credential === true ? "Replace key" : "Store its key"}
            </button>
          ) : (
            <button type="button" className="button secondary small" disabled={busy} onClick={onCheck}>
              Check
            </button>
          )}
          <MoreMenu label={`More for ${c.name}`}>
            {c.kind === "provider" && c.backend.credential === true && (
              <button type="button" disabled={busy} onClick={onForget}>
                Forget the key
              </button>
            )}
            <button type="button" disabled={busy} onClick={onRemove}>
              Remove
            </button>
          </MoreMenu>
        </div>
      )}
    </div>
  );
}
