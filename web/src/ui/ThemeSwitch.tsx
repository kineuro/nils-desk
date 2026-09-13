// SPDX-License-Identifier: AGPL-3.0-only
// The theme switch in the top bar: one button that goes round the system,
// dark and light, drawn as the website draws it.

import { useState } from "react";
import { Icon } from "./Icon";
import { applyTheme, nextTheme, readTheme, THEME_WORDS, type ThemeChoice } from "./theme";

export function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readTheme());
  return (
    <button
      type="button"
      className="icon-button theme-switch"
      title={THEME_WORDS[choice]}
      aria-label={THEME_WORDS[choice]}
      onClick={() => {
        const next = nextTheme(choice);
        applyTheme(next);
        setChoice(next);
      }}
    >
      <Icon name={choice === "system" ? "contrast" : choice === "dark" ? "moon" : "sun"} />
    </button>
  );
}
