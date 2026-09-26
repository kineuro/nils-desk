// SPDX-License-Identifier: AGPL-3.0-only
// The gallery (record 50 R3): a hundred items of a campaign that asks one
// axis, each a small picture of its stack (its own plane and the two across
// it) with the value suggested for it, who suggested it and how sure. The
// person looks down the grid, corrects the wrong ones with a number key or
// the item's picker, and accepts the page in one move. Each item is still
// its own answer, by the person; the engine keeps the suggestion and its
// author beside it. The least certain come first, and a group the
// suggester read wrong is set in one move. Stacks of a sealed sample and
// the share the campaign holds back never show here: they are read alone.
// Keys: 1 to 9 and 0 set the focused item, the arrows move, Backspace puts
// the suggestion back, `o` changes the order, Ctrl+Enter accepts the page.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Capabilities } from "../capabilities";
import { href } from "../routes";
import { Icon } from "../ui/Icon";
import { campaigns, refused as refusedWords, type Campaign } from "./client";
import {
  acceptBody,
  acceptedWords,
  changed,
  choose,
  chooseAll,
  gallery,
  galleryOffered,
  groups,
  initial,
  keyAct,
  keyOfValue,
  moved,
  ORDERS,
  PAGE,
  pageWords,
  percent,
  prefetch,
  reorder,
  reset,
  singleAxis,
  tally,
  tone,
  topClasses,
  type GalleryItem,
  type GalleryOrder,
  type GalleryState,
} from "./gallery";

const ORDER_KEY = "nils.gallery.order";
function remembered(): GalleryOrder {
  try {
    const v = localStorage.getItem(ORDER_KEY);
    return v === "suggested" || v === "position" ? v : "uncertain";
  } catch {
    return "uncertain";
  }
}
function remember(v: GalleryOrder): void {
  try {
    localStorage.setItem(ORDER_KEY, v);
  } catch {
    // a private window keeps nothing; the page works the same
  }
}

export function Gallery({ caps, id }: { caps: Capabilities; id: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [s, setS] = useState<GalleryState | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const order = useRef<GalleryOrder>(remembered());

  const load = useCallback(() => {
    return gallery.page(id, order.current).then(
      (p) => {
        setS(initial({ ...p, order: order.current }));
        // the pictures of the page after this one load now, so it draws at once
        prefetch(p.items.slice(PAGE));
      },
      (e: unknown) => setFailed(refusedWords(e)),
    );
  }, [id]);

  useEffect(() => {
    campaigns.one(id).then(setCampaign, (e: unknown) => setFailed(refusedWords(e)));
    void load();
  }, [id, load]);

  const accept = useCallback(() => {
    if (!s || busy) return;
    const body = acceptBody(s);
    if (body.answers.length === 0) {
      setSaid("Nothing to accept: no item on the page has a value.");
      return;
    }
    setBusy(true);
    gallery
      .accept(id, body)
      .then((a) => {
        setDone((d) => d + a.accepted.length);
        setSaid(acceptedWords(a));
        return load();
      })
      .catch((e: unknown) => setSaid(refusedWords(e)))
      .finally(() => setBusy(false));
  }, [s, busy, id, load]);

  const setOrder = useCallback((o: GalleryOrder) => {
    order.current = o;
    remember(o);
    setS((x) => (x ? reorder(x, o) : x));
  }, []);

  const grid = useRef<HTMLDivElement | null>(null);
  const keyed = useRef({ s, accept, setOrder });
  keyed.current = { s, accept, setOrder };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keyed.current;
      if (!k.s) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t.tagName === "SELECT" && e.key !== "Enter"))) return;
      if (e.altKey || e.metaKey || (e.ctrlKey && e.key !== "Enter")) return;
      const act = keyAct(e.key, k.s.page.values, { ctrl: e.ctrlKey, columns: columnsOf(grid.current) });
      if (act.kind === "none") return;
      e.preventDefault();
      if (act.kind === "accept") k.accept();
      else if (act.kind === "order") k.setOrder(nextOrder(k.s.order));
      else
        setS((x) => {
          if (!x) return x;
          if (act.kind === "move") return moved(x, act.by);
          if (x.focus === null) return x;
          return act.kind === "set" ? choose(x, x.focus, act.value) : reset(x, x.focus);
        });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // the focused item stays in view as the keys move it
  useEffect(() => {
    if (!s || s.focus === null) return;
    const el = grid.current?.querySelector<HTMLElement>(`[data-item="${s.focus}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [s?.focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const offered = campaign ? galleryOffered(caps, campaign.question) : true;
  return (
    <GalleryBody
      campaign={campaign}
      state={s}
      failed={failed ?? (campaign && !offered ? `Campaign ${campaign.name} asks more than one axis, or this engine has no gallery; read it one by one.` : null)}
      said={said}
      busy={busy}
      done={done}
      grid={grid}
      onChoose={(item, v) => setS((x) => (x ? (v === null ? reset(x, item) : choose(x, item, v)) : x))}
      onChooseAll={(from, to) => setS((x) => (x ? chooseAll(x, from, to) : x))}
      onFocus={(item) => setS((x) => (x ? { ...x, focus: item } : x))}
      onOrder={setOrder}
      onAccept={accept}
    />
  );
}

const nextOrder = (o: GalleryOrder): GalleryOrder => ORDERS[(ORDERS.findIndex((x) => x.order === o) + 1) % ORDERS.length].order;

/** How many cells a row of the grid holds now, for the up and down keys. */
function columnsOf(el: HTMLElement | null): number {
  const cells = el ? [...el.querySelectorAll<HTMLElement>(".g-cell")] : [];
  if (cells.length < 2) return 1;
  const top = cells[0].offsetTop;
  const n = cells.findIndex((c) => c.offsetTop !== top);
  return n > 0 ? n : cells.length;
}

export interface GalleryBodyProps {
  campaign: Campaign | null;
  state: GalleryState | null;
  failed: string | null;
  said: string | null;
  busy: boolean;
  done: number;
  grid?: React.RefObject<HTMLDivElement | null>;
  onChoose: (item: number, value: string | null) => void;
  onChooseAll: (from: string | null, to: string) => void;
  onFocus: (item: number) => void;
  onOrder: (o: GalleryOrder) => void;
  onAccept: () => void;
}

/** The gallery as it draws from its state. */
export function GalleryBody(p: GalleryBodyProps) {
  const s = p.state;
  const axis = singleAxis(p.campaign?.question) ?? s?.page.axis ?? "";
  const t = useMemo(() => (s ? tally(s) : null), [s]);
  const values = s?.page.values ?? [];
  return (
    <section className="gallery-page" aria-label="gallery">
      <div className="gallery-head">
        <span className="eyebrow">
          <a href={href("campaigns")}>Campaigns</a>
          {p.campaign && (
            <>
              {" · "}
              <a href={href("campaigns", String(p.campaign.id))}>{p.campaign.name}</a>
            </>
          )}
        </span>
        <h1>Gallery{axis ? ` · ${axis}` : ""}</h1>
        {s && <span className="meta g-count">{pageWords(s.page, s.page.items.length)}</span>}
        <span className="grow" />
        {p.done > 0 && <span className="meta">{p.done} accepted here</span>}
        {p.campaign && (
          <a className="button quiet small" href={href("campaigns", String(p.campaign.id), "rate")}>
            One by one
          </a>
        )}
      </div>
      {p.failed && (
        <p className="meta said">
          <Icon name="info" />
          {p.failed}
        </p>
      )}
      {s && (
        <div className="gallery-bar">
          <label className="g-order">
            <span className="meta">Order</span>
            <select value={s.order} onChange={(e) => p.onOrder(e.target.value as GalleryOrder)} aria-label="order">
              {ORDERS.map((o) => (
                <option key={o.order} value={o.order}>
                  {o.words}
                </option>
              ))}
            </select>
            <kbd>o</kbd>
          </label>
          <span className="g-keys meta" aria-label="keys">
            {values.map((v) => {
              const k = keyOfValue(values, v);
              return k ? (
                <span key={v} className="g-key">
                  <kbd>{k}</kbd>
                  {v}
                </span>
              ) : null;
            })}
          </span>
          <span className="grow" />
          {t && (
            <span className="g-tally" role="status" aria-live="polite">
              <b>{t.set - t.changed}</b> as suggested · <b>{t.changed}</b> corrected{t.unset > 0 ? <> · <b>{t.unset}</b> without a value, left for later</> : null}
            </span>
          )}
          <button type="button" className="button" disabled={p.busy || !t || t.set === 0} onClick={p.onAccept}>
            Accept all as shown{t ? ` (${t.set})` : ""} <kbd>Ctrl+Enter</kbd>
          </button>
        </div>
      )}
      {p.said && <p className="meta said g-said">{p.said}</p>}
      {!s && !p.failed && <p className="meta">Reading the gallery…</p>}
      {s && s.page.items.length === 0 && <p className="meta">Nothing is left to check here. Held-back and sealed items are read one by one.</p>}
      {s && s.page.items.length > 0 && (
        <div className="gallery-grid" ref={p.grid} data-gallery-grid="">
          {groups(s).map((g) => (
            <div key={g.value ?? "none"} className="g-group" style={{ display: "contents" }}>
              {s.order === "suggested" && (
                <div className="g-group-head">
                  <span className="tag">{g.value ?? "no suggestion"}</span> <span className="meta">{g.items.length}</span>
                  <select value="" onChange={(e) => e.target.value && p.onChooseAll(g.value, e.target.value)} aria-label={`set every ${g.value ?? "unsuggested"} item`}>
                    <option value="">all of these are…</option>
                    {values.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {g.items.map((i) => (
                <Cell key={i.item} item={i} value={s.chosen[i.item] ?? null} changed={changed(s, i)} focused={s.focus === i.item} values={values} onChoose={p.onChoose} onFocus={p.onFocus} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function titleOf(i: GalleryItem): string {
  const lines = [`stack ${i.stack}`];
  if (i.suggested) lines.push(`suggested ${i.suggested} by ${i.by ?? "?"}${i.confidence !== null ? ` at ${percent(i.confidence)}` : ""}`);
  for (const c of topClasses(i.confidences, 10)) lines.push(`  ${c.value} ${percent(c.p)}`);
  for (const o of i.others) lines.push(`${o.by} said ${o.value ?? "nothing"}${o.confidence !== null ? ` at ${percent(o.confidence)}` : ""}`);
  return lines.join("\n");
}

function Cell({ item: i, value, changed: ch, focused, values, onChoose, onFocus }: { item: GalleryItem; value: string | null; changed: boolean; focused: boolean; values: string[]; onChoose: (item: number, v: string | null) => void; onFocus: (item: number) => void }) {
  const top = topClasses(i.confidences, 2);
  const cls = ["g-cell", `g-${tone(i)}`, ch ? "changed" : "", focused ? "focused" : ""].filter(Boolean).join(" ");
  return (
    <div className={cls} data-item={i.item} aria-current={focused ? "true" : undefined} aria-label={`stack ${i.stack}: ${value ?? "no value"}${ch ? `, corrected from ${i.suggested ?? "none"}` : ""}`} title={titleOf(i)} onClick={() => onFocus(i.item)}>
      <div className="g-pic">
        <img src={i.thumb} alt="" loading="eager" decoding="async" draggable={false} onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
      </div>
      <div className="g-line">
        <select className="g-pick" value={value ?? ""} aria-label={`value of stack ${i.stack}`} onChange={(e) => {
            onChoose(i.item, e.target.value || null);
            // the keys act on the grid again once a value is picked
            e.target.blur();
          }}
          onFocus={() => onFocus(i.item)}>
          {value === null && <option value="">pick a value</option>}
          {values.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span className="g-conf" aria-label="confidence">
          {i.disagree ? <span className="tag caution">differ</span> : percent(i.confidence)}
        </span>
      </div>
      <div className="g-by">
        {ch ? (
          <span className="g-was">
            was <s>{i.suggested ?? "none"}</s>
          </span>
        ) : (
          <span>{i.by ?? "no suggestion"}</span>
        )}
        {top.length > 1 && (
          <span className="g-top">
            {top.map((c) => `${c.value} ${Math.round(c.p * 100)}`).join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}
