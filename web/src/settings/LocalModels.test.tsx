// SPDX-License-Identifier: AGPL-3.0-only
// A local model's row as it draws: a download under way with its bar, how far
// it is and a pause; a failed one with its error and a resume; a downloaded
// one with the commands a model server runs it with, each to copy, and the
// line that says Kvasir runs no model. Where the install runs llama.cpp for
// Kvasir (record 24): Start for a model Kvasir can start, Stop while it loads
// or serves, how it serves and whether Kvasir admitted it, why it did not
// start with what llama.cpp logged, and the commands kept for the rest.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Admission } from "./gateway";
import type { LocalModel, LocalRun } from "./kvasir";
import { LocalModelRow } from "./LocalModels";

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

const row = (m: LocalModel) => renderToStaticMarkup(<LocalModelRow model={m} onPause={() => undefined} onResume={() => undefined} onRemove={() => undefined} />);

describe("a local model's row", () => {
  it("draws a download under way with its bar, how far it is, its path, a pause and a removal", () => {
    const html = row(model({ state: "downloading", bytes_done: 4 * GIB }));
    expect(html).toContain("owner/name");
    expect(html).toContain("main, commit 0123456");
    expect(html).toContain("downloading");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="25"');
    expect(html).toContain("width:25%");
    expect(html).toContain("4 GiB of 16 GiB, 25%");
    expect(html).toContain(PATH);
    expect(html).toContain(">Pause</button>");
    expect(html).toContain(">Remove</button>");
    expect(html).not.toContain("Resume");
  });

  it("draws a failed download with its error and a resume, and no bar", () => {
    const html = row(model({ state: "failed", bytes_done: 2 * GIB, error: "the download of name-Q4_K_M.gguf stopped: fetch failed" }));
    expect(html).toContain("The download of name-Q4_K_M.gguf stopped: fetch failed.");
    expect(html).toContain("2 GiB of 16 GiB when it stopped");
    expect(html).toContain(">Resume</button>");
    expect(html).not.toContain("progressbar");
  });

  it("draws a downloaded model's commands under their labels, each to copy, and says Kvasir runs none", () => {
    const file = `${PATH}/name-Q4_K_M.gguf`;
    const html = row(
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
    expect(html).toContain("<dt>llama.cpp</dt>");
    expect(html).toContain("<dt>Ollama Modelfile</dt>");
    expect(html).toContain(`<code>FROM ${file}</code>`);
    expect(html).toContain(`aria-label="Copy llama-server -m ${file} --port 8080"`);
    expect(html).toContain("Kvasir runs no model: start a model server with one of these commands, then add it with Add a model.");
    expect(html).not.toContain(">Pause</button>");
    expect(html).not.toContain("Or run it yourself");
    expect(row(model({ state: "done" }))).toContain("knows no command for these files");
  });
});

describe("a local model where the install runs llama.cpp for Kvasir", () => {
  const file = `${PATH}/name-Q4_K_M.gguf`;
  const done: Partial<LocalModel> = { state: "done", bytes_done: 16 * GIB, finished_at: 1, serve: [{ runtime: "llama.cpp", command: `llama-server -m ${file} --port 8080` }] };
  const run = (over: Partial<LocalRun> = {}): LocalRun => ({ state: "serving", model: "name-q4-k-m", error: null, log: [], context: 32768, slots: 4, started_by: "admin", started_at: 1, ...over });
  const drawn = (m: LocalModel, admission: Admission | null = null) =>
    renderToStaticMarkup(
      <LocalModelRow model={m} runtime admission={admission} onPause={() => undefined} onResume={() => undefined} onRemove={() => undefined} onStart={() => undefined} onStop={() => undefined} />,
    );

  it("offers Start for a model Kvasir can start, and folds its commands under Or run it yourself", () => {
    const html = drawn(model({ ...done, startable: true, run: null }));
    expect(html).toContain('<button type="button" class="button small">Start</button>');
    expect(html).not.toContain(">Stop</button>");
    expect(html).toContain('<details class="serve-self"><summary>Or run it yourself</summary>');
    expect(html).toContain("A model server started with one of these commands is added with Add a model.");
    expect(html).not.toContain("Kvasir runs no model:");
  });

  it("says how a serving model serves and whether Kvasir admitted it, and offers Stop", () => {
    const html = drawn(model({ ...done, startable: true, run: run() }), { tone: "blocked", words: "refused on 15 Sept", detail: "failed tool calls" });
    expect(html).toContain("serving</span>");
    expect(html).toContain("Serving as name-q4-k-m, with 32,768 tokens of context and 4 slots.");
    expect(html).toContain("refused on 15 Sept</span>");
    expect(html).toContain("failed tool calls");
    expect(html).toContain(">Stop</button>");
    expect(html).not.toContain(">Start</button>");
  });

  it("offers Stop while a model loads", () => {
    const html = drawn(model({ ...done, startable: true, run: run({ state: "starting", context: null, slots: null }) }));
    expect(html).toContain("loading</span>");
    expect(html).toContain("Loading into llama.cpp as name-q4-k-m.");
    expect(html).toContain(">Stop</button>");
  });

  it("says why a model did not start, with what llama.cpp logged behind a disclosure, and offers Start again", () => {
    const log = ["[58497] E gguf_init_from_file: failed to open GGUF file", "[58497] E srv load_model: failed to load model"];
    const html = drawn(model({ ...done, startable: true, run: run({ state: "failed", error: "llama.cpp ended with exit code 1", log, context: null, slots: null }) }));
    expect(html).toContain("did not start</span>");
    expect(html).toContain("llama.cpp ended with exit code 1.");
    expect(html).toContain('<details class="failure-raw local-log"><summary>What llama.cpp logged</summary>');
    expect(html).toContain(`${log[0]}\n${log[1]}`);
    expect(html).toContain(">Start</button>");
    expect(drawn(model({ ...done, startable: true, run: run({ state: "failed", error: null, log: [] }) }))).toContain("It did not start, and llama.cpp said nothing more.");
  });

  it("keeps the commands open under Or run it yourself for a model Kvasir cannot start", () => {
    const html = drawn(model({ ...done, startable: false, run: null }));
    expect(html).not.toContain(">Start</button>");
    expect(html).toContain('<span class="label">Or run it yourself</span>');
    expect(html).toContain("Kvasir starts only a GGUF model: start a model server with one of these commands, then add it with Add a model.");
    expect(html).not.toContain("<details");
  });
});
