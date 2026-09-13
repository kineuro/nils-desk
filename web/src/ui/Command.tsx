// SPDX-License-Identifier: AGPL-3.0-only
// The command a person would run by hand, beside the button that does the
// same (Wave 5 section 10.4), with a way to copy it.

import { useState } from "react";
import { Icon } from "./Icon";

export function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };
  return (
    <span className="chip command">
      <code>{text}</code>
      <button type="button" className="chip-copy" aria-label={copied ? "Copied" : `Copy ${text}`} onClick={copy}>
        <Icon name={copied ? "check" : "copy"} />
      </button>
    </span>
  );
}
