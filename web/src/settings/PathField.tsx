// SPDX-License-Identifier: AGPL-3.0-only
// A folder's path, typed or chosen by clicking through the folders of the
// machine the supervisor runs on. The browser opens under the field: where
// one may start, the folders inside the one open with the disk each is on,
// and a disk /etc/fstab names that is not mounted. A click opens a folder;
// the button at the foot takes the folder that is open.

import { useState } from "react";
import type React from "react";
import { Icon } from "../ui/Icon";
import { Wait } from "../ui/Wait";
import { messageOf } from "./common";
import { crumbs, entryNote, filesWords, folders, inside, listingNote, mountWords, plainPath, rootWords, type Listing, type Root, type Unmounted } from "./folders";

type View =
  | { kind: "closed" }
  | { kind: "start"; roots: Root[] | null; why: string | null; since: number }
  | { kind: "folder"; path: string; listing: Listing | null; why: string | null; since: number; unmounted: Unmounted | null; missing: string | null };

export interface Known {
  path: string;
  label: string;
}

export function PathField(props: {
  id?: string;
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Whether the supervisor answers this person, so the folders can be browsed. */
  browse: boolean;
  /** Folders the desk already knows, offered at the start: the places, the install's directory. */
  known?: Known[];
  label?: string;
  onEnter?: () => void;
}) {
  const { id, value, onChange, placeholder, disabled, browse, known = [], label, onEnter } = props;
  const [view, setView] = useState<View>({ kind: "closed" });
  const [hidden, setHidden] = useState(false);

  const start = () => {
    setView({ kind: "start", roots: null, why: null, since: Date.now() });
    folders
      .roots()
      .then((r) => setView((v) => (v.kind === "start" ? { ...v, roots: r.roots } : v)))
      .catch((e: unknown) => setView((v) => (v.kind === "start" ? { ...v, why: messageOf(e) } : v)));
  };

  // a folder that is not there opens the nearest one above it that is
  const go = (path: string, unmounted: Unmounted | null = null, missing: string | null = null) => {
    setView({ kind: "folder", path, listing: null, why: null, since: Date.now(), unmounted, missing });
    folders
      .list(path)
      .then((l) => {
        if (l.exists === false && l.parent) return go(l.parent, null, missing ?? path);
        setView((v) => (v.kind === "folder" && v.path === path ? { ...v, listing: l } : v));
      })
      .catch((e: unknown) => setView((v) => (v.kind === "folder" && v.path === path ? { ...v, why: messageOf(e) } : v)));
  };

  const toggle = () => {
    if (view.kind !== "closed") return setView({ kind: "closed" });
    const typed = plainPath(value);
    if (typed) go(typed);
    else start();
  };

  const close = () => setView({ kind: "closed" });
  const escape = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    // the folders close, not the dialog they may be in
    e.preventDefault();
    e.stopPropagation();
    close();
  };

  return (
    <div className="path-field">
      <div className="input mono path-input">
        <input
          id={id}
          value={value}
          placeholder={placeholder}
          spellCheck={false}
          disabled={disabled}
          aria-label={id ? undefined : label}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter?.();
          }}
        />
        {browse && (
          <button
            type="button"
            className="icon-button"
            title={view.kind === "closed" ? "Choose a folder" : "Close the folders"}
            aria-label={view.kind === "closed" ? "Choose a folder" : "Close the folders"}
            aria-expanded={view.kind !== "closed"}
            disabled={disabled}
            onClick={toggle}
          >
            <Icon name="folder-search" />
          </button>
        )}
      </div>
      {view.kind === "start" && (
        <div className="browser" role="group" aria-label="Choose a folder" onKeyDown={escape}>
          <div className="browser-head">
            <span className="browser-title">Start from</span>
            <button type="button" className="icon-button" aria-label="Close the folders" onClick={close}>
              <Icon name="x" />
            </button>
          </div>
          <div className="browser-list">
            {known.map((k) => (
              <button key={`known ${k.path}`} type="button" className="browser-row" onClick={() => go(k.path)}>
                <Icon name="folder" />
                <span className="browser-name">{k.path}</span>
                <span className="meta">{k.label}</span>
                <Icon name="chevron-right" />
              </button>
            ))}
            {view.roots === null && !view.why && <Wait phase="reading the disks" since={view.since} />}
            {view.why && <p className="warn">{view.why}</p>}
            {(view.roots ?? []).map((r) => (
              <button key={`${r.kind} ${r.path}`} type="button" className={r.kind === "fstab" ? "browser-row caution" : "browser-row"} onClick={() => go(r.path, r.unmounted)}>
                <Icon name={r.kind === "fstab" ? "alert" : r.kind === "home" ? "home" : "disk"} />
                <span className="browser-name">{r.path}</span>
                <span className="meta">{rootWords(r)}</span>
                <Icon name="chevron-right" />
              </button>
            ))}
          </div>
        </div>
      )}
      {view.kind === "folder" && <Folder view={view} hidden={hidden} onHidden={setHidden} onGo={go} onStart={start} onClose={close} onEscape={escape} onUse={(p) => (onChange(p), close())} />}
    </div>
  );
}

function Folder(props: {
  view: Extract<View, { kind: "folder" }>;
  hidden: boolean;
  onHidden: (show: boolean) => void;
  onGo: (path: string, unmounted?: Unmounted | null) => void;
  onStart: () => void;
  onClose: () => void;
  onEscape: (e: React.KeyboardEvent) => void;
  onUse: (path: string) => void;
}) {
  const { view, hidden, onHidden, onGo, onStart, onClose, onEscape, onUse } = props;
  const { path, listing } = view;
  const note = listing ? listingNote(listing, view.unmounted) : null;
  const all = listing?.folders ?? [];
  const hiddenCount = all.filter((f) => f.hidden).length;
  const shown = hidden ? all : all.filter((f) => !f.hidden);
  const files = listing ? filesWords(listing) : null;
  const trail = crumbs(path);
  const usable = listing !== null && listing.exists !== false && listing.directory !== false;
  return (
    <div className="browser" role="group" aria-label="Choose a folder" onKeyDown={onEscape}>
      <div className="browser-head">
        <button type="button" className="icon-button" title="Up one folder" aria-label="Up one folder" disabled={path === "/"} onClick={() => onGo(trail[trail.length - 2]?.path ?? "/")}>
          <Icon name="arrow-up" />
        </button>
        <nav className="crumbs" aria-label="the folders above this one">
          <button type="button" className="crumb" title="Where one may start" onClick={onStart}>
            start
          </button>
          {trail.map((c, i) => (
            <span key={c.path} className="crumb-step">
              <span className="crumb-sep" aria-hidden="true">
                <Icon name="chevron-right" />
              </span>
              {i === trail.length - 1 ? (
                <span className="crumb" aria-current="location">
                  {c.name}
                </span>
              ) : (
                <button type="button" className="crumb" onClick={() => onGo(c.path)}>
                  {c.name}
                </button>
              )}
            </span>
          ))}
        </nav>
        <button type="button" className="icon-button" aria-label="Close the folders" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      {listing?.mount && (
        <p className="browser-disk">
          <Icon name="disk" />
          <span>{mountWords(listing.mount)}</span>
        </p>
      )}
      {view.missing && <p className="browser-note caution">{view.missing} is not there; this is the nearest folder above it that is.</p>}
      {note && <p className={`browser-note ${note.tone}`}>{note.words}</p>}
      <div className="browser-list">
        {listing === null && !view.why && <Wait phase="reading the folder" since={view.since} />}
        {view.why && <p className="warn">{view.why}</p>}
        {listing?.timed_out && (
          <button type="button" className="button quiet small" onClick={() => onGo(path, view.unmounted)}>
            Try again
          </button>
        )}
        {shown.map((e) => {
          const n = entryNote(e);
          const opens = e.readable || e.unmounted !== null;
          return (
            <button key={e.name} type="button" className={n ? `browser-row ${n.tone}` : "browser-row"} disabled={!opens} onClick={() => onGo(inside(path, e.name), e.unmounted)}>
              <Icon name={e.unmounted ? "alert" : !e.readable ? "lock" : e.mount ? "disk" : "folder"} />
              <span className="browser-name">{e.name}</span>
              {e.link && <span className="browser-tag">link</span>}
              {n && <span className={`browser-tag ${n.tone}`}>{n.words}</span>}
              {opens && <Icon name="chevron-right" />}
            </button>
          );
        })}
        {hiddenCount > 0 && (
          <button type="button" className="button quiet small browser-hidden" onClick={() => onHidden(!hidden)}>
            {hidden ? "Leave out" : "Show"} {hiddenCount === 1 ? "the hidden folder" : `${hiddenCount} hidden folders`}
          </button>
        )}
        {files && <p className="meta browser-files">{files}</p>}
        {listing?.partial && all.length >= 500 && <p className="meta browser-files">Only the first 500 folders are listed; type the rest of the path.</p>}
      </div>
      <div className="browser-foot">
        <span className="path browser-path">{path}</span>
        <button type="button" className="button small" disabled={!usable} onClick={() => onUse(path)}>
          Use this folder
        </button>
      </div>
    </div>
  );
}
