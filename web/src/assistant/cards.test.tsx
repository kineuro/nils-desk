// SPDX-License-Identifier: AGPL-3.0-only
// One chat as a turn shows it: no step boxes and no agent names, the steps
// behind a "?", every change on one approval card drawn as a plan that waits
// for the person (Approve, Change it, Not now), a question with its choices as
// outlined buttons.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalCardView, PlanPanel } from "./Cards";
import { cardOfChange } from "./events";
import type { Turn } from "./parts";
import { TurnView } from "./TurnView";

const turn: Turn = {
  id: "a1",
  role: "assistant",
  text: "There are 38.",
  done: true,
  tools: [
    { id: "1", name: "delegate", state: "done" },
    { id: "2", name: "advance", state: "done" },
    { id: "3", name: "registry_search", state: "done", words: "Looking in the registry" },
  ],
};

describe("a turn in the one chat", () => {
  it("folds its steps behind a ? with no boxes, hand-offs or counts of earlier steps", () => {
    const closed = renderToStaticMarkup(<TurnView turn={turn} open={false} onToggle={() => undefined} proposals={[]} choice={null} onChoose={() => undefined} />);
    expect(closed).toContain("steps-q");
    expect(closed).not.toMatch(/earlier step|Moved on|station|Handed/);
    const open = renderToStaticMarkup(<TurnView turn={turn} open onToggle={() => undefined} proposals={[]} choice={null} onChoose={() => undefined} />);
    expect(open).toContain("Looking in the registry");
    expect(open).toContain("Looking into it");
    expect(open).not.toContain("Moved on");
  });

  it("shows a proposed version and any other change on the same card, and a question with its options", () => {
    const html = renderToStaticMarkup(
      <TurnView
        turn={turn}
        open={false}
        onToggle={() => undefined}
        proposals={[{ document: 5, parent: 4, sentence: "Only women", turn: "a1", decided: null }]}
        onDecide={() => undefined}
        changes={[{ id: "w", change: "sorting_words", title: null, sentence: "Add FLAIR3D", lines: [], turn: "a1", decided: null }]}
        onChange={() => undefined}
        choice={{ question: "Which site?", options: [{ label: "Solna", count: 12 }] }}
        onChoose={() => undefined}
      />,
    );
    expect(html.match(/class="approval-card"/g)).toHaveLength(2);
    expect(html).toContain(">Query<");
    expect(html).toContain(">Sorting words<");
    expect(html).toContain("waits for you");
    expect(html).toContain("Add FLAIR3D");
    expect(html).toContain("Which site?");
    expect(html).toMatch(/class="ask-option"[^>]*>Solna<span class="num">12<\/span>/);
  });

  it("draws a proposed version the page's own way where it says one, and offers Change it on a change", () => {
    const html = renderToStaticMarkup(
      <TurnView
        turn={turn}
        open={false}
        onToggle={() => undefined}
        proposals={[{ document: 5, parent: 4, sentence: "Only women", turn: "a1", decided: null }]}
        queryCard={(p) => <span className="the-query-card">{p.document}</span>}
        changes={[{ id: "w", change: "job_plan", title: "Sort tonight", sentence: "Read and sort", lines: ["Read", "Sort"], turn: "a1", decided: null }]}
        onChange={() => undefined}
        onRevise={() => undefined}
        choice={null}
        onChoose={() => undefined}
      />,
    );
    expect(html).toContain('<span class="the-query-card">5</span>');
    expect(html.match(/class="approval-card"/g)).toHaveLength(1);
    expect(html).toContain("<ol");
    expect(html).toMatch(/>Approve<\/button><button[^>]*>Change it<\/button><button[^>]*>Not now</);
  });

  it("names a decided change and offers no buttons", () => {
    const html = renderToStaticMarkup(<ApprovalCardView card={cardOfChange({ id: "m", change: "identity_merge", title: null, sentence: "One person", lines: [], turn: "a", decided: "approved" })} onDecide={() => undefined} />);
    expect(html).toContain(">approved<");
    expect(html).not.toContain("<button");
    const later = renderToStaticMarkup(<ApprovalCardView card={cardOfChange({ id: "m", change: "identity_merge", title: null, sentence: "One person", lines: [], turn: "a", decided: "declined" })} onDecide={() => undefined} />);
    expect(later).toContain(">not now<");
  });

  it("approves an identity rule as a record and points to the dataset's page", () => {
    const open = renderToStaticMarkup(<ApprovalCardView card={cardOfChange({ id: "r", change: "identity_rule", title: null, sentence: "Tell people apart by PatientName", lines: ['dataset incoming: {"source":"PatientName"}'], turn: "a", decided: null })} onDecide={() => undefined} />);
    expect(open).toContain(">Identity rule<");
    expect(open).toContain("Tell people apart by PatientName");
    expect(open).toContain(">Approve<");
    const done = renderToStaticMarkup(<ApprovalCardView card={cardOfChange({ id: "r", change: "identity_rule", title: null, sentence: "Tell people apart by PatientName", lines: ['dataset incoming: {"source":"PatientName"}'], turn: "a", decided: "approved" })} />);
    expect(done).toContain("recorded");
    expect(done).toContain('href="#data/datasets/incoming"');
  });

  it("lists the plan with each item's state", () => {
    const html = renderToStaticMarkup(<PlanPanel items={[{ text: "Find the scans", status: "done" }, { text: "Count them", status: "running" }]} />);
    expect(html).toContain("plan-done");
    expect(html).toContain("Count them");
  });
});
