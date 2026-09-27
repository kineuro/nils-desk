// SPDX-License-Identifier: AGPL-3.0-only
// The person's menu at the top right: their own page, signing in as someone
// else where an identity provider signs people in, and signing out. A
// disclosure: the name opens it, Escape or a click elsewhere closes it, and
// every item is reached by Tab.

import { useEffect, useRef, useState } from "react";
import { signInAsSomeoneElse, signOut } from "../signout";
import { Icon } from "./Icon";

export function PersonMenu({ who, initials, profile, current, choose }: { who: string; initials: string; profile: string; current: boolean; choose: string | null }) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const act = (p: () => Promise<void>) => {
    setBusy(true);
    setWhy(null);
    p().catch((e: Error) => {
      setWhy(e.message);
      setBusy(false);
    });
  };

  return (
    <div
      className="person-menu"
      ref={box}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          button.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (open && box.current && e.relatedTarget && !box.current.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button ref={button} type="button" className="person" aria-haspopup="true" aria-expanded={open} aria-controls="person-menu" title={who} onClick={() => setOpen((o) => !o)}>
        <span className="avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="person-name">{who}</span>
      </button>
      {open && (
        <div id="person-menu" className="person-pop" aria-label={`${who}: your account`}>
          <a ref={first} href={profile} aria-current={current ? "page" : undefined} onClick={() => setOpen(false)}>
            <Icon name="users" />
            Your profile
          </a>
          {choose && (
            <button type="button" disabled={busy} onClick={() => act(() => signInAsSomeoneElse(choose))}>
              <Icon name="restart" />
              Sign in as someone else
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => act(() => signOut())}>
            <Icon name="lock" />
            Sign out
          </button>
          {why && <p className="warn">{why}</p>}
        </div>
      )}
    </div>
  );
}
