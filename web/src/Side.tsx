// SPDX-License-Identifier: AGPL-3.0-only
// The side, one panel (Wave 5 section 6.2, as the 2026-10-09 design draws it):
// the sections at its top and Settings kept at its foot. Every section but
// Home has pages and opens as Settings does: its pages unfold under it, and
// every section after it goes down to the foot to make the room, one section
// open at a time. Settings, once opened, rises to sit under the last section
// with its pages below it. The open section is the one the address names; its
// row folds it and unfolds it again in place, and another section's row opens
// that section's first page. The sections stay one list, so a section going
// down or coming up slides there rather than jumps. On a narrow window the
// side is a panel over the page, opened from the top bar, where a section's
// row unfolds it without leaving the page, so one of its pages can be chosen.

import { useEffect, useLayoutEffect, useState } from "react";
import type React from "react";
import { href } from "./routes";
import { pageAt, pageHref, sideLayout, type Section, type SidePage } from "./sections";
import { Icon } from "./ui/Icon";

export function Side(props: { top: Section[]; foot: Section[]; section: string | null; page: string | null; open: boolean; onClose: () => void }) {
  const { top, foot, section, page, open, onClose } = props;
  // a section folded or unfolded by its row, kept while the address stays where it was
  const here = `${section ?? ""}/${page ?? ""}`;
  const [picked, setPicked] = useState<{ at: string; open: string | null } | null>(null);
  const unfolded = picked !== null && picked.at === here ? picked.open : section;
  const { up, down } = sideLayout(top, foot, unfolded);

  // the panel over the page opens on the section the address names: a section
  // picked in it is let go as it opens or closes, before anything is drawn
  useLayoutEffect(() => {
    setPicked(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);

  const row = (s: Section) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if ((s.pages ?? []).length === 0 || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (s.id === unfolded) {
      e.preventDefault();
      setPicked({ at: here, open: null });
    } else if (s.id === section || open) {
      e.preventDefault();
      setPicked({ at: here, open: s.id });
    }
    // any other section's address opens it, and the side follows the address
  };

  return (
    <>
      {open && <div className="scrim side-scrim" onClick={onClose} />}
      <nav id="side" className={open ? "side open" : "side"} aria-label="sections">
        {[...up, ...down].map((s, i) => (
          <Group key={s.id} section={s} unfolded={s.id === unfolded} here={s.id === section} page={page} cut={down.length > 0 && i === up.length - 1} down={i >= up.length} onRow={row(s)} />
        ))}
      </nav>
    </>
  );
}

/**
 * A section's row, and its pages folded under it until it opens. `cut` takes
 * the free height under it, so the sections after it sit at the foot; `down`
 * is one of those, the first under a line.
 */
function Group(props: { section: Section; unfolded: boolean; here: boolean; page: string | null; cut: boolean; down: boolean; onRow: (e: React.MouseEvent<HTMLAnchorElement>) => void }) {
  const { section, unfolded, here, page, cut, down, onRow } = props;
  const pages = section.pages ?? [];
  const folds = pages.length > 0;
  // a page is marked only in the section the address names
  const current = unfolded && here ? pageAt(section, page) : null;
  const group = ["side-group", folds && unfolded ? "on" : null, cut ? "cut" : null, down ? "down" : null].filter(Boolean).join(" ");
  const link = ["side-link", folds ? (unfolded ? "open" : null) : here ? "on" : null].filter(Boolean).join(" ");
  return (
    <div className={group}>
      <a className={link} href={href(section.id)} aria-current={!folds && here ? "page" : undefined} aria-expanded={folds ? unfolded : undefined} onClick={onRow}>
        <Icon name={section.icon} />
        <span className="grow">{section.title}</span>
        {folds && (
          <span className="side-chevron">
            <Icon name="chevron-down" />
          </span>
        )}
      </a>
      {folds && (
        <div className="side-pages" inert={!unfolded}>
          <div>
            {pages.map((p) => (
              <PageLink key={`${p.kind ?? "page"} ${p.id}`} section={section} page={p} on={p === current} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** One page under an open section: a page, the brand line that starts something new, the small word over the recent threads, or one of them on its guide line. */
function PageLink({ section, page: p, on }: { section: Section; page: SidePage; on: boolean }) {
  if (p.kind === "label") return <span className="side-label">{p.title}</span>;
  const cls = [p.kind === "new" || p.kind === "thread" ? p.kind : null, p.depth === 2 ? "deep" : null, on ? "on" : null].filter(Boolean).join(" ");
  return (
    <a className={cls || undefined} href={pageHref(section, p)} aria-current={on ? "page" : undefined} title={p.kind === "thread" ? p.title : undefined}>
      {p.kind === "new" && <Icon name="plus" />}
      {p.title}
    </a>
  );
}
