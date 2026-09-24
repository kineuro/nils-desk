// SPDX-License-Identifier: AGPL-3.0-only
// What the Kvasir page's cards share (record 25): the square that marks where
// a model runs, a card's one tag with its detail as a hover title, how many
// stations it answers with their names as a hover title, the menu of a card's
// quieter acts, and the card of a model Kvasir holds on this machine's
// llama.cpp, a server of yours or a provider: its name, where it runs, its tag
// and its stations, with its check, its key and its removal along the bottom
// for a person with Kvasir: Work. A model server (record 47) is one card
// listing its models, each loaded or cold with its admission and stations,
// and each removable on its own.

import { useEffect, useRef } from "react";
import type React from "react";
import { Icon } from "../ui/Icon";
import type { Mark } from "./gateway";
import type { ModelCard, ServerCard } from "./models";

/** Where a model runs, as a square. */
export function MarkSquare({ mark }: { mark: Mark }) {
  return (
    <span className={mark.tone === "neutral" ? "sq" : `sq ${mark.tone}`}>
      <Icon name={mark.icon} />
    </span>
  );
}

/** Where a model runs, in a few words beside its square, with the rest of what is known of it as a hover title. */
export function Where({ mark, words, title }: { mark: Mark; words: string; title?: string | null }) {
  return (
    <div className="where">
      <MarkSquare mark={mark} />
      <span className="meta" title={title ?? undefined}>
        {words}
      </span>
    </div>
  );
}

/** A card's one tag: a state with its dot, where prompts go without one, and its detail as a hover title. */
export function StateTag({ tag }: { tag: { tone: "ok" | "caution" | "blocked" | "neutral" | "brand"; words: string; dot: boolean; title: string | null } }) {
  const tone = tag.tone === "neutral" ? "" : ` ${tag.tone}`;
  return (
    <span className={`tag${tone}`} title={tag.title ?? undefined}>
      {tag.dot && <span className={`dot${tone}`} />}
      {tag.words}
    </span>
  );
}

/** How many stations a model answers, with their names as a hover title. */
export function Answers({ answers }: { answers: { words: string; title: string | null } }) {
  return (
    <span className="meta" title={answers.title ?? undefined}>
      {answers.words}
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

/** A model Kvasir holds. `work` gives its backend's first model the check or the key, and the removal. */
export function BackendCard(props: { card: ModelCard; work: boolean; busy?: boolean; onCheck?: () => void; onKey?: () => void; onForget?: () => void; onRemove?: () => void }) {
  const { card: c, work, busy = false, onCheck, onKey, onForget, onRemove } = props;
  return (
    <div className="mcard">
      <span className="card-name path" title={c.name}>
        {c.name}
      </span>
      <Where mark={c.mark} words={c.where} title={c.facts} />
      <div className="row">
        <StateTag tag={c.tag} />
        {c.answers && <Answers answers={c.answers} />}
      </div>
      {work && c.first && (
        <div className="row acts">
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

/** Record 47: a model server Kvasir holds, one card listing its models. `work` gives each model its removal, and the server its check, key, more models and removal. */
export function ModelServerCard(props: {
  card: ServerCard;
  work: boolean;
  busy?: boolean;
  onCheck?: () => void;
  onMore?: () => void;
  onKey?: () => void;
  onRemoveModel?: (model: string) => void;
  onRemove?: () => void;
}) {
  const { card: c, work, busy = false, onCheck, onMore, onKey, onRemoveModel, onRemove } = props;
  return (
    <div className="mcard wide">
      <span className="card-name path" title={c.name}>
        {c.name}
      </span>
      <Where mark={c.mark} words={c.where} title={c.facts} />
      <ul className="closed-list">
        {c.models.map((m) => (
          <li key={m.id}>
            <span>
              <span className="path" title={m.aliases.length > 0 ? `also ${m.aliases.join(", ")}` : undefined}>
                {m.id}
              </span>{" "}
              {m.status && <span className={m.status.tone === "neutral" ? "tag" : `tag ${m.status.tone}`}>{m.status.words}</span>} <StateTag tag={m.tag} /> {m.answers && <Answers answers={m.answers} />}
            </span>
            {work && (
              <button type="button" className="button quiet small" aria-label={`Remove ${m.id}`} disabled={busy} onClick={() => onRemoveModel?.(m.id)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {work && (
        <div className="row acts">
          <button type="button" className="button secondary small" disabled={busy} onClick={onCheck}>
            Check
          </button>
          <button type="button" className="button secondary small" disabled={busy} onClick={onMore}>
            More models
          </button>
          <MoreMenu label={`More for ${c.name}`}>
            <button type="button" disabled={busy} onClick={onKey}>
              Replace key
            </button>
            <button type="button" disabled={busy} onClick={onRemove}>
              Remove server
            </button>
          </MoreMenu>
        </div>
      )}
    </div>
  );
}
