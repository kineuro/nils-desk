// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from "vitest";
import { scansOf, type ScanRow } from "./scans";

const row = (picture: ScanRow["picture"]): ScanRow => ({
  stack: 7,
  subject: { id: 1, code: "abc" },
  session: { id: 2, label: "20200101" },
  series_description: "t1",
  orientation: "axial",
  images: 10,
  day: null,
  picture,
});

describe("a scan's picture", () => {
  it("is the preview door's address where the engine gives one, so the page carries no pixels", () => {
    const url = "/api/instances/7/preview?plane=axial&v=d1&held=0";
    const [s] = scansOf([row({ url, width: 256, height: 200, digest: "d1", held: false, partial: false })]);
    expect(s.picture).toBe(url);
    expect(s.partial).toBe(false);
  });

  it("is a first picture's address, never kept, while the scan's preview is made", () => {
    const [s] = scansOf([row({ url: "/api/instances/7/preview?plane=axial", width: null, height: null, digest: null, held: null, partial: true })]);
    expect(s.picture).toBe("/api/instances/7/preview?plane=axial");
    expect(s.partial).toBe(true);
  });

  it("is the data URL an engine before the addresses answers, and never an address off the engine", () => {
    const data = "data:image/jpeg;base64,AAAA";
    expect(scansOf([row({ data, width: 256, height: 256, digest: null, held: false })])[0].picture).toBe(data);
    expect(scansOf([row({ url: "https://elsewhere.example/x.jpg", width: 1, height: 1, digest: null, held: false })])[0].picture).toBeNull();
    expect(scansOf([row(null)])[0].picture).toBeNull();
  });
});
