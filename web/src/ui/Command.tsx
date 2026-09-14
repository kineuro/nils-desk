// SPDX-License-Identifier: AGPL-3.0-only
// The command a person would run by hand, beside the button that does the
// same (Wave 5 section 10.4), with a way to copy it.

import { useCopy } from "./clipboard";
import { Icon } from "./Icon";

export function Command({ text }: { text: string }) {
  const [state, copy] = useCopy();
  return (
    <span className="chip command">
      <code>{text}</code>
      <button type="button" className="chip-copy" aria-label={state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : `Copy ${text}`} onClick={() => copy(text)}>
        <Icon name={state === "copied" ? "check" : state === "failed" ? "alert" : "copy"} />
      </button>
    </span>
  );
}
