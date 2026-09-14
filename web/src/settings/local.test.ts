// SPDX-License-Identifier: AGPL-3.0-only
// Local models: sizes as a person reads them, each state's tag, bar and
// actions, when the list is read again, what the download dialog asks and
// when it may download, and each refusal in words.

import { describe, expect, it } from "vitest";
import type { LocalLookup, LocalModel, LocalRefusal, LocalState } from "./kvasir";
import {
  actionsOf,
  askOf,
  askRefusal,
  barOf,
  bytesWords,
  downloadable,
  EMPTY_DRAFT,
  fingerprint,
  foundWords,
  freeWords,
  locationRefusal,
  modelTag,
  patternsOf,
  percentOf,
  progressWords,
  queuedWords,
  refusalWords,
  removedWords,
  removeWords,
  revisionWords,
  roomWords,
  runtimeLabel,
  sentence,
  stale,
  tokenReady,
  tokenTag,
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
    expect(progressWords(model({ state: "downloading", ...half }))).toBe("8 GiB of 16 GiB, 50%");
    expect(progressWords(model({ state: "paused", bytes_done: 4 * GIB }))).toBe("4 GiB of 16 GiB, 25%");
    expect(progressWords(model())).toBe("16 GiB in 3 files, waiting its turn");
    expect(progressWords(model(half))).toBe("8 GiB of 16 GiB, waiting its turn");
    expect(progressWords(model({ state: "done", files: 1 }))).toBe("16 GiB in one file");
    expect(progressWords(model({ state: "failed", ...half }))).toBe("8 GiB of 16 GiB when it stopped");
    expect(progressWords(model({ state: "failed" }))).toBe("16 GiB in 3 files");
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
    expect(queuedWords(model())).toBe(`owner/name is queued: 16 GiB in 3 files, into ${PATH}.`);
  });
});

describe("where downloads go, and the token", () => {
  it("says the room there, whether a token is set, and which token Kvasir takes", () => {
    expect(freeWords(412 * GIB)).toBe("412 GiB free");
    expect(freeWords(null)).toBe("Kvasir could not read the free space there.");
    expect(tokenTag(true)).toEqual({ tone: "ok", words: "set" });
    expect(tokenTag(false)).toEqual({ tone: "neutral", words: "not set" });
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
    expect(roomWords(4 * GIB, 100 * GIB)).toEqual({ fits: true, words: "100 GiB free where downloads go." });
    expect(roomWords(4 * GIB, 4.5 * GIB)).toEqual({
      fits: false,
      words: "There is not room for it where downloads go: 4.5 GiB free, and it needs 5 GiB, 1 GiB of that to spare. Free some space there, or change where new downloads go.",
    });
  });
});

describe("a refusal in words", () => {
  const at = { token: false, patterns: 0 };

  it("says a refusal for room with both sizes, and Kvasir's own words where it carries none", () => {
    expect(refusalWords(refusal("no_space", "/srv/models has 10.0 GiB free", { status: 507, free_bytes: 10 * GIB, needed_bytes: 17 * GIB }), at)).toBe(
      "There is not room for it where downloads go: 10 GiB free, and it needs 17 GiB, 1 GiB of that to spare. Free some space there, or change where new downloads go.",
    );
    expect(refusalWords(refusal("no_space", "/srv/models has 10.0 GiB free", { status: 507 }), at)).toBe("/srv/models has 10.0 GiB free.");
  });

  it("points a gated model to the token, a model held already to its row, and says the rest in words", () => {
    expect(refusalWords(refusal("needs_token", "the Hugging Face Hub refused owner/name", { status: 422 }), at)).toBe(
      "This model is gated or private, so it needs a Hugging Face token. Set one under Hugging Face token on the Kvasir page, then try again.",
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
