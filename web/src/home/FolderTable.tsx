// SPDX-License-Identifier: AGPL-3.0-only
// The folders a look found inside a folder, each ticked to become a batch of
// its own, with what it looks like and the rules that would read it. Home's
// step and the Places drawer both show it.

import type { FolderRow } from "./look";

export function FolderTable(props: { rows: FolderRow[]; ticked: Set<string>; onToggle: (name: string) => void; disabled: boolean; ticks?: boolean }) {
  const { rows, ticked, onToggle, disabled, ticks = true } = props;
  return (
    <div className="table-wrap">
      <table className="thin">
        <thead>
          <tr>
            {ticks && (
              <th className="tick">
                <span className="sr-only">Digest</span>
              </th>
            )}
            <th>Folder</th>
            <th className="num">Files</th>
            <th>Looks like</th>
            <th>Rules</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name || "."}>
              {ticks && (
                <td className="tick">
                  <input type="checkbox" checked={r.dicom && ticked.has(r.name)} disabled={!r.dicom || disabled} onChange={() => onToggle(r.name)} aria-label={`Digest ${r.name || "the folder itself"}`} />
                </td>
              )}
              <td>
                <span className="path">{r.name || "the folder itself"}</span>
              </td>
              <td className="num">
                {r.files.toLocaleString("en-GB")}
                {r.capped ? "+" : ""}
              </td>
              <td className={r.dicom ? undefined : "meta"}>{r.looksLike}</td>
              <td>
                {r.rules.kind === "pack" && <span className="chip">{r.rules.text}</span>}
                {r.rules.kind === "digest-only" && <span className="tag caution">{r.rules.text}</span>}
                {r.rules.kind === "none" && <span className="meta">{r.rules.text}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
