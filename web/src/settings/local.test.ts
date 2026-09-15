// SPDX-License-Identifier: AGPL-3.0-only
// Local models: sizes as a person reads them, each state's tag, bar and
// actions, when the list is read again, what the download dialog asks and
// when it may download, each refusal in words, and a model started on
// llama.cpp (record 24).

import { describe, expect, it } from "vitest";
import type { AdmissionRecord, Backend, LocalLookup, LocalModel, LocalRefusal, LocalRun, LocalRuntime, LocalState, RunState } from "./kvasir";
import {
  actionsOf,
  askedBytes,
  askOf,
  askRefusal,
  barOf,
  bytesWords,
  defaultChoice,
  downloadable,
  downloadAsk,
  downloadChoiceWords,
  EMPTY_DRAFT,
  fileChoices,
  fingerprint,
  fitWords,
  foundWords,
  localFacts,
  localName,
  localOrder,
  localTag,
  locationRefusal,
  modelTag,
  patternsOf,
  percentOf,
  progressWords,
  quantizationOf,
  queuedWords,
  refusalWords,
  removedWords,
  removeWords,
  replaceWords,
  revisionWords,
  roomLine,
  roomWords,
  runActionsOf,
  runningBesides,
  runsKey,
  runtimeLabel,
  runtimeLine,
  runtimeTag,
  runTag,
  sentence,
  servedAdmission,
  stale,
  started,
  startedWords,
  starting,
  startRefusalWords,
  stopFirstWords,
  stoppedWords,
  tokenReady,
  underWay,
} from "./local";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const GIB = 2 ** 30;
const PATH = `/srv/models/owner--name/${COMMIT}`;

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

const lookup = (over: Partial<LocalLookup> = {}): LocalLookup => ({
  repo: "owner/name",
  revision: "main",
  commit: COMMIT,
  include: [],
  files: [{ path: "name-Q4_K_M.gguf", size: 2 * GIB, sha256: null }],
  bytes_total: 2 * GIB,
  ...over,
});

const refusal = (code: string | null, message: string, over: Partial<LocalRefusal> = {}): LocalRefusal => ({
  status: 400,
  code,
  message,
  free_bytes: null,
  needed_bytes: null,
  ...over,
});

describe("sizes and progress", () => {
  it("says a size in the unit a person reads it in, to a tenth", () => {
    expect(bytesWords(0)).toBe("0 bytes");
    expect(bytesWords(1)).toBe("1 byte");
    expect(bytesWords(1023)).toBe("1,023 bytes");
    expect(bytesWords(1536)).toBe("1.5 KiB");
    expect(bytesWords(1_000_000)).toBe("976.6 KiB");
    expect(bytesWords(256 * 2 ** 20)).toBe("256 MiB");
    expect(bytesWords(17_300_000_000)).toBe("16.1 GiB");
    // what rounds to 1,024 of one unit reads as 1 of the next
    expect(bytesWords(GIB - 1)).toBe("1 GiB");
    expect(bytesWords(2 ** 40)).toBe("1 TiB");
    expect(bytesWords(-5)).toBe("0 bytes");
    expect(bytesWords(Number.NaN)).toBe("0 bytes");
  });

  it("counts a download in whole percent, and 100 only once every byte is there", () => {
    expect(percentOf(0, 100)).toBe(0);
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(999, 1000)).toBe(99);
    expect(percentOf(1000, 1000)).toBe(100);
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(-1, 10)).toBe(0);
  });
});

describe("a model's row", () => {
  it("tags each state with its tone", () => {
    const states: LocalState[] = ["queued", "downloading", "paused", "done", "failed"];
    expect(states.map(modelTag)).toEqual([
      { tone: "neutral", words: "queued" },
      { tone: "brand", words: "downloading" },
      { tone: "caution", words: "paused" },
      { tone: "ok", words: "downloaded" },
      { tone: "blocked", words: "failed" },
    ]);
  });

  it("offers a pause while a download is queued or under way, a resume once paused or failed, and a removal always", () => {
    expect(actionsOf("queued")).toEqual(["pause", "remove"]);
    expect(actionsOf("downloading")).toEqual(["pause", "remove"]);
    expect(actionsOf("paused")).toEqual(["resume", "remove"]);
    expect(actionsOf("failed")).toEqual(["resume", "remove"]);
    expect(actionsOf("done")).toEqual(["remove"]);
  });

  it("reads the list again only while a model is queued or downloading", () => {
    expect(underWay([])).toBe(false);
    expect(underWay([model({ state: "done" }), model({ state: "paused" }), model({ state: "failed" })])).toBe(false);
    expect(underWay([model({ state: "done" }), model({ state: "queued" })])).toBe(true);
    expect(underWay([model({ state: "downloading" })])).toBe(true);
  });

  it("draws a bar while a model downloads or is paused, and says how far each state is", () => {
    const half = { bytes_done: 8 * GIB };
    expect(barOf(model({ state: "downloading", ...half }))).toBe(50);
    expect(barOf(model({ state: "paused", ...half }))).toBe(50);
    expect(barOf(model({ state: "queued", ...half }))).toBeNull();
    expect(barOf(model({ state: "done", bytes_done: 16 * GIB }))).toBeNull();
    expect(progressWords(model({ state: "downloading", ...half }))).toBe("8 GiB of 16 GiB · 50%");
    expect(progressWords(model({ state: "paused", bytes_done: 4 * GIB }))).toBe("4 GiB of 16 GiB · 25%");
    expect(progressWords(model())).toBe("16 GiB");
    expect(progressWords(model(half))).toBe("8 GiB of 16 GiB");
    expect(progressWords(model({ state: "done", ...half }))).toBe("16 GiB");
    expect(progressWords(model({ state: "failed", ...half }))).toBe("8 GiB of 16 GiB");
    expect(progressWords(model({ state: "failed" }))).toBe("16 GiB");
  });

  it("names the revision with a short commit, and labels each command by the server it starts", () => {
    expect(revisionWords(model())).toBe("main, commit 0123456");
    expect(revisionWords(model({ revision: COMMIT }))).toBe("commit 0123456");
    expect(["llama.cpp", "ollama", "sglang", "vllm", "another"].map(runtimeLabel)).toEqual(["llama.cpp", "Ollama Modelfile", "SGLang", "vLLM", "another"]);
  });

  it("says before a removal what goes and how much room comes back, and after it what is free again", () => {
    expect(removeWords(model({ state: "done", bytes_done: 16 * GIB }))).toEqual([
      `Its files are deleted from ${PATH}, and 16 GiB comes back.`,
      "A model server started on these files can no longer read them.",
    ]);
    expect(removeWords(model({ state: "downloading", bytes_done: 2 * GIB }))).toEqual(["Its download stops.", `What it downloaded so far is deleted from ${PATH}, and 2 GiB comes back.`]);
    expect(removeWords(model({ state: "paused", bytes_done: 2 * GIB }))).toEqual([`What it downloaded so far is deleted from ${PATH}, and 2 GiB comes back.`]);
    expect(removeWords(model())).toEqual(["Nothing of it is downloaded yet, so it only leaves the list."]);
    expect(removedWords(model({ state: "done" }))).toBe("owner/name is removed, and 16 GiB is free again.");
    expect(removedWords(model())).toBe("owner/name is removed.");
    expect(queuedWords(model())).toBe("owner/name is queued, 16 GiB.");
  });
});

describe("the token", () => {
  it("says which token Kvasir takes", () => {
    expect(tokenReady(" hf_abcdefgh ")).toBe(true);
    expect(tokenReady("hf_abc")).toBe(false);
    expect(tokenReady("hf_abc defgh")).toBe(false);
  });
});

describe("the download dialog", () => {
  it("reads the patterns one a line or separated by commas, each once", () => {
    expect(patternsOf("")).toEqual([]);
    expect(patternsOf("*Q4_K_M.gguf\n config.json , *.json,\n\n*Q4_K_M.gguf\r\n")).toEqual(["*Q4_K_M.gguf", "config.json", "*.json"]);
  });

  it("asks Kvasir with the name trimmed, main where no revision is typed, and the patterns only where there are some", () => {
    expect(askOf({ repo: " owner/name ", revision: "", include: " \n" })).toEqual({ repo: "owner/name", revision: "main" });
    expect(askOf({ repo: "owner/name", revision: " v1.0 ", include: "*.gguf, config.json" })).toEqual({ repo: "owner/name", revision: "v1.0", include: ["*.gguf", "config.json"] });
  });

  it("looks a model up once it is named owner/name, with a revision and patterns Kvasir takes", () => {
    expect(askRefusal(EMPTY_DRAFT)).toBe("a model is named as the hub names it, owner/name");
    const d = { ...EMPTY_DRAFT, repo: "owner/name" };
    expect(askRefusal(d)).toBeNull();
    const named = "a model's name is owner/name, in letters, digits, dots, dashes and underscores";
    expect(askRefusal({ ...d, repo: "name" })).toBe(named);
    expect(askRefusal({ ...d, repo: "https://example.org/owner/name" })).toBe(named);
    expect(askRefusal({ ...d, revision: "a branch" })).toBe("a revision is a branch, a tag or a commit, with no spaces");
    expect(askRefusal({ ...d, include: Array.from({ length: 65 }, (_, i) => `*${i}.gguf`).join("\n") })).toBe("at most 64 patterns");
    expect(askRefusal({ ...d, include: "a".repeat(257) })).toBe("a pattern is at most 256 characters");
  });

  it("downloads only after a look-up that answered for exactly the inputs shown and found files", () => {
    const d = { ...EMPTY_DRAFT, repo: "owner/name", include: "*Q4_K_M.gguf" };
    const found = { print: fingerprint(d), lookup: lookup({ include: ["*Q4_K_M.gguf"] }) };
    expect(downloadable(d, null)).toBe(false);
    expect(downloadable(d, found)).toBe(true);
    expect(stale(d, found)).toBe(false);
    expect(stale(d, null)).toBe(false);
    // main typed or left empty, and the same pattern written another way, ask the same
    expect(downloadable({ ...d, revision: "main", include: " *Q4_K_M.gguf,\n" }, found)).toBe(true);
    const changed = { ...d, include: "*Q8_0.gguf" };
    expect(downloadable(changed, found)).toBe(false);
    expect(stale(changed, found)).toBe(true);
    expect(downloadable({ ...d, revision: "v2" }, found)).toBe(false);
    expect(downloadable(d, { ...found, lookup: lookup({ files: [], bytes_total: 0 }) })).toBe(false);
  });

  it("says what a look-up found, and whether it fits where downloads go", () => {
    const two = [
      { path: "name-Q4_K_M.gguf", size: 1024, sha256: null },
      { path: "config.json", size: 512, sha256: null },
    ];
    expect(foundWords(lookup({ files: two, bytes_total: 1536 }))).toBe("2 files, 1.5 KiB in all, at main, commit 0123456.");
    expect(foundWords(lookup())).toBe("One file, 2 GiB in all, at main, commit 0123456.");
    expect(foundWords(lookup({ files: [], bytes_total: 0, include: ["*Q4_K_M.gguf"] }))).toBe("No file matches *Q4_K_M.gguf.");
    expect(foundWords(lookup({ files: [], bytes_total: 0, include: ["*Q4_K_M.gguf", "*.json"] }))).toBe("No file matches any of *Q4_K_M.gguf, *.json.");
    expect(foundWords(lookup({ files: [], bytes_total: 0 }))).toBe("The Hugging Face Hub lists no file for this model at that revision.");
    expect(roomWords(4 * GIB, null)).toBeNull();
    expect(roomWords(4 * GIB, 100 * GIB)).toEqual({ fits: true, words: "100 GiB free" });
    expect(roomWords(4 * GIB, 4.5 * GIB)).toEqual({
      fits: false,
      words: "Not enough room where downloads go: 4.5 GiB free, 5 GiB needed.",
    });
  });
});

describe("a refusal in words", () => {
  const at = { token: false, patterns: 0 };

  it("says a refusal for room with both sizes, and Kvasir's own words where it carries none", () => {
    expect(refusalWords(refusal("no_space", "/srv/models has 10.0 GiB free", { status: 507, free_bytes: 10 * GIB, needed_bytes: 17 * GIB }), at)).toBe(
      "Not enough room where downloads go: 10 GiB free, 17 GiB needed.",
    );
    expect(refusalWords(refusal("no_space", "/srv/models has 10.0 GiB free", { status: 507 }), at)).toBe("/srv/models has 10.0 GiB free.");
  });

  it("points a gated model to the token, a model held already to its row, and says the rest in words", () => {
    expect(refusalWords(refusal("needs_token", "the Hugging Face Hub refused owner/name", { status: 422 }), at)).toBe(
      "This model is gated or private, so it needs a Hugging Face token. Set one above, then try again.",
    );
    expect(refusalWords(refusal("needs_token", "the Hugging Face Hub refused the token for owner/name", { status: 422 }), { ...at, token: true })).toBe(
      "The Hugging Face Hub refused the token for this model. The token's account needs access to it, and a gated model needs its terms accepted on the hub.",
    );
    expect(refusalWords(refusal("conflict", "model 3 holds owner/name at 0123456789ab in /srv/models already", { status: 409 }), at)).toBe(
      "This model is in the list already, at the same commit where downloads go. Resume it there, or remove it first to download it again.",
    );
    expect(refusalWords(refusal("not_on_hub", "the Hugging Face Hub has no model owner/name at main", { status: 422 }), at)).toBe(
      "The Hugging Face Hub has no such model at that revision. Check the name, as owner/name, and the revision.",
    );
    expect(refusalWords(refusal("nothing_to_download", "no file matches", { status: 422 }), { ...at, patterns: 1 })).toBe(
      "No file of this model matches the patterns. Change them, or leave them empty to download every file.",
    );
    expect(refusalWords(refusal("nothing_to_download", "no file", { status: 422 }), at)).toBe("The Hugging Face Hub lists no file for this model at that revision.");
    expect(refusalWords(refusal("hub", "the Hugging Face Hub could not be reached: fetch failed", { status: 502 }), at)).toBe(
      "The Hugging Face Hub could not be reached: fetch failed. Try again in a moment.",
    );
    expect(refusalWords(refusal("bad_request", "revision: a branch, a tag or a forty-character commit"), at)).toBe("Revision: a branch, a tag or a forty-character commit.");
    expect(refusalWords(refusal(null, "", { status: 500 }), at)).toBe("Kvasir answered 500.");
  });

  it("makes a sentence of Kvasir's words, leaving a file's name or a path as written", () => {
    expect(sentence(" /srv/models is a file, not a folder ")).toBe("/srv/models is a file, not a folder.");
    expect(sentence("the download stopped.")).toBe("The download stopped.");
    expect(sentence("model.safetensors does not match the sha256 the hub lists")).toBe("model.safetensors does not match the sha256 the hub lists.");
    expect(sentence("token: a Hugging Face access token")).toBe("Token: a Hugging Face access token.");
    expect(sentence("  ")).toBe("");
  });
});

describe("where downloads go, changed", () => {
  it("saves an absolute path other than the location already set, and leaves the rest to Kvasir's words", () => {
    expect(locationRefusal("", "/srv/models")).toBe("a location is a folder's path");
    expect(locationRefusal("models", "/srv/models")).toBe("a location is an absolute path, starting at /");
    expect(locationRefusal("~/models", "/srv/models")).toBe("a location is an absolute path, starting at /");
    // the location already set says nothing, and saves nothing
    expect(locationRefusal(" /srv/models ", "/srv/models")).toBe("");
    expect(locationRefusal("/mnt/models", "/srv/models")).toBeNull();
  });
});

describe("a model started on llama.cpp", () => {
  const done: Partial<LocalModel> = { state: "done", bytes_done: 16 * GIB, finished_at: 1 };
  const run = (over: Partial<LocalRun> = {}): LocalRun => ({ state: "serving", model: "name-q4-k-m", error: null, log: [], context: 32768, slots: 4, started_by: "admin", started_at: 1, ...over });
  const runtime: LocalRuntime = { build: "b10964", variant: "ubuntu-vulkan-x64", reachable: true, serving: 1 };

  it("names the runtime the install has, and whether it answers", () => {
    expect(runtimeLine(runtime)).toBe("llama.cpp b10964, ubuntu-vulkan-x64");
    expect(runtimeTag(runtime)).toEqual({ tone: "ok", words: "answers" });
    expect(runtimeTag({ ...runtime, reachable: false })).toEqual({ tone: "blocked", words: "does not answer" });
  });

  it("offers Stop while a model loads or serves, Start where Kvasir can start it, and nothing where it cannot", () => {
    expect(runActionsOf(model({ ...done, startable: true, run: null }))).toEqual(["start"]);
    expect(runActionsOf(model({ ...done, startable: true, run: run({ state: "failed" }) }))).toEqual(["start"]);
    expect(runActionsOf(model({ ...done, startable: true, run: run({ state: "stopped" }) }))).toEqual(["start"]);
    expect(runActionsOf(model({ ...done, startable: true, run: run({ state: "starting" }) }))).toEqual(["stop"]);
    expect(runActionsOf(model({ ...done, startable: true, run: run() }))).toEqual(["stop"]);
    expect(runActionsOf(model({ ...done, startable: false }))).toEqual([]);
    // a Kvasir before record 24 says nothing of either
    expect(runActionsOf(model(done))).toEqual([]);
  });

  it("tags each run, reads the list again sooner while a model loads, and names the model another start stops", () => {
    const states: RunState[] = ["starting", "serving", "stopped", "failed"];
    expect(states.map((state) => runTag(run({ state })))).toEqual([
      { tone: "brand", words: "loading" },
      { tone: "ok", words: "serving" },
      { tone: "neutral", words: "stopped" },
      { tone: "blocked", words: "did not start" },
    ]);
    const serving = model({ ...done, id: 1, repo: "owner/one", run: run() });
    const loading = model({ ...done, id: 2, repo: "owner/two", run: run({ state: "starting" }) });
    const idle = model({ ...done, id: 3, repo: "owner/three", startable: true, run: null });
    expect(starting([serving, idle])).toBe(false);
    expect(starting([serving, loading])).toBe(true);
    expect(started(serving)).toBe(true);
    expect(started(loading)).toBe(true);
    expect(started(idle)).toBe(false);
    expect(runningBesides([serving, idle], 3)).toBe(serving);
    expect(runningBesides([serving, idle], 1)).toBeNull();
    expect(replaceWords(idle, serving)).toBe("llama.cpp runs one model at a time, so starting owner/three stops owner/one.");
    expect(runsKey([serving, idle])).toBe(runsKey([serving, idle]));
    expect(runsKey([serving, idle])).not.toBe(runsKey([model({ ...serving, run: run({ state: "failed" }) }), idle]));
  });

  it("says whether Kvasir admitted a serving model, from the backend that serves it", () => {
    const now = Date.parse("2026-09-15T12:00:00Z");
    const entry = { id: "name-q4-k-m", name: "name", reasoning: false, context_window: 32768, max_tokens: 4096, admitted: true };
    const backend: Backend = { id: "llama-cpp", kind: "openai-completions", locality: "local", provider: null, credential: null, models: ["name-q4-k-m"], health: { warming: false }, added_at: now - 2 * 3_600_000, entries: [entry] };
    expect(servedAdmission(run({ state: "starting" }), [backend], [], now)).toBeNull();
    expect(servedAdmission(run(), null, null, now)).toBeNull();
    expect(servedAdmission(run(), [], [], now)).toEqual({ tone: "caution", words: "being added", on: null, detail: "held as a model in a moment" });
    expect(servedAdmission(run(), [{ ...backend, health: { warming: true } }], [], now)).toEqual({ tone: "caution", words: "warming", on: null, detail: "checked once it has answered" });
    expect(servedAdmission(run(), [backend], [], now)).toEqual({ tone: "ok", words: "admitted", on: null, detail: null });
    const refusedRecord: AdmissionRecord = { id: 1, backend: "llama-cpp", model: "name-q4-k-m", runtime: { name: "llama.cpp", version: "b10964", build: "" }, at: now - 3_600_000, passed: false, checks: [{ name: "tool_calls", passed: false }] };
    expect(servedAdmission(run(), [{ ...backend, entries: [{ ...entry, admitted: false }] }], [refusedRecord], now)).toMatchObject({ tone: "blocked", detail: "failed tool calls" });
  });

  it("says a refusal to start in words a person can act on, and why a started model is not removed", () => {
    const at = (code: string) => refusal(code, "refused", { status: 409 });
    expect(startRefusalWords(at("no_runtime"))).toBe("This install runs no llama.cpp for Kvasir to start a model on. Start a model server with one of the model's commands, then add it with Add a model.");
    expect(startRefusalWords(at("not_downloaded"))).toBe("This model is not downloaded yet. Start it once its download has finished.");
    expect(startRefusalWords(at("not_gguf"))).toBe("Kvasir starts only a GGUF model. Start a model server on these files with one of their commands, then add it with Add a model.");
    expect(startRefusalWords(at("runtime_unreachable"))).toBe("llama.cpp on this machine does not answer, so Kvasir could not start the model. Start it again once llama.cpp answers.");
    expect(startRefusalWords(refusal("bad_request", "the model's file went missing"))).toBe("The model's file went missing.");
    expect(startRefusalWords(refusal(null, "", { status: 500 }))).toBe("Kvasir answered 500.");
    expect(startedWords(model())).toBe("owner/name is loading into llama.cpp.");
    expect(stoppedWords(model())).toBe("owner/name is stopped.");
    expect(stopFirstWords(model())).toBe("owner/name is started on llama.cpp. Stop it first, then remove it.");
  });
});

describe("a download under Add a model (record 25)", () => {
  const file = (path: string, size: number) => ({ path, size, sha256: null });
  const files = [
    file("README.md", 4096),
    file("Qwen3.6-27B-Q8_0/Qwen3.6-27B-Q8_0-00001-of-00002.gguf", 15 * GIB),
    file("Qwen3.6-27B-Q8_0/Qwen3.6-27B-Q8_0-00002-of-00002.gguf", 13 * GIB),
    file("Qwen3.6-27B-Q4_K_M.gguf", 16 * GIB),
    file("Qwen3.6-27B-UD-Q5_K_XL.gguf", 19 * GIB),
    file("mmproj-F16.gguf", GIB),
  ];
  const card = [{ name: "NVIDIA GeForce RTX 4090", memory_gb: 23.99 }];

  it("says what downloading is, by the runtime the install has", () => {
    expect(downloadChoiceWords({ build: "b10964", variant: "ubuntu-vulkan-x64", reachable: true, serving: null })).toBe("Hugging Face Hub · llama.cpp here · stays in your systems");
    expect(downloadChoiceWords(null)).toBe("Hugging Face Hub · for a model server of yours · stays in your systems");
  });

  it("offers each quantization of a GGUF model once, with the parts of a split file together, and no vision projector", () => {
    expect(fileChoices(files)).toEqual([
      { key: "Qwen3.6-27B-Q4_K_M.gguf", label: "Q4_K_M", paths: ["Qwen3.6-27B-Q4_K_M.gguf"], bytes: 16 * GIB },
      { key: "Qwen3.6-27B-UD-Q5_K_XL.gguf", label: "UD-Q5_K_XL", paths: ["Qwen3.6-27B-UD-Q5_K_XL.gguf"], bytes: 19 * GIB },
      {
        key: "Qwen3.6-27B-Q8_0/Qwen3.6-27B-Q8_0.gguf",
        label: "Q8_0",
        paths: ["Qwen3.6-27B-Q8_0/Qwen3.6-27B-Q8_0-00001-of-00002.gguf", "Qwen3.6-27B-Q8_0/Qwen3.6-27B-Q8_0-00002-of-00002.gguf"],
        bytes: 28 * GIB,
      },
    ]);
    expect(fileChoices([file("model.safetensors", GIB), file("config.json", 1)])).toEqual([]);
    expect(["gemma-3-12b-it-Q5_K_M.gguf", "model-IQ2_XXS.gguf", "model.BF16.gguf", "tiny.gguf"].map(quantizationOf)).toEqual(["Q5_K_M", "IQ2_XXS", "BF16", "tiny"]);
    // two files of one quantization go by their names
    expect(fileChoices([file("a-Q4_K_M.gguf", 1), file("b-Q4_K_M.gguf", 2)]).map((c) => c.label)).toEqual(["a-Q4_K_M", "b-Q4_K_M"]);
  });

  it("says whether a file fits the card, and opens on Q4_K_M where it fits, else the largest that fits", () => {
    const choices = fileChoices(files);
    expect(fitWords(16 * GIB, card)).toEqual({ tone: "ok", words: "fits the card", title: null });
    expect(fitWords(28 * GIB, card)).toEqual({ tone: "caution", words: "larger than the card", title: "runs on the processor, slowly" });
    expect(fitWords(28 * GIB, [])).toBeNull();
    expect(defaultChoice(choices, card)).toBe("Qwen3.6-27B-Q4_K_M.gguf");
    expect(defaultChoice(choices.filter((c) => c.label !== "Q4_K_M"), card)).toBe("Qwen3.6-27B-UD-Q5_K_XL.gguf");
    expect(defaultChoice(choices, [{ name: "small", memory_gb: 8 }])).toBeNull();
    expect(defaultChoice(choices.filter((c) => c.label !== "Q4_K_M"), [])).toBeNull();
    expect(defaultChoice(choices, [])).toBe("Qwen3.6-27B-Q4_K_M.gguf");
  });

  it("measures a file against the largest card, and says the memory of all the cards where it fits only across them", () => {
    const two = [
      { name: "NVIDIA GeForce RTX 4080", memory_gb: 16 },
      { name: "NVIDIA GeForce RTX 4080", memory_gb: 16 },
      { name: "Intel UHD Graphics", memory_gb: 0 },
    ];
    expect(fitWords(12 * GIB, two)).toEqual({ tone: "ok", words: "fits one card", title: null });
    expect(fitWords(28 * GIB, two)).toEqual({ tone: "ok", words: "fits 2 cards, 32 GB", title: null });
    expect(fitWords(40 * GIB, two)).toEqual({ tone: "caution", words: "larger than the cards", title: "runs on the processor, slowly" });
    expect(fitWords(GIB, [{ name: "Intel UHD Graphics", memory_gb: 0 }])).toBeNull();
    expect(defaultChoice(fileChoices(files).filter((c) => c.label !== "Q4_K_M"), two)).toBe("Qwen3.6-27B-Q8_0/Qwen3.6-27B-Q8_0.gguf");
  });

  it("downloads the chosen file of a GGUF model, every file the patterns choose of another, and nothing before a look-up", () => {
    const d = { ...EMPTY_DRAFT, repo: "owner/name" };
    const found = { print: fingerprint(d), lookup: lookup({ files, bytes_total: 64 * GIB }) };
    expect(downloadAsk(d, null, null)).toBeNull();
    expect(downloadAsk(d, found, null)).toBeNull();
    expect(downloadAsk(d, found, "Qwen3.6-27B-Q8_0/Qwen3.6-27B-Q8_0.gguf")).toEqual({
      repo: "owner/name",
      revision: "main",
      include: ["Qwen3.6-27B-Q8_0/Qwen3.6-27B-Q8_0-00001-of-00002.gguf", "Qwen3.6-27B-Q8_0/Qwen3.6-27B-Q8_0-00002-of-00002.gguf"],
    });
    expect(downloadAsk({ ...d, repo: "owner/other" }, found, "Qwen3.6-27B-Q4_K_M.gguf")).toBeNull();
    const plain = { print: fingerprint(d), lookup: lookup({ files: [file("model.safetensors", GIB)], bytes_total: GIB }) };
    expect(downloadAsk(d, plain, null)).toEqual({ repo: "owner/name", revision: "main" });
    expect(askedBytes(found.lookup, "Qwen3.6-27B-Q4_K_M.gguf")).toBe(16 * GIB);
    expect(askedBytes(found.lookup, null)).toBe(64 * GIB);
  });
});

describe("a local model's card (record 25)", () => {
  const done: Partial<LocalModel> = { state: "done", bytes_done: 16 * GIB, finished_at: 1 };
  const run = (over: Partial<LocalRun> = {}): LocalRun => ({ state: "serving", model: "name-q4-k-m", error: null, log: [], context: 32768, slots: 4, started_by: "admin", started_at: 1, ...over });

  it("names a started model as llama.cpp serves it, and any other by its name on the hub", () => {
    expect(localName(model({ ...done, run: run() }))).toBe("name-q4-k-m");
    expect(localName(model({ ...done, run: run({ state: "failed" }) }))).toBe("owner/name");
    expect(localName(model())).toBe("owner/name");
  });

  it("says what is known of it as a hover title, and one tag for how it runs or where its download stands", () => {
    expect(localFacts(model({ ...done, run: run() }))).toBe("main, commit 0123456 · 16 GiB · 32,768 tokens");
    expect(localFacts(model({ state: "downloading" }))).toBe("main, commit 0123456 · 16 GiB");
    expect(localTag(model({ ...done, run: run() }))).toEqual({ tone: "ok", words: "serving", title: null });
    expect(localTag(model({ ...done, run: run() }), { tone: "ok", words: "admitted", on: "14 Sept", detail: null })).toEqual({ tone: "ok", words: "serving", title: "admitted on 14 Sept" });
    expect(localTag(model({ ...done, run: run() }), { tone: "blocked", words: "refused", on: "15 Sept", detail: "failed tool calls" })).toEqual({ tone: "blocked", words: "refused", title: "refused on 15 Sept: failed tool calls" });
    expect(localTag(model({ ...done, run: run({ state: "starting" }) }))).toEqual({ tone: "brand", words: "loading", title: "loading as name-q4-k-m" });
    expect(localTag(model({ ...done, run: run({ state: "failed", error: "exit code 1" }) }))).toEqual({ tone: "blocked", words: "did not start", title: "Exit code 1." });
    expect(localTag(model({ ...done, run: run({ state: "stopped" }) }))).toEqual({ tone: "ok", words: "downloaded", title: null });
    expect(localTag(model({ state: "failed", error: "fetch failed" }))).toEqual({ tone: "blocked", words: "failed", title: "Fetch failed." });
    expect(localTag(model({ state: "paused" }))).toEqual({ tone: "caution", words: "paused", title: null });
  });

  it("puts the model llama.cpp serves first, and says the room where downloads go", () => {
    const one = model({ id: 1, repo: "owner/one" });
    const two = model({ ...done, id: 2, repo: "owner/two", run: run() });
    expect(localOrder([one, two]).map((m) => m.id)).toEqual([2, 1]);
    expect(roomLine(412 * GIB)).toBe("412 GiB free");
    expect(roomLine(null)).toBe("free space unknown");
  });
});
