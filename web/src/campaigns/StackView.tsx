// SPDX-License-Identifier: AGPL-3.0-only
// The picture of an item's stack, the one place the campaign pages take a
// picture from: the desk's viewer with its three planes (record 45 S2). An
// axis question opens on the three planes, since a body part or an
// orientation is read across them; a stack over the planes' budget has the
// server's planes. A pick question's session draws its candidates as the
// session board's tiles instead (review/SessionBoard.tsx). The reader keeps
// the view a person chose (record 48, the second real read): each new stack
// opens on it, told back through `onView`.

import { lazy, Suspense } from "react";
import { Wait } from "../ui/Wait";

const Viewer = lazy(() => import("../viewer/Viewer").then((m) => ({ default: m.Viewer })));

export function StackView({ stack, level = null, view = "stack", onView }: { stack: number; level?: number | null; view?: "stack" | "planes"; onView?: (v: "stack" | "planes") => void }) {
  return (
    <div className="stack-view">
      <Suspense fallback={<Wait phase="loading the viewer" since={Date.now()} size="panel" />}>
        <Viewer key={stack} stack={stack} level={level} view={view} onView={onView} />
      </Suspense>
    </div>
  );
}
