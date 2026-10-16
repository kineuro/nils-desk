// SPDX-License-Identifier: AGPL-3.0-only
// Expert options on the release form (gate T31, step 13.8): the release
// door's other flags, folded away under one line. Each field starts at the
// engine's own default and is sent only once changed; only the options this
// engine reads are drawn.

import { CATEGORIES, PLACEMENTS, expertCount, type Expert } from "./release";

export function ReleaseExpert({ expert, layout, offered, onChange }: { expert: Expert; layout: string; offered: readonly string[]; onChange: (e: Expert) => void }) {
  if (offered.length === 0) return null;
  const bids = layout === "bids";
  const set = (patch: Partial<Expert>) => onChange({ ...expert, ...patch });
  const may = (k: string) => offered.includes(k);
  const changed = expertCount(expert, layout, offered);
  const categories = expert.categories ?? [...CATEGORIES];
  return (
    <details className="more-fields release-expert">
      <summary>Expert options{changed > 0 ? ` · ${changed} changed` : ""}</summary>
      <div className="more-body">
        {bids && (
          <div className="fields2">
            {(["localizers", "synthetic", "dicom"] as const)
              .filter(may)
              .map((k) => (
                <label key={k} className="field">
                  <span className="label">{k === "dicom" ? "DICOM copies" : k === "localizers" ? "Localizers" : "Synthetic contrasts"}</span>
                  <span className="input">
                    <select value={expert[k] ?? PLACEMENTS[k][0][0]} onChange={(e) => set({ [k]: e.target.value })}>
                      {PLACEMENTS[k].map(([v, words]) => (
                        <option key={v} value={v}>
                          {words}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              ))}
          </div>
        )}
        {bids && may("converter") && (
          <label className="field">
            <span className="label">Converter</span>
            <span className="input mono">
              <input value={expert.converter ?? ""} placeholder="dcm2niix, as the engine finds it" onChange={(e) => set({ converter: e.target.value })} />
            </span>
          </label>
        )}
        {bids && may("compress") && (
          <label className="check-row">
            <input type="checkbox" checked={expert.compress === false} onChange={(e) => set({ compress: !e.target.checked })} />
            <span>Uncompressed NIfTI (.nii)</span>
          </label>
        )}
        {may("authors") && (
          <label className="field">
            <span className="label">Authors</span>
            <span className="input">
              <input value={expert.authors ?? ""} placeholder="whoever releases it" onChange={(e) => set({ authors: e.target.value })} />
            </span>
          </label>
        )}
        {may("categories") && (
          <div className="field" role="group" aria-label="Categories of element to remove">
            <span className="label">Remove</span>
            <span className="row wrap">
              {CATEGORIES.map((c) => (
                <label key={c} className="check-row">
                  <input
                    type="checkbox"
                    checked={categories.includes(c)}
                    onChange={(e) => set({ categories: e.target.checked ? [...categories, c] : categories.filter((x) => x !== c) })}
                  />
                  <span>{c}</span>
                </label>
              ))}
            </span>
          </div>
        )}
        {may("uid_root") && (
          <label className="field">
            <span className="label">UID root</span>
            <span className="input mono">
              <input value={expert.uid_root ?? ""} placeholder="DICOM's UUID arc" onChange={(e) => set({ uid_root: e.target.value })} />
            </span>
          </label>
        )}
        {may("roles") && (
          <label className="field">
            <span className="label">Only roles</span>
            <span className="input">
              <input value={expert.roles ?? ""} placeholder="every role" onChange={(e) => set({ roles: e.target.value })} />
            </span>
          </label>
        )}
        {may("picked") && (
          <label className="check-row">
            <input type="checkbox" checked={expert.picked === true} onChange={(e) => set({ picked: e.target.checked })} />
            <span>Only the picked scans</span>
          </label>
        )}
      </div>
    </details>
  );
}
