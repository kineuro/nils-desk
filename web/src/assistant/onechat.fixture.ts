// SPDX-License-Identifier: AGPL-3.0-only
// A conversation for the Assistant's checks (onechat.test.tsx and the layout
// check in a real browser): two versions of a query, a plan that waits and a
// question, against a fake assistant and engine that answer by door. Every
// number is made up.

export const CHAT = {
  id: "c1",
  station: "nils",
  title: "T1 with contrast in study-big",
  title_by: "model",
  lineage: null,
  document: null,
  created_at: "2026-10-09T10:00:00Z",
  updated_at: "2026-10-09T10:05:00Z",
  pinned: false,
  archived: false,
  forked_from: null,
  shared: false,
  context: { tokens: 15729, window: 262144, compactions: 0, compacted_at: null },
};

export const text = (t: string) => ({ type: "text", text: t });
const approval = (data: Record<string, unknown>) => ({ type: "data-approval", data: { kind: "approval", ...data } });

export const HISTORY = {
  offset: "10",
  messages: [
    { id: "u1", role: "user", parts: [text("How many T1 scans with contrast are in study-big?")] },
    {
      id: "a1",
      role: "assistant",
      parts: [text("study-big has 212 T1 scans with contrast, from 48 subjects in 61 visits."), approval({ id: "q1", change: "query_version", sentence: "The question as it stands now (document 101).", ref: { document: 101, parent: null } })],
    },
    { id: "u2", role: "user", parts: [text("Only 3D, and add which have a FLAIR in the same visit.")] },
    { id: "a2", role: "assistant", parts: [text("174 are 3D; with a FLAIR in the visit, 139."), approval({ id: "q2", change: "query_version", sentence: "Only 3D, with a FLAIR in the visit.", ref: { document: 102, parent: 101 } })] },
    { id: "u3", role: "user", parts: [text("Sort the new files in study-big tonight.")] },
    {
      id: "a3",
      role: "assistant",
      parts: [
        text("Here is the plan. Nothing runs until you approve it."),
        approval({
          id: "ch1",
          change: "job_plan",
          title: "Sort study-big's new files, tonight at 22:00",
          sentence: "Read, sort and picture the new files.",
          lines: ["Read the new files, about 1,200", "Sort them, then pick the main scans", "Make their pictures"],
          ref: {},
        }),
      ],
    },
    { id: "u4", role: "user", parts: [text("How many scans are in the ALS cohort?")] },
    {
      id: "a4",
      role: "assistant",
      parts: [{ type: "data-clarification", data: { kind: "clarification", question: "There is no ALS cohort yet. Which did you mean?", options: [{ label: "Make an ALS cohort" }, { label: "nmosd", count: 17 }, { label: "All cohorts" }] } }],
    },
  ],
  settlements: [{ submissionId: "s4", outcome: "completed" }],
};

const where = (kind: string, name: string, value: unknown) => ["=", {}, [kind, {}, name], value];
const sets = (extra: unknown[]) => ({
  scope: { grain: "cohort", where: [where("field", "name", "study-big")] },
  people: { grain: "subject", of: "scope" },
  visits: { grain: "session", of: "people" },
  scans: { grain: "stack", of: "visits", where: [where("axis", "base", "T1w"), where("axis", "post_contrast", "given"), ...extra] },
});
const DOCS: Record<number, { name: string; parent: number | null; extra: unknown[] }> = {
  101: { name: "T1 with contrast in study-big", parent: null, extra: [] },
  102: { name: "3D T1 with contrast, with FLAIR", parent: null, extra: [where("axis", "technique", "3D")] },
  103: { name: "3D T1 with contrast, with FLAIR", parent: 102, extra: [where("axis", "technique", "3D"), where("axis", "base", "T2w")] },
  105: { name: "3D T1 with contrast in women", parent: null, extra: [where("axis", "technique", "3D")] },
};
const docOf = (id: number) => ({ document: id, hash: `h${id}`, parent: DOCS[id].parent, ask: { ast_version: 1, name: DOCS[id].name, sets: sets(DOCS[id].extra), out: { set: "scans", level: "count" } } });

const value = (v: string | null, count: number, subjects: number) => ({ value: v, count, subjects });
const PROFILES: Record<number, unknown> = {
  101: { counts: { subjects: 48, sessions: 61, stacks: 212 }, stack_types: [value("T1w", 174, 44), value("T2w", 30, 12), value("FLAIR", 8, 5), value(null, 2, 1)] },
  102: { counts: { subjects: 41, sessions: 52, stacks: 139 }, stack_types: [value("T1w", 96, 30), value("T2w", 31, 12), value("FLAIR", 12, 6)] },
  103: { counts: { subjects: 12, sessions: 13, stacks: 31 }, stack_types: [value("T2w", 31, 12)] },
  105: { counts: { subjects: 25, sessions: 30, stacks: 80 }, stack_types: [value("T1w", 80, 25)] },
};
const profileOf = (id: number) => ({
  set: "scans",
  grain: "stack",
  field: { name: "manufacturer", values: [value("Siemens", 100, 30), value("GE", 39, 11)] },
  demographics: { sex: [value("F", 25, 25), value("M", 16, 16)], age_decades: [{ value: 40, count: 20, subjects: 15 }] },
  clinical: { kinds: [value("EDSS", 50, 20)], sensitive_withheld: false },
  ...(PROFILES[id] as object),
});

const move = (id: number, kind: string, set: string | null, holes: unknown[]) => ({ id, kind, set, template: kind, holes });
const optionsOf = (set: string) => ({
  token: `tok-${set}`,
  hash: "h",
  epoch: 1,
  set,
  grain: set === "scans" ? "stack" : set === "people" ? "subject" : set === "visits" ? "session" : "cohort",
  describe: "",
  exposes: { fields: [], dated: [], bindings: [] },
  presets: [],
  moves:
    set === "scans"
      ? [
          move(4, "remove_where", "scans", [{ name: "index", type: "index", fillers: [0, 1, 2, 3] }]),
          move(7, "add_axis_where", "scans", [
            { name: "axis", type: "axis", fillers: ["base"] },
            { name: "value", type: "value", fillers: ["FLAIR", "T1w", "T2w"] },
          ]),
          move(9, "add_where", "scans", [
            { name: "field", type: "field", fillers: ["manufacturer"] },
            { name: "op", type: "op", fillers: ["=", "!="] },
            { name: "value", type: "value", optional: true },
          ]),
          move(2, "set_out", null, [
            { name: "set", type: "set", fillers: ["scans", "visits"] },
            { name: "level", type: "level", fillers: ["count", "record"] },
          ]),
        ]
      : set === "people"
        ? [
            move(3, "add_where", "people", [
              { name: "field", type: "field", fillers: ["sex"] },
              { name: "op", type: "op", fillers: ["="] },
              { name: "value", type: "value", optional: true },
            ]),
          ]
        : [],
});

export const INBOX = { subject: "astrid", jobs: { queued: [], running: [], finished: [], failed: [] }, waiting: [], plans: [], proposals: [], grants: [] };

export interface Call {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

/** The fake assistant and engine, by door; `turn` is what the stream answers after a message is sent. */
export function fakeDoors(turn: unknown[] = []): (c: Call, nth: number) => { status: number; body: unknown } | undefined {
  let applied = 102;
  return (c, nth) => {
    const u = new URL(c.url, "http://x");
    const body = (c.body ?? {}) as Record<string, unknown>;
    if (u.pathname === "/assistant/conversations" && c.method === "GET") return { status: 200, body: { conversations: [CHAT], next: null } };
    if (u.pathname === "/assistant/conversations/c1" && c.method === "GET") return { status: 200, body: { ...CHAT, proposals: [] } };
    if (u.pathname === "/assistant/agents/nils/c1" && c.method === "GET" && u.searchParams.get("view") === "history") return { status: 200, body: HISTORY };
    if (u.pathname === "/assistant/agents/nils/c1" && c.method === "GET" && u.searchParams.get("live") === "long-poll") return { status: 200, body: nth === 1 ? turn : [] };
    if (u.pathname === "/assistant/agents/nils/c1" && c.method === "POST") return { status: 200, body: { submissionId: "s5", offset: "10" } };
    if (u.pathname === "/desk/assistant/conversations/c1/token") return { status: 200, body: {} };
    if (u.pathname === "/assistant/inbox") return { status: 200, body: INBOX };
    if (u.pathname === "/assistant/conversations/c1/feedback") return { status: 200, body: {} };
    if (u.pathname.startsWith("/assistant/changes/")) return { status: 200, body: {} };
    const doc = /^\/api\/ask\/documents\/(\d+)$/.exec(u.pathname);
    if (doc) return { status: 200, body: docOf(Number(doc[1])) };
    if (u.pathname === "/api/ask/documents" && c.method === "POST") return { status: 200, body: { document: 150, hash: "h150", parent: body.parent } };
    if (u.pathname === "/api/ask/options") return { status: 200, body: optionsOf(String(body.set)) };
    if (u.pathname === "/api/ask/profile") return { status: 200, body: profileOf(Number(body.document_id)) };
    if (u.pathname === "/api/ask/diagnose") return { status: 200, body: { valid: true, issues: [], repairs: [], warnings: [], zero_rows: null, drops: [], ties: [], unresolved: [], coarse: [], cost: { sets: 4, class: "small" }, funnel: [], next: [], by: "clause", groups: [] } };
    if (u.pathname === "/api/ask/catalog/stack") return { status: 200, body: { level: "stack", fields: [{ level: "stack", path: "manufacturer", type: "text", class: "technical", dated: false, description: "" }], next: null, total: 1 } };
    if (u.pathname === "/api/ask/preview") return { status: 200, body: { level: "count", columns: ["rows", "subjects"], rows: [[139, 41]], truncated: false } };
    if (u.pathname === "/api/ask/apply") {
      applied = applied === 102 ? 103 : applied + 1;
      return { status: 200, body: { document: applied, parent: body.document_id, hash: `h${applied}`, epoch: 1, changed: [], options: optionsOf("scans") } };
    }
    return undefined;
  };
}

