// SPDX-License-Identifier: AGPL-3.0-only
// A local model's row as it draws: a download under way with its bar, how far
// it is and a pause; a failed one with its error and a resume; a downloaded
// one with the commands a model server runs it with, each to copy, and the
// line that says Kvasir runs no model.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LocalModel } from "./kvasir";
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
    expect(row(model({ state: "done" }))).toContain("knows no command for these files");
  });
});
