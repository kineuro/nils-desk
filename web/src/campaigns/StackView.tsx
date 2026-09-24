// SPDX-License-Identifier: AGPL-3.0-only
// The picture of an item's stack, the one place the campaign pages take a
// picture from. Today it is the desk's viewer: one axial stack, the server's
// render for the other two planes. Wave 45 S2 brings MPR and the Tile; when
// it lands, the swap is here and nowhere else in campaigns/ (a Tile for a
// session board's candidates, the three planes for an axis question).

import { lazy, Suspense } from "react";
import { Wait } from "../ui/Wait";

const Viewer = lazy(() => import("../viewer/Viewer").then((m) => ({ default: m.Viewer })));

export function StackView({ stack, level = null }: { stack: number; level?: number | null }) {
  return (
    <div className="stack-view">
      <Suspense fallback={<Wait phase="loading the viewer" since={Date.now()} size="panel" />}>
        <Viewer key={stack} stack={stack} level={level} />
      </Suspense>
    </div>
  );
}
