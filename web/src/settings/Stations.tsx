// SPDX-License-Identifier: AGPL-3.0-only
// Where each station goes, the first section of the Kvasir page (record 25):
// one line a station, its name and what it carries, an arrow, and the box of
// where it goes, with who allowed it beside. For a person with Kvasir: Work a
// station's box opens the drawer that moves it: at once where nothing more is
// needed, and with a written reason where rows of the archive would leave.

import { useState } from "react";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { MarkSquare } from "./cards";
import { Acted, useActing } from "./common";
import { destinationWords, goesToWords, plainly, stationOf, targets, type Destination, type Route } from "./gateway";
import { kvasir, type Backend, type PurposeRow } from "./kvasir";

function Box({ to }: { to: Destination }) {
  return (
    <>
      <MarkSquare mark={to.mark} />
      <b>{to.title}</b>
      {to.meta && <span className="meta">{to.meta}</span>}
      {to.where && <span className={to.where.tone === "neutral" ? "tag" : `tag ${to.where.tone}`}>{to.where.words}</span>}
    </>
  );
}

/** The stations' lines; `onChange` opens the drawer from a station's box, for a person who may move it. */
export function StationRoutes({ routes, onChange }: { routes: Route[]; onChange?: (p: PurposeRow) => void }) {
  return (
    <div className="panel routes">
      {routes.map((r) => (
        <div key={r.purpose.purpose} className="route">
          <div className="who">
            <span className="station">{r.station}</span>
            <span className="tag">{r.carries}</span>
          </div>
          <Icon name="arrow" />
          {onChange && r.movable ? (
            <button type="button" className="dest" onClick={() => onChange(r.purpose)}>
              <span className="sr-only">{`Change where ${r.station} goes, now `}</span>
              <Box to={r.to} />
              <span className="chev">
                <Icon name="chevron-down" />
              </span>
            </button>
          ) : (
            <div className="dest plain">
              <Box to={r.to} />
            </div>
          )}
          <span className="meta side" title={r.because ?? undefined}>
            {r.side ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Where a station goes, inside a sentence: a model's name as written, the subscription in lower case. */
function inSentence(b: Backend, system: boolean): string {
  const words = destinationWords(b, system);
  return b.builtin === true ? words.charAt(0).toLowerCase() + words.slice(1) : words;
}

/** A purpose moved to another backend: at once where nothing more is needed, with an admin's written reason where rows would leave. */
export function MoveDrawer(props: { purpose: PurposeRow; backends: Backend[]; system: boolean; now: Destination | null; toward?: string | null; onClose: () => void; onDone: () => void }) {
  const { purpose, backends, system, now, toward = null, onClose, onDone } = props;
  const options = targets(purpose, backends);
  // opened from a provider just added, the move starts on that provider
  const [to, setTo] = useState(options.find((o) => o.backend.id === toward)?.backend.id ?? options[0]?.backend.id ?? "");
  const [reason, setReason] = useState("");
  const moving = useActing();
  const chosen = options.find((o) => o.backend.id === to) ?? null;
  const needs = chosen?.needs === "an acknowledgement";
  const station = stationOf(purpose.purpose);

  const move = () =>
    moving.act(`moving ${station}`, async () => {
      try {
        await kvasir.setPolicy(purpose.purpose, to, needs ? reason.trim() : null);
      } catch (e) {
        throw plainly(e);
      }
      onDone();
      return `${station} goes to ${chosen ? inSentence(chosen.backend, system) : to} now.`;
    });

  const foot = (
    <>
      <Acted acting={moving.acting} />
      <div className="row actions">
        <button type="button" className="button" disabled={!chosen || (needs && reason.trim().length === 0) || moving.working} onClick={move}>
          Move {station}
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );

  return (
    <Dialog title={`Where ${station} goes`} icon="gateway" onClose={onClose} foot={foot}>
      <dl className="facts">
        <dt>purpose</dt>
        <dd>
          <span className="path">{purpose.purpose}</span>
        </dd>
        <dt>carries</dt>
        <dd>{purpose.content === "catalog" ? "the catalogue, never a row" : purpose.content === "rows" ? "rows of the archive" : "identifiers"}</dd>
        <dt>goes to now</dt>
        <dd>{now ? goesToWords(now) : "nowhere yet"}</dd>
      </dl>
      <div className="field">
        <span className="label">Move it to</span>
        <div className="choices" role="radiogroup">
          {options.map((o) => (
            <label key={o.backend.id} className="radio-row">
              <input type="radio" name="move-to" checked={to === o.backend.id} disabled={moving.working} onChange={() => setTo(o.backend.id)} />
              <span>
                <span>{destinationWords(o.backend, system)}</span>
                <span className="meta">{o.backend.locality === "local" ? "stays in your systems" : "leaves your systems"}</span>
              </span>
            </label>
          ))}
        </div>
        {chosen?.backend.builtin === true && !system && <span className="meta">Without a subscription, the default model answers.</span>}
      </div>
      {needs && (
        <div className="field">
          <label className="label" htmlFor="move-reason">
            Why rows of the archive may leave
          </label>
          <div className="input">
            <textarea id="move-reason" rows={3} value={reason} disabled={moving.working} onChange={(e) => setReason(e.target.value)} />
          </div>
          <span className="meta">Recorded with your name.</span>
        </div>
      )}
    </Dialog>
  );
}
