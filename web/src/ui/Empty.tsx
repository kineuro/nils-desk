// SPDX-License-Identifier: AGPL-3.0-only
// Zero rows is an answer with a way back, never an error (Wave 5 section 6.5).

export function Empty({ what, back }: { what: string; back?: { label: string; href: string } | null }) {
  return (
    <p className="empty">
      {what}
      {back && (
        <>
          {" "}
          <a href={back.href}>{back.label}</a>
        </>
      )}
    </p>
  );
}
