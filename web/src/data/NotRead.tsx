// SPDX-License-Identifier: AGPL-3.0-only
// A dataset that is not read yet, as a page other than Data shows it (Wave
// 7a): the word, the engine's reason behind a "?", and the way to the Data
// page, where its card has the button for its next step.

import { href } from "../routes";
import { Hint } from "../ui/Hint";
import { NOT_READ } from "./layout";

export function NotRead({ name, why }: { name: string; why: string }) {
  return (
    <div className="row not-read" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <span className="tag caution">{NOT_READ}</span>
      <Hint text={why} />
      <a className="button secondary small" aria-label={`Open ${name} in Data`} href={href("data", "datasets", name)}>
        Open in Data
      </a>
    </div>
  );
}
