// SPDX-License-Identifier: AGPL-3.0-only
// The volume path's question to the browser (the reader's lag, after
// record 48): how large a 3D texture WebGL2 takes is asked once per page,
// since making a context to ask and losing it again held every stack's
// first picture back.

import { afterEach, describe, expect, it, vi } from "vitest";
import { max3dTexture } from "./volume";

afterEach(() => vi.unstubAllGlobals());

describe("the largest 3D texture", () => {
  it("is asked of a WebGL2 context once per page", () => {
    let contexts = 0;
    const gl = { MAX_3D_TEXTURE_SIZE: 0x8073, getParameter: () => 2048, getExtension: () => ({ loseContext: () => undefined }) };
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => (contexts++, gl) }) });
    expect(max3dTexture()).toBe(2048);
    expect(max3dTexture()).toBe(2048);
    expect(max3dTexture()).toBe(2048);
    expect(contexts).toBe(1);
  });
});
