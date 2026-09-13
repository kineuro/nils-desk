// SPDX-License-Identifier: AGPL-3.0-only
// A drawer over the page: its head, what it asks, and its buttons at the
// foot. The scrim and Escape close it.

import { useEffect } from "react";
import type React from "react";
import { Icon, type IconName } from "./Icon";

export function DrawerFrame(props: { title: string; icon: IconName; onClose: () => void; children: React.ReactNode; foot: React.ReactNode }) {
  const { title, icon, onClose, children, foot } = props;
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <Icon name={icon} size="lg" />
          <h2>{title}</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        <div className="drawer-foot">{foot}</div>
      </aside>
    </>
  );
}
