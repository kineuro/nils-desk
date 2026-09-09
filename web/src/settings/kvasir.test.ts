// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { type Backend, opening, type PurposeRow } from "./kvasir";

const local: Backend = { id: "sglang", kind: "openai", locality: "local", provider: null, credential: null, models: ["qwen"], health: {} };
const remote: Backend = { id: "minimax", kind: "anthropic", locality: "remote", provider: "minimax", credential: true, models: ["m"], health: {} };
const row = (content: PurposeRow["content"]): PurposeRow => ({ purpose: `a.${content}`, app: "a", content, kind: "background", backend: "sglang", locality: "local", default: true, acknowledged: null, may_open_remote: "" });

describe("the models table", () => {
  it("opens a catalog purpose to a remote backend, a rows purpose only with an acknowledgement, an identifiers purpose never", () => {
    expect(opening(row("catalog"), remote)).toBe("yes");
    expect(opening(row("rows"), remote)).toBe("acknowledge");
    expect(opening(row("identifiers"), remote)).toBe("never");
    expect(opening(row("identifiers"), local)).toBe("yes");
  });
});
