// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The reader on a big screen (after the first gold campaign): the file's key
// lines drawn a step stronger with the study and the body part among them,
// the other fields' lines folded under their label and kept folded, one
// question's values drawn large, the answer's two buttons one group, and the
// time on the item.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { HeaderBlock } from "./ReaderParts";
import { Clock, headerLines } from "./reader";
import { AxisRows } from "./renderers";
import { secondsWords } from "./Workspace";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LINES = headerLines(
  { series_description: "t1_sag", protocol_name: "t1 sag", study_description: "NEURO", body_part_examined: "HEAD", sequence_name: "*tfl3d1", series_comments: "second attempt" },
  { repetition_time: 2300, echo_time: 3, number_of_averages: 1 },
);

afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("the reader on a big screen", () => {
  it("draws the series, the protocol, the study and the body part as the key lines", () => {
    const html = renderToStaticMarkup(<HeaderBlock lines={LINES} />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const keyed = [...doc.querySelectorAll(".hb-key .hb-k")].map((e) => e.textContent);
    expect(keyed).toEqual(["series", "protocol", "study", "body part"]);
    expect(doc.querySelector(".hb-key .hb-v")?.textContent).toBe("t1_sag");
    // beside a suggestion the block keeps to its lines, the study and the body part one key away
    const brief = new DOMParser().parseFromString(renderToStaticMarkup(<HeaderBlock lines={LINES} brief />), "text/html");
    expect([...brief.querySelectorAll(".hb-k")].map((e) => e.textContent)).toEqual(["series", "protocol", "sequence", "timing"]);
  });

  it("folds the other fields' lines under their label, and keeps them folded", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<HeaderBlock lines={LINES} />));
    expect(host.querySelectorAll(".hb-more").length).toBe(2);
    await act(async () => host.querySelector<HTMLButtonElement>(".hb-fold")!.click());
    expect(host.querySelectorAll(".hb-more").length).toBe(1);
    expect(host.querySelector(".hb-more.folded")?.textContent).toContain("2 lines folded");
    expect(localStorage.getItem("nils.reader.more")).toBe("folded");
    await act(async () => root.unmount());
    // the next item opens folded
    const again = createRoot(host);
    await act(async () => again.render(<HeaderBlock lines={LINES} />));
    expect(host.querySelector(".hb-more.folded")).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>(".hb-fold")!.click());
    expect(host.querySelectorAll(".hb-more").length).toBe(2);
    await act(async () => again.unmount());
  });

  it("marks a one-row question's values to be drawn large", () => {
    const one = renderToStaticMarkup(<AxisRows rows={[{ axis: "body_part", values: ["brain", "neck"], multi: false }]} chosen={{}} onChoose={() => undefined} />);
    expect(one).toContain('class="axis-rows single"');
    const two = renderToStaticMarkup(<AxisRows rows={[{ axis: "a", values: ["x"], multi: false }, { axis: "b", values: ["y"], multi: false }]} chosen={{}} onChoose={() => undefined} />);
    expect(two).toContain('class="axis-rows"');
  });

  it("counts the time on an item from when it was shown, without stopping its clock", () => {
    const c = new Clock();
    expect(c.since(7)).toBeNull();
    c.start(7, 1000);
    c.start(7, 5000);
    expect(c.since(7)).toBe(1000);
    expect(c.stop(7, 13_000)).toBe(12);
    expect(c.since(7)).toBeNull();
    expect([secondsWords(0), secondsWords(7400), secondsWords(65_000), secondsWords(-5)]).toEqual(["0 s", "7 s", "1:05", "0 s"]);
  });
});
