// SPDX-License-Identifier: AGPL-3.0-only
// A dialog over the page: its head, what it asks, and its buttons at the
// foot. On a wide window it sits in the middle; on a phone it rises from the
// bottom as a sheet. The page behind is out of reach while it is open, and
// Escape, the close button or a click beside it closes it.

import { useEffect, useId, useRef } from "react";
import type React from "react";
import { Icon, type IconName } from "./Icon";

export function Dialog(props: { title: string; icon: IconName; onClose: () => void; children: React.ReactNode; foot: React.ReactNode }) {
  const { title, icon, onClose, children, foot } = props;
  const ref = useRef<HTMLDialogElement>(null);
  // a click beside the dialog lands on the dialog itself; a selection dragged out from inside does not close it
  const pressedBeside = useRef(false);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        // closed by the browser itself, not by the page: the page lets it go too
        if (ref.current && !ref.current.open) onClose();
      }}
      onMouseDown={(e) => {
        pressedBeside.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (pressedBeside.current && e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-head">
        <Icon name={icon} size="lg" />
        <h2 id={id}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
      <div className="dialog-foot">{foot}</div>
    </dialog>
  );
}
