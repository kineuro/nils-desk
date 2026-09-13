// SPDX-License-Identifier: AGPL-3.0-only
// The side, one panel (Wave 5 section 6.2): the sections at its top and
// Settings kept at its foot. The open section unfolds its pages under it.
// Settings, once opened, rises to sit under the last section with its pages
// below it, and goes back down when another section opens. On a narrow window
// the side is a panel over the page, opened from the top bar.

import { useEffect } from "react";
import { href } from "./routes";
import type { Section } from "./sections";
import { Icon } from "./ui/Icon";

export function Side(props: { top: Section[]; foot: Section[]; section: string | null; page: string | null; open: boolean; onClose: () => void }) {
  const { top, foot, section, page, open, onClose } = props;
  const risen = foot.some((s) => s.id === section);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);

  return (
    <>
      {open && <div className="scrim side-scrim" onClick={onClose} />}
      <nav id="side" className={["side", risen ? "risen" : null, open ? "open" : null].filter(Boolean).join(" ")} aria-label="sections">
        {top.map((s) => (
          <Group key={s.id} section={s} on={s.id === section} page={page} />
        ))}
        <div className="side-gap" />
        {foot.length > 0 && (
          <div className="side-foot">
            {foot.map((s) => (
              <Group key={s.id} section={s} on={s.id === section} page={page} />
            ))}
          </div>
        )}
      </nav>
    </>
  );
}

/** A section's link, and its pages folded under it until it opens. */
function Group({ section, on, page }: { section: Section; on: boolean; page: string | null }) {
  const pages = section.pages ?? [];
  // an address that names no page of the section opens its first
  const current = on && pages.length > 0 ? (pages.find((p) => p.id === page) ?? pages[0]) : null;
  const link = ["side-link", on ? (pages.length > 0 ? "open" : "on") : null].filter(Boolean).join(" ");
  return (
    <div className={on ? "side-group on" : "side-group"}>
      <a className={link} href={href(section.id)} aria-current={on && pages.length === 0 ? "page" : undefined}>
        <Icon name={section.icon} />
        <span className="grow">{section.title}</span>
        {pages.length > 0 && (
          <span className="side-chevron">
            <Icon name="chevron-down" />
          </span>
        )}
      </a>
      {pages.length > 0 && (
        <div className="side-pages" inert={!on}>
          <div>
            {pages.map((p) => (
              <a
                key={p.id}
                className={[p.depth === 2 ? "deep" : null, p.id === current?.id ? "on" : null].filter(Boolean).join(" ") || undefined}
                href={href(section.id, p.id)}
                aria-current={p.id === current?.id ? "page" : undefined}
              >
                {p.title}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
