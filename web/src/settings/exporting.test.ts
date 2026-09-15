// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import { exportWords } from "./exporting";

describe("who may export a table, in words", () => {
  it("names the page a grant opens, and never the grant", () => {
    expect(exportWords("query:work")).toBe("whoever may work on the Query page");
    expect(exportWords("query:see")).toBe("whoever may see the Query page");
    expect(exportWords("kvasir:see")).toBe("whoever may see the Kvasir page");
    expect(exportWords("install:work")).toBe("whoever may work on the install");
  });
  it("names a ladder name's group, the assistant, and nobody when off", () => {
    expect(exportWords("reader")).toBe("whoever holds all that the Readers group gives");
    expect(exportWords("assist")).toBe("whoever may use the assistant");
    expect(exportWords("assistant:use")).toBe("whoever may use the assistant");
    expect(exportWords("off")).toBe("nobody");
  });
});
