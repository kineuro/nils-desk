// SPDX-License-Identifier: AGPL-3.0-only
// A model Kvasir downloads, as its card draws (record 25): its name, this
// machine with what is known of it as a hover title, one tag, and a download
// under way with its bar, how far it is and a pause; a failed one with its
// error as the tag's title and under Files, and a resume; a downloaded one with
// the commands a model server runs it with, each to copy, folded under the
// card. Where the install runs llama.cpp for Kvasir (record 24): Start for a
// model Kvasir can start, Stop while it loads or serves, its admission in its
// tag and the stations it answers, why it did not start with what llama.cpp
// logged, and the commands kept for the rest. And the line under the models:
// the machine and llama.cpp, where downloads go, and the token.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Admission } from "./gateway";
import type { LocalModel, LocalRun, LocalStatus } from "./kvasir";
import { LocalModelCard, MachineLine } from "./LocalModels";
import type { Install } from "./supervise";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const PATH = `/srv/models/owner--name/${COMMIT}`;
const GIB = 2 ** 30;

const model = (over: Partial<LocalModel> = {}): LocalModel => ({
  id: 1,
  repo: "owner/name",
  revision: "main",
  commit: COMMIT,
  path: PATH,
  state: "queued",
  files: 3,
  bytes_total: 16 * GIB,
  bytes_done: 0,
  error: null,
  added_by: "admin",
  added_at: 0,
  finished_at: null,
  serve: [],
  ...over,
});

const card = (m: LocalModel) => renderToStaticMarkup(<LocalModelCard model={m} onPause={() => undefined} onResume={() => undefined} onRemove={() => undefined} />);

describe("a local model's card", () => {
  it("draws a download under way with its bar, how far it is, its files, a pause and a removal", () => {
    const html = card(model({ state: "downloading", bytes_done: 4 * GIB }));
    expect(html).toContain('<div class="mcard">');
    expect(html).toContain('<span class="card-name path" title="owner/name">owner/name</span>');
    expect(html).toContain('<span class="meta" title="main, commit 0123456 · 16 GiB">This machine</span>');
    expect(html).toContain("downloading</span>");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="25"');
    expect(html).toContain("width:25%");
    expect(html).toContain("4 GiB of 16 GiB · 25%");
    expect(html).toContain('<details class="card-files"><summary>Files</summary>');
    expect(html).toContain(PATH);
    expect(html).toContain(">Pause</button>");
    expect(html).toContain('aria-label="More for owner/name"');
    expect(html).toContain(">Remove</button>");
    expect(html).not.toContain("Resume");
  });

  it("puts a failed download's error in its tag's title and under its files, and offers a resume, with no bar", () => {
    const html = card(model({ state: "failed", bytes_done: 2 * GIB, error: "the download of name-Q4_K_M.gguf stopped: fetch failed" }));
    expect(html).toContain('<span class="tag blocked" title="The download of name-Q4_K_M.gguf stopped: fetch failed.">');
    expect(html).toContain('<p class="warn">The download of name-Q4_K_M.gguf stopped: fetch failed.</p>');
    expect(html).toContain("2 GiB of 16 GiB");
    expect(html).toContain(">Resume</button>");
    expect(html).not.toContain("progressbar");
  });

  it("folds a downloaded model's commands under their labels, each to copy, and says Kvasir runs none", () => {
    const file = `${PATH}/name-Q4_K_M.gguf`;
    const html = card(
      model({
        state: "done",
        bytes_done: 16 * GIB,
        finished_at: 1,
        serve: [
          { runtime: "llama.cpp", command: `llama-server -m ${file} --port 8080` },
          { runtime: "ollama", command: `FROM ${file}` },
        ],
      }),
    );
    expect(html).toContain('<details class="card-files"><summary>Run it on a model server</summary>');
    expect(html).toContain("<dt>llama.cpp</dt>");
    expect(html).toContain("<dt>Ollama Modelfile</dt>");
    expect(html).toContain(`<code>FROM ${file}</code>`);
    expect(html).toContain(`aria-label="Copy llama-server -m ${file} --port 8080"`);
    expect(html).toContain("Kvasir runs no model: start a model server with one of these commands, then add it with Add a model.");
    expect(html).not.toContain(">Pause</button>");
    expect(html).not.toContain("Or run it yourself");
    expect(card(model({ state: "done" }))).toContain("knows no command for these files");
  });
});

describe("a local model's card where the install runs llama.cpp for Kvasir", () => {
  const file = `${PATH}/name-Q4_K_M.gguf`;
  const done: Partial<LocalModel> = { state: "done", bytes_done: 16 * GIB, finished_at: 1, serve: [{ runtime: "sglang", command: `python -m sglang.launch_server --model-path ${file}` }] };
  const run = (over: Partial<LocalRun> = {}): LocalRun => ({ state: "serving", model: "name-q4-k-m", error: null, log: [], context: 32768, slots: 4, started_by: "admin", started_at: 1, ...over });
  const drawn = (m: LocalModel, admission: Admission | null = null, answers: { words: string; title: string | null } | null = null) =>
    renderToStaticMarkup(
      <LocalModelCard
        model={m}
        runtime
        admission={admission}
        answers={answers}
        onPause={() => undefined}
        onResume={() => undefined}
        onRemove={() => undefined}
        onStart={() => undefined}
        onStop={() => undefined}
      />,
    );

  it("offers Start for a model Kvasir can start, and folds its commands under Or run it yourself", () => {
    const html = drawn(model({ ...done, startable: true, run: null }));
    expect(html).toContain('<button type="button" class="button small">Start</button>');
    expect(html).not.toContain(">Stop</button>");
    expect(html).toContain("downloaded</span>");
    expect(html).toContain('<details class="card-files"><summary>Or run it yourself</summary>');
    expect(html).toContain("A model server started with one of these commands is added with Add a model.");
    expect(html).not.toContain("Kvasir runs no model:");
  });

  it("names a serving model as llama.cpp serves it, with its admission in its tag, the stations it answers, and Stop", () => {
    const html = drawn(model({ ...done, startable: true, run: run() }), { tone: "blocked", words: "refused", on: "15 Sept", detail: "failed tool calls" }, { words: "answers 2 stations", title: "ask-help, identity-check" });
    expect(html).toContain('title="owner/name">name-q4-k-m</span>');
    expect(html).toContain('<span class="meta" title="main, commit 0123456 · 16 GiB · 32,768 tokens">This machine</span>');
    expect(html).toContain('<span class="tag blocked" title="refused on 15 Sept: failed tool calls"><span class="dot blocked"></span>refused</span>');
    expect(html).toContain('<span class="meta" title="ask-help, identity-check">answers 2 stations</span>');
    expect(html).toContain(">Stop</button>");
    expect(html).not.toContain(">Start</button>");
    const admitted = drawn(model({ ...done, startable: true, run: run() }), { tone: "ok", words: "admitted", on: "14 Sept", detail: null });
    expect(admitted).toContain('<span class="tag ok" title="admitted on 14 Sept"><span class="dot ok"></span>serving</span>');
    expect(admitted).not.toContain(">Check</button>");
    const checked = renderToStaticMarkup(
      <LocalModelCard model={model({ ...done, startable: true, run: run() })} runtime onPause={() => undefined} onResume={() => undefined} onRemove={() => undefined} onCheck={() => undefined} />,
    );
    expect(checked).toContain(">Check</button>");
  });

  it("offers Stop while a model loads", () => {
    const html = drawn(model({ ...done, startable: true, run: run({ state: "starting", context: null, slots: null }) }), null, { words: "answers 1 station", title: "ask-help" });
    expect(html).toContain('<span class="tag brand" title="loading as name-q4-k-m"><span class="dot brand"></span>loading</span>');
    expect(html).toContain(">Stop</button>");
  });

  it("says why a model did not start, with what llama.cpp logged behind a disclosure, and offers Start again", () => {
    const log = ["[58497] E gguf_init_from_file: failed to open GGUF file", "[58497] E srv load_model: failed to load model"];
    const html = drawn(model({ ...done, startable: true, run: run({ state: "failed", error: "llama.cpp ended with exit code 1", log, context: null, slots: null }) }), null, { words: "answers 1 station", title: "ask-help" });
    expect(html).toContain('title="llama.cpp ended with exit code 1."');
    expect(html).toContain("did not start</span>");
    expect(html).toContain('<p class="warn">llama.cpp ended with exit code 1.</p>');
    expect(html).toContain('<details class="failure-raw local-log"><summary>What llama.cpp logged</summary>');
    expect(html).toContain(`${log[0]}\n${log[1]}`);
    expect(html).toContain(">Start</button>");
    expect(html).not.toContain("answers 1 station");
    expect(drawn(model({ ...done, startable: true, run: run({ state: "failed", error: null, log: [] }) }))).toContain("It did not start, and llama.cpp said nothing more.");
  });

  it("keeps the commands under the card for a model Kvasir cannot start", () => {
    const html = drawn(model({ ...done, startable: false, run: null }));
    expect(html).not.toContain(">Start</button>");
    expect(html).toContain('<details class="card-files"><summary>Run it on a model server</summary>');
    expect(html).toContain("Kvasir starts only a GGUF model: start a model server with one of these commands, then add it with Add a model.");
  });
});

describe("the line under the models", () => {
  const status: LocalStatus = { location: "/srv/models", free_bytes: 412 * GIB, token: false, models: [], runtime: { build: "b10964", variant: "ubuntu-vulkan-x64", reachable: true, serving: null } };
  const install = { machine: { card: { name: "NVIDIA GeForce RTX 4090", memory_gb: 23.99 }, advice: [] } } as unknown as Install;
  const line = (s: LocalStatus, i: Install | null) => renderToStaticMarkup(<MachineLine install={i} status={s} onLocate={() => undefined} onToken={() => undefined} />);

  it("holds the machine's cards and llama.cpp, where downloads go with the room there, and the token, each to change", () => {
    const html = line(status, install);
    expect(html).toContain("NVIDIA GeForce RTX 4090, 24 GB · llama.cpp b10964, ubuntu-vulkan-x64");
    const pro = { name: "NVIDIA RTX PRO 6000", memory_gb: 95.59 };
    expect(line(status, { machine: { card: pro, cards: [pro, pro], advice: [] } } as unknown as Install)).toContain("2 × NVIDIA RTX PRO 6000, 191 GB · llama.cpp b10964, ubuntu-vulkan-x64");
    expect(html).toContain('<span class="ok-words">answers</span>');
    expect(html).toContain('<span class="path">/srv/models</span>');
    expect(html).toContain("412 GiB free");
    expect(html).toContain('<button type="button" class="link-button">Change</button>');
    expect(html).toContain("Hugging Face token not set");
    expect(html).toContain('<button type="button" class="link-button">Set</button>');
  });

  it("says llama.cpp does not answer, and leaves the machine out where neither it nor a runtime is known", () => {
    expect(line({ ...status, runtime: { ...status.runtime!, reachable: false } }, null)).toContain('<span class="warn">does not answer</span>');
    const bare = line({ ...status, runtime: null, token: true, free_bytes: null }, null);
    expect(bare).not.toContain("llama.cpp");
    expect(bare).toContain("free space unknown");
    expect(bare).toContain("Hugging Face token set");
  });
});
