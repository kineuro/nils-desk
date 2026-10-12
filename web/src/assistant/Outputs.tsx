// SPDX-License-Identifier: AGPL-3.0-only
// What a turn wrote under the analysis workspace's /out (one chat): each chart
// as an image in the thread, drawn from a data URL so that nothing the
// model's code wrote runs in the page, its title under it and a way to save
// it; each file as one line with its size, its rows and a download. They come
// after the turn's words and before any card that waits for the person.

import { memo } from "react";
import { Icon } from "../ui/Icon";
import { saveBase64, saveText } from "./download";
import type { ChartItem, FileItem } from "./events";

/** A chart as an image's source: an <img> draws an SVG and runs nothing in it. */
export function chartSrc(c: ChartItem): string {
  return c.encoding === "base64" ? `data:${c.media};base64,${c.data}` : `data:${c.media};charset=utf-8,${encodeURIComponent(c.data)}`;
}

/** A size in plain units: 512 bytes, 1.2 kB, 34 kB, 1.5 MB. */
export function sizeWords(bytes: number): string {
  const n = Math.round(bytes);
  if (n < 1000) return `${n} ${n === 1 ? "byte" : "bytes"}`;
  const units = ["kB", "MB", "GB"];
  let v = n / 1000;
  let u = 0;
  while (v >= 999.5 && u < units.length - 1) {
    v /= 1000;
    u += 1;
  }
  return `${v.toLocaleString("en-US", { maximumFractionDigits: v < 9.95 ? 1 : 0 })} ${units[u]}`;
}

/** A file in a few words: its size, and its rows where it counts them. */
export function fileWords(f: FileItem): string {
  return f.rows === null ? sizeWords(f.bytes) : `${sizeWords(f.bytes)} · ${f.rows.toLocaleString("en-US")} ${f.rows === 1 ? "row" : "rows"}`;
}

const saveChart = (c: ChartItem) => (c.encoding === "base64" ? saveBase64(c.name, c.data, c.media) : saveText(c.name, c.data, c.media));

/** A turn's charts and files, drawn again only when the turn writes its lists again, not on every word of the answer. */
export const TurnOutputs = memo(function TurnOutputs({ charts = [], files = [] }: { charts?: ChartItem[]; files?: FileItem[] }) {
  if (charts.length === 0 && files.length === 0) return null;
  return (
    <div className="turn-outputs">
      {charts.map((c, i) => (
        <figure key={`c${i}:${c.name}`} className="out-chart">
          <img src={chartSrc(c)} alt={c.title} />
          <figcaption className="out-chart-foot">
            <span className="grow">{c.title}</span>
            <button type="button" className="icon-button" aria-label={`Save ${c.name}`} title={`Save ${c.name}`} onClick={() => saveChart(c)}>
              <Icon name="download" />
            </button>
          </figcaption>
        </figure>
      ))}
      {files.map((f, i) => (
        <div key={`f${i}:${f.name}`} className="out-file">
          <Icon name="file" />
          <span className="path out-file-name">{f.name}</span>
          <span className="meta num">{fileWords(f)}</span>
          <button type="button" className="button secondary small" aria-label={`Download ${f.name}`} onClick={() => saveText(f.name, f.data, f.media)}>
            <Icon name="download" />
            Download
          </button>
        </div>
      ))}
    </div>
  );
});
