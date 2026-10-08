// SPDX-License-Identifier: AGPL-3.0-only
// A picture that is not there yet, in one quiet line: "Preparing the
// picture" with the build's progress while the engine builds it, or "This
// picture could not be built" with the reason in a few words. Never a grey
// box, never a command.

import { reasonWords, usePicture } from "./building";

export function PictureWait({ stack, small = false }: { stack: number; small?: boolean }) {
  const s = usePicture(stack);
  if (s?.kind === "failed") return <PictureFailed reason={s.reason} small={small} />;
  const fraction = s?.kind === "building" ? s.building.fraction : null;
  return (
    <span className={small ? "picture-wait small" : "picture-wait"} role="status">
      <span>Preparing the picture</span>
      {fraction !== null ? <progress max={1} value={fraction} aria-label="how far the picture is" /> : <progress aria-label="preparing" />}
    </span>
  );
}

export function PictureFailed({ reason, small = false }: { reason: string; small?: boolean }) {
  return (
    <span className={small ? "picture-failed small" : "picture-failed"} role="status">
      This picture could not be built: {reasonWords(reason)}
    </span>
  );
}
