// SPDX-License-Identifier: AGPL-3.0-only
// Copying words for a person (the chat, slice 8): the clipboard where the
// browser offers it, and the older selection copy on a desk served over plain
// HTTP, where the browser keeps the clipboard away. A copy that fails says so.

import { useCallback, useEffect, useRef, useState } from "react";

/** Copies text, and says whether it was copied. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // the selection copy below may still work
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

export type CopyState = "idle" | "copied" | "failed";

/** A copy button's state: copied or failed for a moment after a copy, then idle again. */
export function useCopy(): [CopyState, (text: string) => void] {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback((text: string) => {
    void copyText(text).then((copied) => {
      setState(copied ? "copied" : "failed");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 1800);
    });
  }, []);
  return [state, copy];
}
