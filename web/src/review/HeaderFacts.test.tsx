// SPDX-License-Identifier: AGPL-3.0-only
// The stack page's Header fold against a fake engine: the tables, the sealed
// line, and an engine without the door.

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { review, type StackHeader } from "./client";
import { HeaderTables } from "./HeaderFacts";

const full: StackHeader = {
  stack: 48112,
  detail: "plain",
  files: 34,
  fingerprint: { echo_time: 90, image_type: "ORIGINAL\\PRIMARY", manufacturer: "SIEMENS" },
  texts: { series_description: "t2_tse_tra", protocol_name: "brain" },
  physics: { repetition_time: 4500 },
  private: { csa_series_header: "present" },
  private_withheld: 3,
};

const engine = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", async (url: string) => {
    expect(url).toBe("/api/stacks/48112/header");
    return new Response(JSON.stringify(body), { status });
  });

afterEach(() => vi.unstubAllGlobals());

describe("the header facts", () => {
  it("read from the fake engine and drawn as tables of name and value, with the withheld count in one line", async () => {
    engine(200, full);
    const header = await review.header(48112);
    expect(header).toEqual(full);
    const html = renderToStaticMarkup(<HeaderTables header={header as StackHeader} />);
    expect(html).toContain("<caption>Fingerprint</caption>");
    expect(html).toContain("<td>echo time</td><td>90</td>");
    expect(html).toContain("<td>image type</td><td>ORIGINAL\\PRIMARY</td>");
    expect(html).toContain("<caption>Text</caption>");
    expect(html).toContain("<td>series description</td><td>t2_tse_tra</td>");
    expect(html).toContain("<caption>Physics</caption>");
    expect(html).toContain("<caption>Private elements</caption>");
    expect(html).toContain("<td>csa series header</td><td>present</td>");
    expect(html).toContain("3 private elements withheld");
    expect(html).toContain("34 files");
  });
  it("says one line for a sealed stack and no table", () => {
    const html = renderToStaticMarkup(<HeaderTables header={{ stack: 48112, blind: true, sealed: true }} />);
    expect(html).toContain("Sealed: the header is not shown");
    expect(html).not.toContain("<table");
  });
  it("is null on an engine without the door, so the page shows as before", async () => {
    engine(404, { error: "not found" });
    expect(await review.header(48112)).toBeNull();
  });
  it("still raises any other refusal", async () => {
    engine(403, { error: "forbidden" });
    await expect(review.header(48112)).rejects.toThrow("forbidden");
  });
});
