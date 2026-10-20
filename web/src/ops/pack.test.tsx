// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// The pipeline pack in the desk (record 57 P2 to P4, Wave 7b spec 5.5 to 5.7
// and 17): a run's start with the pack's goal and switches and the knobs a
// person may not set; the pre-flight's units as the pack judged them; a run's
// units with each knob's value and who chose it, the caveats, the flags and
// the comparability key; its numbers per key, never summed; the table that
// asks only for the columns the run made (the segcsvd run without a FLAIR);
// and the way from a refusal for software to Settings > Software. Against the
// engine's shapes (./pack.fixture); every name is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DoorError } from "../ask/client";
import { capsWith } from "../review/caps.fixture";
import { RuleFixesLine } from "../review/RuleFixesLine";
import { overOfCommand, runCommand, type Pipeline } from "./catalog";
import { RunDialog } from "./Catalog";
import { packs } from "./client";
import { isSoftwares, failureWords } from "./failure";
import { byWords, flagWords, judgedLines, keyShort, madeColumns, packView, packWords, personBody, personFlags, personOf, poolingOf, setByWords } from "./pack";
import { NUMBERS_TWO, PACK_DOC, PRE_PACK, RUN_PACK, SAMSEG_PIPELINE, SEGCSVD_NUMBERS, SEGCSVD_PIPELINE, SEGCSVD_SUMMARY } from "./pack.fixture";
import { PreflightPanel, Requirements } from "./Preflight";
import { FailNote } from "./Reason";
import { RunView } from "./RunPage";
import { measureColumns, runs, tableAsk } from "./runs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOORS = ["GET /api/pipelines", "GET /api/pipelines/{id}/pack", "GET /api/pipeline-runs/{id}", "GET /api/pipeline-runs/{id}/numbers", "POST /api/pipelines/{name}/preflight", "POST /api/jobs", "POST /api/ask/run", "GET /api/software"];
const CAPS = capsWith(DOORS, ["pipelines:see", "pipelines:work", "query:see", "query:work", "install:see"]);
const VIEW = packView(PACK_DOC)!;
const name = (p: string) => (p.replace(/^person:/u, "") === "astrid@site" ? "Astrid" : p);

describe("the pack, read", () => {
  it("reads the goal, the switches with their defaults, and who sets each knob", () => {
    expect(VIEW.goals).toEqual(["fast", "standard", "research"]);
    expect(VIEW.switches).toEqual({ lesions: ["on", "off"] });
    expect(VIEW.defaults).toEqual({ goal: "standard", lesions: "on" });
    expect(VIEW.knobs.threshold.set_by).toBe("fixed");
    expect(VIEW.knobs.threads.set_by).toBe("person");
    expect(setByWords(VIEW, "lesion")).toBe("set by the rules lesions-follow-the-switch, lesions-off-without-flair");
    expect(setByWords(VIEW, "threshold")).toBe("fixed at 0.3");
    expect(packView({ ...PACK_DOC, pack: "none" })).toBeNull();
    expect(packView({ ...PACK_DOC, pack: { error: "a newer contract" } })).toBeNull();
  });

  it("sends only what the person changed from the pack's defaults, at the pre-flight and on the command line", () => {
    const same = personOf(VIEW, { goal: "standard", switches: { lesions: "on" }, let_run: false });
    expect(personBody(same)).toEqual({});
    expect(personFlags(same)).toEqual([]);
    const chosen = personOf(VIEW, { goal: "research", switches: { lesions: "off", nonsense: "x" }, let_run: true });
    expect(personBody(chosen)).toEqual({ goal: "research", switches: { lesions: "off" }, let_run: true });
    const cmd = runCommand({ pipeline: { label: "samseg-lesions@2" }, over: { selection: "study", version: 3 }, params: {}, models: [], labels: null, person: chosen });
    expect(cmd).toEqual(["run", "samseg-lesions@2", "--select", "selection:study@3", "--goal", "research", "--switch", "lesions=off", "--let-run"]);
    // a stopped run's command is read again whole: --let-run takes no value
    expect(overOfCommand([...cmd, "--param", "threads=8"])).toEqual({ pipeline: "samseg-lesions@2", over: { selection: "study", version: 3 }, params: { threads: "8" } });
  });

  it("says who chose: the person by name, a rule with its words, the default, fixed, and the assistant's proposal", () => {
    expect(byWords({ by: "default" }, name, VIEW)).toEqual({ kind: "default", words: "default", title: null });
    expect(byWords({ by: "rule:lesions-off-without-flair", rule: "lesions-off-without-flair" }, name, VIEW)).toEqual({ kind: "rule", words: "rule lesions-off-without-flair", title: "no FLAIR, so no lesions (SAMSEG's documentation)" });
    expect(byWords({ by: "person:astrid@site" }, name, VIEW).words).toBe("Astrid");
    expect(byWords({ by: "person:astrid@site", proposed: "assistant" }, name, VIEW).words).toBe("Astrid, as the assistant proposed");
    expect(byWords({ by: "fixed" }, name, VIEW).kind).toBe("fixed");
  });

  it("gives a unit's status in the pack's words: skipped with the need, routed with the reason, flagged or dropped with the check", () => {
    expect(packWords({ pack_status: "skipped", words: "the T1 is 2D" })).toEqual({ status: "skipped", words: "the T1 is 2D" });
    expect(packWords({ pack_status: "routed", variant: { pipeline: "samseg@2", why: "no FLAIR picked" } })).toEqual({ status: "routed", words: "to samseg@2: no FLAIR picked" });
    const flag = { metric: "flair_t1_brain_dice", value: 0.79, check: "flair_t1_brain_dice >= 0.85", action: "flag", words: "FLAIR and T1 may not be aligned" };
    expect(packWords({ pack_status: "ready", flags: [flag] })).toEqual({ status: "flagged", words: "flair_t1_brain_dice 0.79 (flair_t1_brain_dice >= 0.85): FLAIR and T1 may not be aligned" });
    expect(packWords({ pack_status: "ready", flags: [{ ...flag, action: "drop" }] }).status).toBe("dropped");
    expect(packWords({ pack_status: "ready" }).status).toBeNull();
    expect(flagWords({ metric: "x", value: 2, check: null })).toBe("x 2");
    expect(keyShort(`sha256:${"a1".repeat(32)}`)).toBe("a1a1a1a1a1a1");
  });

  it("judges the units at the pre-flight in lines: how many run, skipped by which need, routed to what", () => {
    expect(judgedLines(PRE_PACK.units_judged!).map((l) => [l.count, l.words])).toEqual([
      [9, "run, 3 with a caveat"],
      [2, "skipped: the T1 is 2D; SAMSEG reads its contrasts on one 3D grid"],
      [1, "routed to samseg@2: no FLAIR picked"],
    ]);
    const html = renderToStaticMarkup(<PreflightPanel p={PRE_PACK} />);
    expect(html).toContain('aria-label="the sessions as the pack judged them"');
    expect(html).toContain('<li class="skipped"><b class="num">2</b> sessions skipped: the T1 is 2D');
    expect(html).toContain('<li class="routed"><b class="num">1</b> session routed to samseg@2');
    expect(html).toContain("the registry cannot tell about");
  });
});

describe("the table asks only for what the run made", () => {
  it("leaves out a column every table file lacked, as a segcsvd run without a FLAIR lacks the FLAIR's", () => {
    const cols = measureColumns(SEGCSVD_PIPELINE as unknown as Pipeline);
    expect(cols.map((c) => c.name)).toEqual(["wmh_volume", "flair_wmh_volume", "pvs_count", "scanner"]);
    const made = madeColumns(cols, SEGCSVD_SUMMARY, SEGCSVD_NUMBERS);
    expect(made.map((c) => c.name)).toEqual(["wmh_volume", "pvs_count", "scanner"]);
    // from the summary alone, where the engine has no numbers door
    expect(madeColumns(cols, SEGCSVD_SUMMARY, null).map((c) => c.name)).toEqual(["wmh_volume", "pvs_count", "scanner"]);
    // a column some unit measured stays, though another unit's file lacked it
    expect(madeColumns(cols, SEGCSVD_SUMMARY, { ...SEGCSVD_NUMBERS, keys: [{ ...SEGCSVD_NUMBERS.keys[0], measures: { ...SEGCSVD_NUMBERS.keys[0].measures, flair_wmh_volume: { count: 1, sum: 5, mean: 5, unit: "mm3" } } }] }).map((c) => c.name)).toContain("flair_wmh_volume");
    const ask = JSON.stringify(tableAsk({ pipeline: "segcsvd", level: "session", run: 52, columns: made, perScan: true, by: "subject.sex" }));
    expect(ask).not.toContain("flair_wmh_volume");
  });

  it("reads a pooling refusal as its words, never as a table that could not be read", () => {
    const words = NUMBERS_TWO.words!;
    expect(poolingOf(new DoorError(409, { error: `${words}: group by measure.samseg-lesions.key to answer per key` }))).toMatch(/^these results hold 2 comparability keys/u);
    expect(poolingOf(new DoorError(409, { error: "something else" }))).toBeNull();
    expect(poolingOf(new DoorError(400, { error: words }))).toBeNull();
  });
});

describe("a run's units with who chose", () => {
  const draw = (table: Parameters<typeof RunView>[0]["table"] = { kind: "off", why: null }, numbers = NUMBERS_TWO) =>
    renderToStaticMarkup(
      <RunView caps={CAPS} run={RUN_PACK} pipeline={SAMSEG_PIPELINE as unknown as Pipeline} resumedAt={null} jobAlive={false} table={table} files={null} by="subject.sex" onBy={() => undefined} said={null} onCancel={null} onResume={null} pack={VIEW} numbers={numbers} people={[{ subject: "astrid@site", display: "Astrid" }]} />,
    );

  it("shows each knob's value and who chose it, the caveats, the flags with the check's words, and the key", () => {
    const html = draw();
    expect(html).toContain('<span class="knob person" title="the threads one session uses"><span class="knob-id">threads</span><b>8</b><span class="knob-by">Astrid</span></span>');
    expect(html).toContain('<span class="knob rule" title="no FLAIR, so no lesions (SAMSEG&#x27;s documentation)"><span class="knob-id">lesion</span><b>off</b><span class="knob-by">rule lesions-off-without-flair</span></span>');
    expect(html).toContain('<span class="knob-id">threshold</span><b>0.3</b><span class="knob-by">fixed</span>');
    expect(html).toContain("the T1 was acquired below 1.5 T");
    expect(html).toContain('<span class="tag caution">flagged</span>');
    expect(html).toContain("flair_t1_brain_dice 0.79 (flair_t1_brain_dice &gt;= 0.85): FLAIR and T1 may not be aligned");
    expect(html).toContain(">a1a1a1a1a1a1</td>");
    expect(html).toContain(">b2b2b2b2b2b2</td>");
    // a skipped unit says the need in the pack's words on its own line, not again among its pack's words
    expect(html).toContain('<span class="made-words" title="the T1 is 2D; SAMSEG reads its contrasts on one 3D grid">the T1 is 2D; SAMSEG reads its contrasts on one 3D grid</span>');
    expect(html).not.toContain('<span class="unit-flag">the T1 is 2D');
    expect(html).not.toContain("astrid@site");
  });

  it("shows the numbers per key apart with the pooling words, and a refused total as its words, never a merged number", () => {
    const html = draw();
    expect(html).toContain("they are answered per key and never summed together");
    // at detail quasi each key's mean is shown; never one across keys
    expect(html).toContain(">1,450,000</td>");
    expect(html).toContain(">1,380,000</td>");
    expect(html).not.toContain("1,426,667");
    const refused = draw({ kind: "pooled", words: NUMBERS_TWO.words! });
    expect(refused).toContain("Not summed: several comparability keys");
    expect(refused).not.toContain("The table could not be read");
    // below detail quasi a key of fewer than 5 units reads withheld
    const below = renderToStaticMarkup(
      <RunView caps={{ ...CAPS, person: { ...CAPS.person, detail: "plain" } }} run={RUN_PACK} pipeline={SAMSEG_PIPELINE as unknown as Pipeline} resumedAt={null} jobAlive={false} table={{ kind: "off", why: null }} files={null} by="subject.sex" onBy={() => undefined} said={null} onCancel={null} onResume={null} pack={VIEW} numbers={NUMBERS_TWO} />,
    );
    expect(below).toContain(">withheld</td>");
    expect(below).not.toContain(">1,450,000</td>");
  });
});

describe("a refusal for software links to Settings > Software", () => {
  it("knows the software place's failures by their cause and the engine's words", () => {
    expect(isSoftwares({ cause: "dcm2niix" })).toBe(true);
    expect(isSoftwares({ check: "licence", ok: false, said: "" })).toBe(true);
    expect(isSoftwares({ check: "image", ok: false, said: "freesurfer@8.1.0 failed verification" })).toBe(true);
    expect(isSoftwares({ check: "memory", ok: false, said: "a unit needs 16 GB" })).toBe(false);
    expect(isSoftwares({ check: "licence", ok: true, said: "" })).toBe(false);
    expect(isSoftwares({ advice: "Install dcm2niix where the engine runs: an admin can with nils software install dcm2niix" })).toBe(true);
  });

  it("draws the link beside a failing check and in a refusal's note, only where the person may open the page", () => {
    const checks = [
      { check: "licence", ok: false, said: "the terms of freesurfer@8.1.0 are not accepted", failure: null },
      { check: "memory", ok: false, said: "a unit needs 16 GB", failure: null },
    ];
    const html = renderToStaticMarkup(<Requirements checks={checks} software="#settings/software" />);
    expect(html.match(/href="#settings\/software"/gu)).toHaveLength(1);
    expect(renderToStaticMarkup(<Requirements checks={checks} />)).not.toContain("#settings/software");
    expect(renderToStaticMarkup(<FailNote f={failureWords("the release failed: dcm2niix is not runnable; nils software install dcm2niix")} software="#settings/software" />)).toContain("Settings › Software");
  });

  it("counts retired proposals beside the adopted on a dataset's line", () => {
    expect(renderToStaticMarkup(<RuleFixesLine dataset="ward-c" counts={{ proposed: 0, adopted: 2, rejected: 0, retired: 1 }} link={false} />)).toContain("1 retired");
  });
});

describe("the start of a run", () => {
  let asked: { method: string; path: string; body: unknown }[] = [];
  let root: Root;
  let el: HTMLDivElement;
  beforeEach(() => {
    if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
    asked = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://desk.test");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      asked.push({ method, path: url.pathname, body });
      const a =
        method === "GET" && url.pathname === "/api/pipelines/5/pack"
          ? { status: 200, body: PACK_DOC }
          : method === "POST" && url.pathname === "/api/pipelines/5/preflight"
            ? { status: 200, body: PRE_PACK }
            : method === "POST" && url.pathname === "/api/jobs"
              ? { status: 202, body: { job: 80, state: "queued" } }
              : { status: 404, body: { error: `no ${url.pathname}` } };
      return new Response(JSON.stringify(a.body), { status: a.status });
    }) as typeof fetch;
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });
  const settle = async () => {
    for (let i = 0; i < 8; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
  };
  const button = (words: string) => [...el.ownerDocument.querySelectorAll("button")].find((b) => b.textContent?.trim() === words) as HTMLButtonElement;

  it("offers the pack's goal and switches, shows the knobs a rule sets or the pack fixes, and sends the person's choices", async () => {
    expect((await packs.of(5)).pipeline).toBe("samseg-lesions@2");
    asked = [];
    let queued: string | null = null;
    act(() => root.render(<RunDialog caps={CAPS} pipeline={SAMSEG_PIPELINE as unknown as Pipeline} onClose={() => undefined} onDone={(w) => (queued = w)} />));
    await settle();
    const doc = el.ownerDocument;
    expect(asked.some((a) => a.path === "/api/pipelines/5/pack")).toBe(true);
    const goal = doc.querySelector('[aria-label="the run\'s goal"]')!;
    expect(goal.querySelector('[aria-pressed="true"]')!.textContent).toBe("standard");
    expect(doc.querySelector('[aria-label="the switch lesions"] [aria-pressed="true"]')!.textContent).toBe("on");
    expect(doc.body.textContent).toContain("fixed at 0.3");
    expect(doc.body.textContent).toContain("per unit, set by the rule pallidum-needs-t2-or-flair");
    // a knob the pack leaves to the person stays a field
    expect(doc.querySelector('[aria-label="Threads"]')).not.toBeNull();
    expect(doc.querySelector('[aria-label="Lesion threshold"]')).toBeNull();
    act(() => button("research").click());
    act(() => button("off").click());
    // the pre-flight is asked once something is chosen to run over: the run form's selection picker is not drawn here, so the command is read from the dialog's code line
    expect(doc.body.textContent).not.toContain("--let-run");
    expect(queued).toBeNull();
    // the pre-flight carries what the person chose, beside what it runs over
    asked = [];
    await runs.preflight(5, { selection: "study", version: 3 }, { threads: "8" }, personOf(VIEW, { goal: "research", switches: { lesions: "off" }, let_run: false }));
    expect(asked[0]).toEqual({ method: "POST", path: "/api/pipelines/5/preflight", body: { select: "selection:study@3", params: { threads: "8" }, goal: "research", switches: { lesions: "off" } } });
  });
});
