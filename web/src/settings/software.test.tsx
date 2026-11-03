// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Settings > Software (record 57 P5, Wave 7b spec 6.7; redesigned 2026-11-03
// so it needs no explanation): the page against the engine's shapes
// (./software.fixture), its tools grouped by the image they pin, their
// states in plain words, the card that says where tools live with its act,
// its acts by grant and door, and each door the page calls, with its method,
// path and body. Every name here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capsWith } from "../review/caps.fixture";
import { software, type SoftwarePlace } from "../ops/client";
import { forgetInstalled } from "../ops/Install";
import { tools } from "../ops/tools";
import { shortPrint } from "../ops/text";
import { settingsPages } from "./pages";
import {
  bareVersion,
  copyFor,
  failedChecks,
  foundWords,
  groupTools,
  inferKind,
  kindWords,
  licenceState,
  packFrom,
  pinnedError,
  pipelinesLine,
  placeCard,
  repositoryOf,
  softwareActs,
  softwareHrefFor,
  specError,
  statusTag,
  suggestedApp,
  suggestedSpec,
  suggestedTag,
  suggestedVersion,
  toolCounts,
  toolName,
  toolState,
  toolTitle,
  toolVersion,
  unmatched,
  verifiedWords,
} from "./software";
import { DCM2NIIX, DCM2NIIX_OLD, FIXTURE_NOW, FREESURFER_COPY, FS_APPS, FS_OLD_SANDBOX, FS_SANDBOX, FS_TAKEN, PLACE, PLACE_DOORS, PRODUCTION, PYMENT, SAMSEG, SEGCSVD, SHARED_PLACE, SHARED_TAKEN, SHARED_TOOLS, SOFTWARE_DOORS, STRAY_SIF, SYNTHSEG, SYNTHSEG_COPY } from "./software.fixture";
import { AcceptDialog, InstallDialog, RegisterDialog, SoftwareView } from "./SoftwarePage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADMIN = capsWith([...SOFTWARE_DOORS, ...PLACE_DOORS], ["install:see", "install:work", "pipelines:see", "places:see", "places:work"]);
const NO_PLACES = capsWith(SOFTWARE_DOORS, ["install:see", "install:work", "pipelines:see"]);
const SEER = capsWith([...SOFTWARE_DOORS, ...PLACE_DOORS], ["pipelines:see"]);
const people = [{ subject: "astrid@site", display: "Astrid" }];
const draw = (caps = ADMIN, place: SoftwarePlace = PLACE) => renderToStaticMarkup(<SoftwareView caps={caps} place={place} people={people} onChanged={() => undefined} now={FIXTURE_NOW} />);
/** The rows' titles in the order drawn. */
const titles = (html: string) => [...html.matchAll(/<div class="software-tool-name"><b>([^<]*)<\/b>/gu)].map((m) => m[1]);
/** What a row says of its state, by its title. */
const stateOf = (html: string, title: string) => {
  const at = html.indexOf(`<b>${title}</b>`);
  const from = html.indexOf('<div class="software-tool-state"><span>', at);
  return html.slice(from + '<div class="software-tool-state"><span>'.length, html.indexOf("</span>", from));
};
/** The page without its Details, which keep the engine's words. */
const outsideDetails = (html: string) => html.replace(/<details[\s\S]*?<\/details>/gu, "");

describe("the software place's words", () => {
  it("names the kind, the status and how a package came, for the Details", () => {
    expect(kindWords(SAMSEG)).toBe("image");
    expect(kindWords(PYMENT)).toBe("registered sandbox");
    expect(kindWords(DCM2NIIX)).toBe("program");
    expect(statusTag(SYNTHSEG)).toEqual({ words: "not installed", tone: "caution" });
    expect(statusTag(SEGCSVD)).toEqual({ words: "failed verification", tone: "caution" });
    expect(statusTag({ status: "update available" }).tone).toBe("brand");
    expect(statusTag({ ...SYNTHSEG, image_cached: true })).toEqual({ words: "image cached", tone: "ok", note: "adopted at the next run" });
  });

  it("says which check of a verification failed, in its own words", () => {
    expect(failedChecks(SEGCSVD)).toEqual([{ check: "fingerprint", said: "the image changed since it was installed: sha256 9e9e9e9e9e9e… was 7c7c7c7c7c7c…" }]);
    expect(verifiedWords(SEGCSVD, (s) => s)).toEqual({ words: "fingerprint failed", failed: true });
    expect(verifiedWords(PYMENT, () => "2 days ago")).toEqual({ words: "2 days ago", failed: false });
    expect(verifiedWords(SYNTHSEG, (s) => s).words).toBe("");
    expect(shortPrint(`sha256:${"ab".repeat(32)}`)).toBe("abababababab");
  });

  it("reads the licence: waiting for an acceptance, a missing site file, or accepted by a person by name", () => {
    const name = (p: string) => (p === "astrid@site" ? "Astrid" : p);
    expect(licenceState(SAMSEG, name, (s) => s)).toMatchObject({ words: "LicenseRef-FreeSurfer: terms not accepted", tone: "caution", accept: true, file: true });
    expect(licenceState(PYMENT, name, () => "18 Oct").words).toBe("CC-BY-NC-4.0: accepted by Astrid, 18 Oct");
    const accepted = { ...SAMSEG, licence: { ...SAMSEG.licence!, accepted: { by: "astrid@site", at: "2026-10-19T10:00:00Z" } } };
    expect(licenceState(accepted, name, (s) => s)).toMatchObject({ words: "LicenseRef-FreeSurfer: accepted; licence file missing", accept: false, file: true });
    expect(licenceState(SEGCSVD, name, (s) => s)).toMatchObject({ words: "GPL-3.0-only", accept: false });
  });

  it("checks what a person types: app@version and an image pinned by its digest", () => {
    expect(specError("synthseg@2.0")).toBeNull();
    expect(specError("synthseg")).toBe("name it as app@version");
    expect(specError("../x@1")).toBe("name it as app@version");
    expect(pinnedError(`docker.io/x/y@sha256:${"0".repeat(64)}`)).toBeNull();
    expect(pinnedError("docker.io/x/y:latest")).toMatch(/digest/u);
  });

  it("reads what a path is from its shape: an image pinned by its digest, a .sif file, else a folder", () => {
    expect(inferKind(`docker.io/x/y@sha256:${"0".repeat(64)}`)).toBe("image");
    expect(inferKind("/srv/tools/fs.sif")).toBe("sif");
    expect(inferKind("/srv/tools/FS.SIF")).toBe("sif");
    expect(inferKind("/srv/tools/freesurfer/8.2.0")).toBe("sandbox");
    expect(inferKind("")).toBe("sandbox");
  });

  it("finds a missing package's copy in the folder, the candidates no package matches, and a name from a base image", () => {
    const found = SHARED_PLACE.found!;
    expect(copyFor(SYNTHSEG, found)).toBe(SYNTHSEG_COPY);
    expect(copyFor(SAMSEG, found)).toBeNull();
    expect(copyFor(SYNTHSEG, [{ ...SYNTHSEG_COPY, registered: true }])).toBeNull();
    expect(copyFor(SYNTHSEG, undefined)).toBeNull();
    expect(unmatched(found)).toEqual([FREESURFER_COPY, STRAY_SIF]);
    expect(unmatched(null)).toEqual([]);
    expect(suggestedVersion("freesurfer/freesurfer:8.2.0")).toBe("freesurfer-8.2.0");
    expect(suggestedApp("freesurfer/freesurfer:7.4.1")).toBe("freesurfer");
    expect(suggestedApp("docker.io/example/synth seg:2.0")).toBe("synth-seg");
    expect(suggestedApp(`ghcr.io/kineuro/nils-lst-ai:1.2.0@sha256:${"0".repeat(64)}`)).toBe("nils-lst-ai");
    expect(suggestedApp(null)).toBe("");
    expect(suggestedTag("freesurfer/freesurfer:7.4.1")).toBe("7.4.1");
    expect(suggestedTag("example/tool")).toBe("");
    expect(suggestedSpec("freesurfer/freesurfer:7.4.1")).toBe("freesurfer@7.4.1");
    expect(suggestedSpec("example/tool")).toBe("tool@1");
    expect(suggestedSpec(null)).toBe("");
    expect(specError(suggestedSpec("freesurfer/freesurfer:7.4.1"))).toBeNull();
    expect(packFrom(SYNTHSEG)).toBe("synthseg@2");
    expect(packFrom({ pipelines: [] })).toBeUndefined();
  });

  it("is a Settings page for a person who may see the install or the pipelines, where the engine serves the door", () => {
    expect(settingsPages(ADMIN).map((p) => p.id)).toContain("software");
    expect(settingsPages(SEER).map((p) => p.id)).toContain("software");
    expect(settingsPages(capsWith(["GET /api/places"], ["install:see"])).map((p) => p.id)).not.toContain("software");
    expect(softwareHrefFor(ADMIN)).toBe("#settings/software");
    expect(softwareHrefFor(capsWith([], ["pipelines:see"]))).toBeNull();
    const none = softwareActs(SEER);
    expect(none.see).toBe(true);
    expect(none.install).toBe(false);
    expect(softwareActs(capsWith([], ["install:work", "install:see"])).see).toBe(false);
  });
});

describe("tools, not packages", () => {
  it("names a tool from the repository of its image, and its version without the tool's name", () => {
    expect(repositoryOf(`docker.io/freesurfer/freesurfer@sha256:${"0".repeat(64)}`)).toBe("freesurfer/freesurfer");
    expect(repositoryOf("ghcr.io/kineuro/nils-lst-ai:1.2.0")).toBe("kineuro/nils-lst-ai");
    expect(repositoryOf("localhost:5000/tool")).toBe("tool");
    expect(repositoryOf("antsx/ants")).toBe("antsx/ants");
    expect(repositoryOf(null)).toBeNull();
    const named = (source: string) => toolName({ kind: "image", app: "x", source, image: null, pinned: null });
    expect(named("docker.io/freesurfer/freesurfer@sha256:0")).toBe("FreeSurfer");
    expect(named("docker.io/antsx/ants@sha256:0")).toBe("ANTs");
    expect(named("docker.io/nipreps/mriqc@sha256:0")).toBe("MRIQC");
    expect(named("ghcr.io/kineuro/nils-lst-ai@sha256:0")).toBe("LST-AI");
    expect(named("docker.io/frheault/sf-lesionflow-segcsvd@sha256:0")).toBe("segcsvd");
    expect(named("ghcr.io/kineuro/nils-bodypart@sha256:0")).toBe("NILS body part model");
    expect(named("ghcr.io/kineuro/nils-postcontrast@sha256:0")).toBe("NILS post-contrast model");
    expect(named("ghcr.io/kineuro/nils-postcontrast-full@sha256:0")).toBe("NILS post-contrast model (full)");
    expect(named("ghcr.io/kineuro/nils-system1@sha256:0")).toBe("NILS System 1 model");
    expect(named("docker.io/someone/brain-tool@sha256:0")).toBe("brain-tool");
    expect(toolName(DCM2NIIX)).toBe("dcm2niix (the converter)");
    expect(toolName({ kind: "sandbox", app: "pyment", source: null, image: null, pinned: null })).toBe("pyment");
    expect(bareVersion("freesurfer-8.2.0")).toBe("8.2.0");
    expect(bareVersion("ants-2.6.2")).toBe("2.6.2");
    expect(bareVersion("v1.0.20260724")).toBe("v1.0.20260724");
    expect(bareVersion("2.6.5.dev1-gfdce4d2")).toBe("2.6.5.dev1-gfdce4d2");
    expect(bareVersion("nils-bodypart-v1.0")).toBe("v1.0");
    expect(bareVersion("rc03")).toBe("rc03");
    expect(toolVersion([{ version: "freesurfer-8.2.0" }, { version: "freesurfer-8.2.0" }])).toBe("8.2.0");
    expect(toolVersion([{ version: "8.2.0-1" }, { version: "freesurfer-8.2.0" }])).toBe("8.2.0");
  });

  it("groups the packages by the image they pin: a fresh install's 16 packages are 10 tools, FreeSurfer one of them for seven pipelines", () => {
    const groups = groupTools(PRODUCTION.packages);
    expect(groups.map(toolTitle)).toEqual([
      "FreeSurfer 8.2.0",
      "ANTs 2.6.5.dev1-gfdce4d2",
      "ANTs 2.6.2",
      "MRIQC 24.0.2",
      "LST-AI 1.2.0",
      "segcsvd rc03",
      "NILS body part model 1.0.0",
      "NILS post-contrast model 1.0.0",
      "NILS System 1 model 1.0.0",
      "dcm2niix (the converter)",
    ]);
    expect(groups[0].packages).toHaveLength(7);
    expect(pipelinesLine(groups[0])).toBe(`7 pipelines: ${FS_APPS.join(", ")}`);
    expect(pipelinesLine(groups[4])).toBe("1 pipeline: lst-ai");
    expect(pipelinesLine(groups[9])).toBe("every pipeline that reads DICOM");
    expect(groups[9].converter).toBe(true);
    // a package with no pinned image keys by its digest, then its source's, then its spec
    expect(groupTools([SAMSEG, SEGCSVD, PYMENT]).map((g) => g.key)).toEqual([SAMSEG.digest, "segcsvd@1.0", "pyment@5.1.0"]);
    expect(groupTools([{ ...SAMSEG, digest: null }]).map((g) => g.key)).toEqual([SAMSEG.digest]);
    expect(groupTools([])).toEqual([]);
  });

  it("says how a tool stands, by precedence, in seven states", () => {
    const one = (p: typeof SAMSEG, found = null as typeof SHARED_TOOLS.found) => toolState({ packages: [p], converter: p.kind === "binary" }, found);
    expect(one(SEGCSVD)).toMatchObject({ kind: "failed", tone: "caution", words: "Did not pass its check", p: SEGCSVD });
    // the licence waits after a failed check
    expect(toolState({ packages: [SAMSEG, SEGCSVD], converter: false }, null).kind).toBe("failed");
    expect(one(SAMSEG)).toMatchObject({ kind: "licence", tone: "caution", words: "Needs its licence" });
    const accepted = { ...SAMSEG, licence: { ...SAMSEG.licence!, accepted: { by: "astrid@site", at: "2026-10-19T10:00:00Z" } } };
    expect(one(accepted)).toMatchObject({ kind: "licence-file", words: "Needs its licence file" });
    expect(one(DCM2NIIX_OLD)).toMatchObject({ kind: "update", tone: "brand", words: "Older version on this machine: v1.0.20241211; pipelines pin v1.0.20260724" });
    expect(one(PYMENT)).toMatchObject({ kind: "ready", tone: "ok", words: "Ready" });
    expect(one(DCM2NIIX)).toMatchObject({ kind: "ready" });
    const fs = groupTools(PRODUCTION.packages)[0];
    expect(toolState(fs, SHARED_TOOLS.found)).toMatchObject({ kind: "copy", tone: "neutral", words: "A copy is in the folder", copy: FS_SANDBOX, p: fs.packages[0] });
    expect(toolState(fs, [{ ...FS_SANDBOX, registered: true }]).kind).toBe("missing");
    expect(toolState(groupTools(PRODUCTION.packages)[3], null)).toMatchObject({ kind: "cached", tone: "ok", words: "Ready, fetched already" });
    expect(toolState(fs, null)).toMatchObject({ kind: "missing", tone: "neutral", words: "Not here yet; a first run fetches it" });
    expect(one({ ...DCM2NIIX, status: "missing" })).toMatchObject({ kind: "missing", words: "Not here yet" });
    expect(toolState(groupTools([FS_TAKEN])[0], SHARED_TAKEN.found)).toMatchObject({ kind: "ready", words: "Ready" });
  });

  it("counts tools, those ready and those needing a look, and says what a folder holds that NILS recognises", () => {
    expect(toolCounts(groupTools(PRODUCTION.packages), PRODUCTION.found)).toEqual({ tools: 10, ready: 3, look: 1 });
    expect(toolCounts(groupTools(PLACE.packages), PLACE.found)).toEqual({ tools: 5, ready: 2, look: 2 });
    expect(foundWords(SHARED_TOOLS)).toBe("Found FreeSurfer 8.2.0 for 7 pipelines.");
    expect(foundWords(PRODUCTION)).toBe("Nothing NILS recognises there yet.");
    const two = { ...SHARED_TOOLS, found: [FS_SANDBOX, { ...FS_OLD_SANDBOX, path: "/srv/shared/tools/lst", base_digest: "x", matches: ["lst-ai@1.2.0"] }] };
    expect(foundWords(two)).toBe("Found FreeSurfer 8.2.0 for 7 pipelines and LST-AI 1.2.0 for 1 pipeline.");
  });

  it("reads the place for its card: the default, a shared folder with where NILS writes, a declared one, read only", () => {
    expect(placeCard(PRODUCTION.place)).toEqual({ kind: "default", path: "/srv/nils/working/software", into: "/srv/nils/working/software", readOnly: false });
    expect(placeCard(SHARED_TOOLS.place)).toEqual({ kind: "shared", path: "/srv/shared/tools", into: "/srv/shared/tools/nils", readOnly: false });
    expect(placeCard({ path: "/srv/nils/software", declared: "software" })).toMatchObject({ kind: "declared", readOnly: false });
    expect(placeCard({ path: "/srv/ro", declared: "software", read_only: true })).toMatchObject({ readOnly: true });
    expect(placeCard(null)).toBeNull();
  });
});

describe("the page", () => {
  it("draws a fresh install as 10 tools with plain states, and offers a folder of tools first", () => {
    const html = draw(ADMIN, PRODUCTION);
    expect(titles(html)).toHaveLength(10);
    expect(stateOf(html, "FreeSurfer 8.2.0")).toBe("Not here yet; a first run fetches it");
    expect(html).toContain(`7 pipelines: ${FS_APPS.join(", ")}`);
    expect(stateOf(html, "ANTs 2.6.5.dev1-gfdce4d2")).toBe("Ready, fetched already");
    expect(stateOf(html, "MRIQC 24.0.2")).toBe("Ready, fetched already");
    expect(stateOf(html, "LST-AI 1.2.0")).toBe("Ready, fetched already");
    expect(stateOf(html, "ANTs 2.6.2")).toBe("Not here yet; a first run fetches it");
    expect(stateOf(html, "dcm2niix (the converter)")).toBe("Older version on this machine: v1.0.20241211; pipelines pin v1.0.20260724");
    expect(html).toContain(">Install v1.0.20260724</button>");
    expect(html).toContain("every pipeline that reads DICOM");
    // the borders: ready ok, the older converter brand, the rest neutral
    expect(html.match(/<li class="software-tool ok">/gu)).toHaveLength(3);
    expect(html.match(/<li class="software-tool brand">/gu)).toHaveLength(1);
    expect(html.match(/<li class="software-tool neutral">/gu)).toHaveLength(6);
    expect(html).toContain('aria-label="Install FreeSurfer 8.2.0"');
    // the place card, first, with its one act as the primary button while nothing is installed
    expect(html).toContain("Tools are installed under the working place");
    expect(html).toContain("/srv/nils/working/software");
    expect(html).toMatch(/<button type="button" class="button">(<svg[\s\S]*?<\/svg>|<span[^>]*><\/span>)?Use a folder of tools<\/button>/u);
    expect(html).toContain("Have FreeSurfer or other tools on this machine already? Point NILS at their folder.");
    expect(html.indexOf("Use a folder of tools")).toBeLessThan(html.indexOf("software-tools"));
    expect(html).toContain(">Add a tool you already have</button>");
    expect(html).toContain("<dt>tools</dt><dd>10</dd>");
    expect(html).toContain("<dt>ready</dt><dd>3</dd>");
    expect(html).toContain("<dt>need a look</dt><dd>1</dd>");
    // the engine's words stay in the Details
    const text = outsideDetails(html).replace(/<[^>]+>/gu, " ");
    expect(text).not.toMatch(/\b(register|registered|sandbox|sif|digest|fingerprint|pack)\b/iu);
    expect(html).toContain("<summary>Details</summary>");
    expect(html).toContain('<b class="path">synthstrip@freesurfer-8.2.0</b>');
  });

  it("offers the FreeSurfer copy in a shared folder as one row, and lists what no pipeline uses under Also in the folder", () => {
    const html = draw(ADMIN, SHARED_TOOLS);
    expect(titles(html).filter((t) => t.startsWith("FreeSurfer"))).toEqual(["FreeSurfer 8.2.0"]);
    expect(stateOf(html, "FreeSurfer 8.2.0")).toBe("A copy is in the folder");
    expect(html).toContain('<div class="meta path">/srv/shared/tools/freesurfer/8.2.0</div>');
    expect(html).toContain(">Use this copy</button>");
    expect(html.indexOf(">Use this copy</button>")).toBeLessThan(html.indexOf('aria-label="Install FreeSurfer 8.2.0"'));
    expect(html).toContain('class="button quiet small" aria-label="Install FreeSurfer 8.2.0"');
    expect(html).toContain("Tools live in <span class=\"path\">/srv/shared/tools</span><span class=\"tag\">shared folder</span>");
    expect(html).toContain('NILS writes only <span class="path">/srv/shared/tools/nils</span>');
    expect(html).toContain('class="button secondary"');
    expect(html).toContain("Change folder");
    expect(html).toContain('aria-label="Also in the folder"');
    expect(html).toContain("Not used by any pipeline. Add one to run it by name. 1 entry could not be read.");
    expect(html).toContain("sandbox folder, built from freesurfer/freesurfer:7.4.1");
    expect(html).toContain('value="freesurfer@7.4.1"');
    expect(html).toContain('aria-label="Add /srv/shared/tools/freesurfer/7.4.1 as freesurfer@7.4.1"');
    // the matched copy is the row's offer, never an Also entry
    expect(html).not.toContain('aria-label="Add /srv/shared/tools/freesurfer/8.2.0');
  });

  it("says a read-only folder as such and offers no install, no copy and no add in it", () => {
    const html = draw(ADMIN, { ...SHARED_TOOLS, place: { ...SHARED_TOOLS.place!, read_only: true } });
    expect(html).toContain('<span class="tag caution">read only</span>');
    expect(html).toContain("NILS lists this folder but cannot install into it.");
    expect(html).not.toContain(">Use this copy</button>");
    expect(html).not.toContain('aria-label="Install FreeSurfer 8.2.0"');
    expect(html).not.toContain(">Add as</button>");
    expect(html).not.toContain(">Add a tool you already have</button>");
    // a folder elsewhere may still be chosen
    expect(html).toContain("Change folder");
  });

  it("says Ready with the site's copy after it is taken, and keeps the rest of the folder listed", () => {
    const html = draw(ADMIN, SHARED_TAKEN);
    expect(stateOf(html, "FreeSurfer 8.2.0")).toBe("Ready");
    expect(html).toContain("the site&#x27;s copy at /srv/shared/tools/freesurfer/8.2.0");
    expect(html).toContain(`7 pipelines: ${FS_APPS.join(", ")}`);
    expect(html).toContain('<li class="software-tool ok"><div class="software-tool-name"><b>FreeSurfer 8.2.0</b>');
    expect(html).toContain('aria-label="Forget synthstrip@freesurfer-8.2.0"');
    expect(html).toContain("/srv/shared/tools/freesurfer/7.4.1");
    expect(html).toContain("<dt>ready</dt><dd>4</dd>");
  });

  it("draws a failed check, a licence to accept and an install by its person, each with its act", () => {
    const html = draw();
    expect(stateOf(html, "FreeSurfer 8.1.0")).toBe("Needs its licence");
    expect(html).toContain(">Accept the terms</button>");
    expect(stateOf(html, "segcsvd 1.0")).toBe("Did not pass its check");
    expect(html).toContain(">Check again</button>");
    expect(html).toContain("the image changed since it was installed");
    expect(stateOf(html, "pyment 5.1.0")).toBe("Ready");
    expect(html).toContain("the site&#x27;s copy at /srv/shared/software/pyment/5.1.0");
    expect(stateOf(html, "dcm2niix (the converter)")).toBe("Ready");
    expect(html).toContain("installed by Astrid,");
    // the Details keep every word of before
    expect(html).toContain('<span class="tag caution">LicenseRef-FreeSurfer: terms not accepted</span>');
    expect(html).toContain('aria-label="Forget pyment@5.1.0"');
    expect(html).not.toContain('aria-label="Remove pyment@5.1.0"');
    expect(html).toContain('aria-label="Remove segcsvd@1.0"');
    expect(html).toContain("CC-BY-NC-4.0: accepted by Astrid");
    expect(html).toContain(">9e9e9e9e9e9e</td>");
    expect(html).toContain('class="req warn"');
    expect(html).toContain("no GPU here; it runs on the CPU, slower");
    // the declared place, not shared
    expect(html).toContain('Tools live in <span class="path">/srv/nils/software</span>');
    const accepted = { ...SAMSEG, licence: { ...SAMSEG.licence!, accepted: { by: "astrid@site", at: "2026-10-19T10:00:00Z" } } };
    const filed = draw(ADMIN, { ...PLACE, packages: [accepted] });
    expect(filed).toContain(">Add the licence file</button>");
    expect(filed).toContain("nils software accept freesurfer@8.1.0 --file PATH");
  });

  it("offers no act to a person who may only see, and no folder change without the grants and doors", () => {
    const seen = draw(SEER, SHARED_TOOLS);
    for (const words of [">Accept the terms</button>", ">Use this copy</button>", ">Install</button>", ">Check again</button>", ">Add as</button>", "Add a tool you already have", "Change folder", ">Verify again</button>"]) expect(seen).not.toContain(words);
    expect(seen).toContain("/srv/shared/tools/freesurfer/7.4.1");
    expect(seen).toContain("A copy is in the folder");
    const noPlaces = draw(NO_PLACES, PRODUCTION);
    expect(noPlaces).toContain("Tools are installed under the working place");
    expect(noPlaces).not.toContain("Use a folder of tools");
    // an engine with no pipeline in its catalog
    expect(draw(ADMIN, { ...PRODUCTION, packages: [DCM2NIIX] })).toContain("No pipeline pins a tool yet.");
  });

  it("says a code it does not know as a person, never the code", () => {
    const html = renderToStaticMarkup(<SoftwareView caps={ADMIN} place={{ ...PLACE, packages: [{ ...PYMENT, by: "7f3a9c2e5d1b4a60", licence: { ...PYMENT.licence!, accepted: { by: "7f3a9c2e5d1b4a60", at: "2026-10-18T10:00:00Z" } } }] }} people={[]} onChanged={() => undefined} now={FIXTURE_NOW} />);
    expect(html).toContain("accepted by a person");
    expect(html).not.toContain("7f3a9c2e5d1b4a60");
  });
});

describe("the doors", () => {
  let asked: { method: string; path: string; body: unknown }[] = [];
  let answers: Record<string, (body: unknown) => { status: number; body: unknown }> = {};
  let root: Root;
  let el: HTMLDivElement;
  beforeEach(() => {
    if (!HTMLDialogElement.prototype.showModal) HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
    if (!HTMLDialogElement.prototype.close) HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
    asked = [];
    answers = {};
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://desk.test");
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      asked.push({ method, path: url.pathname, body });
      const a = answers[`${method} ${url.pathname}`]?.(body) ?? { status: 404, body: { error: `no ${url.pathname}` } };
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
    for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
  };
  // a button by its words, or by the name it is read out by
  const button = (words: string | RegExp) => {
    const says = (t: string | null | undefined) => (typeof words === "string" ? t?.trim() === words : words.test(t ?? ""));
    return [...el.ownerDocument.querySelectorAll("button")].find((b) => says(b.textContent) || says(b.getAttribute("aria-label"))) as HTMLButtonElement;
  };
  const type = (label: string, value: string) => {
    const input = el.ownerDocument.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("calls each door with its method, path and body", async () => {
    answers = {
      "GET /api/software": () => ({ status: 200, body: PLACE }),
      "POST /api/software/install": () => ({ status: 200, body: { installed: true, package: SYNTHSEG } }),
      "POST /api/software/register": () => ({ status: 200, body: { registered: true, package: PYMENT } }),
      "POST /api/software/segcsvd/1.0/verify": () => ({ status: 200, body: { verified: true, verification: {}, package: SEGCSVD } }),
      "POST /api/software/freesurfer/8.1.0/accept": () => ({ status: 200, body: { accepted: true, acceptance: { by: "astrid@site", at: "2026-10-20T09:00:00Z", terms: { address: null, version: null } }, file: null } }),
      "POST /api/software/pyment/5.1.0/forget": () => ({ status: 200, body: { forgotten: true, app: "pyment", version: "5.1.0" } }),
      "DELETE /api/software/segcsvd/1.0": () => ({ status: 200, body: { removed: true, app: "segcsvd", version: "1.0" } }),
    };
    expect((await software.list()).packages).toHaveLength(5);
    await software.install({ spec: "synthseg@2.0" });
    await software.register({ spec: "pyment@5.1.0", kind: "sandbox", path: "/srv/shared/software/pyment/5.1.0" });
    await software.verify("segcsvd", "1.0");
    await software.accept("freesurfer", "8.1.0", { text: "a licence", name: "license.txt" });
    await software.forget("pyment", "5.1.0");
    await software.remove("segcsvd", "1.0");
    expect(asked).toEqual([
      { method: "GET", path: "/api/software", body: null },
      { method: "POST", path: "/api/software/install", body: { spec: "synthseg@2.0" } },
      { method: "POST", path: "/api/software/register", body: { spec: "pyment@5.1.0", kind: "sandbox", path: "/srv/shared/software/pyment/5.1.0" } },
      { method: "POST", path: "/api/software/segcsvd/1.0/verify", body: {} },
      { method: "POST", path: "/api/software/freesurfer/8.1.0/accept", body: { file: "a licence", file_name: "license.txt" } },
      { method: "POST", path: "/api/software/pyment/5.1.0/forget", body: {} },
      { method: "DELETE", path: "/api/software/segcsvd/1.0", body: null },
    ]);
  });

  const offers = () => [{ key: "fs", title: "FreeSurfer 8.2.0", p: PRODUCTION.packages[0], pipelines: 7 }, { key: "seg", title: "segcsvd rc03", p: PRODUCTION.packages[11], pipelines: 1 }];
  const pick = (id: string, value: string) => {
    const select = el.ownerDocument.getElementById(id) as HTMLSelectElement;
    act(() => {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  const typeId = (id: string, value: string) => {
    const input = el.ownerDocument.getElementById(id) as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("installs a tool chosen by its name, by its first package, and a refusal says why with the checks that fail", async () => {
    let done: string | null = null;
    answers = { "POST /api/software/install": () => ({ status: 409, body: { error: "no container runtime here", needs: [{ check: "runtime", ok: false, state: "missing", said: "no docker, podman or apptainer on the engine's path" }] } }) };
    act(() => root.render(<InstallDialog first="seg" offered={offers()} into="/srv/shared/tools/nils" onClose={() => undefined} onDone={(w) => (done = w)} />));
    const text = el.ownerDocument.body.textContent ?? "";
    expect(text).toContain("Fetched by its pinned digest into /srv/shared/tools/nils and checked.");
    expect((el.ownerDocument.getElementById("install-tool") as HTMLSelectElement).value).toBe("seg");
    // the image and the pack wait under More, for something else
    expect(el.ownerDocument.querySelector('[aria-label="The image, pinned by its digest"]')).toBeNull();
    pick("install-tool", "fs");
    act(() => button("Install").click());
    await settle();
    expect(asked[0]).toEqual({ method: "POST", path: "/api/software/install", body: { spec: "synthstrip@freesurfer-8.2.0" } });
    expect(el.ownerDocument.body.textContent).toContain("no container runtime here");
    expect(el.ownerDocument.body.textContent).toContain("no docker, podman or apptainer on the engine's path");
    answers = { "POST /api/software/install": () => ({ status: 200, body: { installed: true, package: { ...FS_TAKEN, how: "installed", managed: true, status: "installed" } } }) };
    act(() => button("Install").click());
    await settle();
    expect(done).toBe("Installed FreeSurfer 8.2.0; it passed its check.");
  });

  it("installs something else by app@version with its image under More", async () => {
    answers = { "POST /api/software/install": () => ({ status: 200, body: { installed: true, package: SYNTHSEG } }) };
    act(() => root.render(<InstallDialog first={null} offered={offers()} into={null} onClose={() => undefined} onDone={() => undefined} />));
    pick("install-tool", "");
    expect(el.ownerDocument.body.textContent).toContain("More");
    type("The tool's name and version", "synthseg@2.0");
    type("The image, pinned by its digest", "docker.io/x/y:latest");
    expect(button("Install").disabled).toBe(true);
    type("The image, pinned by its digest", `docker.io/x/y@sha256:${"0".repeat(64)}`);
    act(() => button("Install").click());
    await settle();
    expect(asked[0].body).toEqual({ spec: "synthseg@2.0", source: `docker.io/x/y@sha256:${"0".repeat(64)}` });
  });

  it("opens Install from a row with that tool chosen, and says the outcome in the page's line after the reload", async () => {
    let changed = 0;
    answers = { "POST /api/software/install": () => ({ status: 200, body: { installed: true, package: FS_TAKEN } }) };
    act(() => root.render(<SoftwareView caps={ADMIN} place={PRODUCTION} people={people} onChanged={() => changed++} now={FIXTURE_NOW} />));
    act(() => button("Install ANTs 2.6.2").click());
    expect((el.ownerDocument.getElementById("install-tool") as HTMLSelectElement).selectedOptions[0].textContent).toBe("ANTs 2.6.2");
    const installs = [...el.ownerDocument.querySelectorAll("dialog button")].filter((b) => b.textContent?.trim() === "Install");
    act(() => (installs[0] as HTMLButtonElement).click());
    await settle();
    expect(asked[0].body).toEqual({ spec: "registration-ants@ants-2.6.2" });
    expect(changed).toBe(1);
    expect(el.querySelector(".ok-words")?.textContent).toBe("Installed ANTs 2.6.2; it passed its check.");
  });

  it("adds a tool you already have: the kind read from the path, for a tool a pipeline pins with its pack, or for something else by name", async () => {
    let done: string | null = null;
    answers = { "POST /api/software/register": (b) => ({ status: 200, body: { registered: true, package: { ...FS_TAKEN, spec: (b as { spec: string }).spec } } }) };
    act(() => root.render(<RegisterDialog first={null} offered={offers()} browse={false} onClose={() => undefined} onDone={(w) => (done = w)} />));
    expect(el.ownerDocument.body.textContent).toContain("NILS reads it as it is and never changes, moves or removes it.");
    typeId("tool-where", "relative/fs.sif");
    expect(el.ownerDocument.body.textContent).toContain("a full path, from /");
    expect(button("Add").disabled).toBe(true);
    typeId("tool-where", "/srv/tools/fs.sif");
    expect(button("Image file (.sif)").getAttribute("aria-pressed")).toBe("true");
    act(() => button("Add").click());
    await settle();
    expect(asked[0].body).toEqual({ spec: "synthstrip@freesurfer-8.2.0", kind: "sif", path: "/srv/tools/fs.sif", pack_from: "synthstrip@1" });
    expect(done).toBe("FreeSurfer 8.2.0: using the copy at /srv/tools/fs.sif for 7 pipelines.");
    // the chips change what the path is read as
    act(() => button("Folder").click());
    expect(button("Folder").getAttribute("aria-pressed")).toBe("true");
    asked.length = 0;
    pick("tool-for", "");
    expect(button("Add").disabled).toBe(true);
    type("The tool's name and version", "pyment@5.1.0");
    act(() => button("Add").click());
    await settle();
    expect(asked[0].body).toEqual({ spec: "pyment@5.1.0", kind: "sandbox", path: "/srv/tools/fs.sif" });
    expect(done).toBe("Added pyment@5.1.0; it passed its check.");
  });

  it("takes the copy in the folder for the tool with one register, for the first package it matches, with the pipeline's pack_from", async () => {
    let changed = 0;
    answers = { "POST /api/software/register": () => ({ status: 200, body: { registered: true, package: FS_TAKEN } }) };
    act(() => root.render(<SoftwareView caps={ADMIN} place={SHARED_TOOLS} people={people} onChanged={() => changed++} now={FIXTURE_NOW} />));
    act(() => button("Use this copy").click());
    await settle();
    expect(asked).toEqual([{ method: "POST", path: "/api/software/register", body: { spec: "synthstrip@freesurfer-8.2.0", kind: "sandbox", path: "/srv/shared/tools/freesurfer/8.2.0", pack_from: "synthstrip@1" } }]);
    expect(changed).toBe(1);
    expect(el.querySelector(".ok-words")?.textContent).toBe("FreeSurfer 8.2.0: using the copy at /srv/shared/tools/freesurfer/8.2.0 for 7 pipelines.");
  });

  it("takes the copy without pack_from where the engine says the pipeline has no pack, and shows any other refusal", async () => {
    let tries = 0;
    answers = {
      "POST /api/software/register": (b) => {
        tries++;
        return (b as { pack_from?: string }).pack_from ? { status: 422, body: { error: "synthstrip@1 has no pack" } } : { status: 200, body: { registered: true, package: FS_TAKEN } };
      },
    };
    act(() => root.render(<SoftwareView caps={ADMIN} place={SHARED_TOOLS} people={people} onChanged={() => undefined} now={FIXTURE_NOW} />));
    act(() => button("Use this copy").click());
    await settle();
    expect(tries).toBe(2);
    expect(asked[1].body).toEqual({ spec: "synthstrip@freesurfer-8.2.0", kind: "sandbox", path: "/srv/shared/tools/freesurfer/8.2.0" });
    asked.length = 0;
    answers = { "POST /api/software/register": () => ({ status: 409, body: { error: "the place is read only" } }) };
    act(() => button("Use this copy").click());
    await settle();
    expect(asked).toHaveLength(1);
    expect(el.ownerDocument.body.textContent).toContain("the place is read only");
  });

  it("adds what no pipeline uses in one click, under the name read from its image, editable in place", async () => {
    answers = { "POST /api/software/register": (b) => ({ status: 200, body: { registered: true, package: { ...PYMENT, spec: (b as { spec: string }).spec } } }) };
    act(() => root.render(<SoftwareView caps={ADMIN} place={SHARED_TOOLS} people={people} onChanged={() => undefined} now={FIXTURE_NOW} />));
    const name = el.ownerDocument.querySelector('[aria-label="The name for /srv/shared/tools/freesurfer/7.4.1"]') as HTMLInputElement;
    expect(name.value).toBe("freesurfer@7.4.1");
    type("The name for /srv/shared/tools/freesurfer/7.4.1", "free surfer@7.4.1");
    expect(el.ownerDocument.body.textContent).toContain("name it as app@version");
    expect(button(/^Add \/srv\/shared\/tools\/freesurfer\/7\.4\.1 as/u).disabled).toBe(true);
    type("The name for /srv/shared/tools/freesurfer/7.4.1", "freesurfer@7.4.1");
    act(() => button("Add /srv/shared/tools/freesurfer/7.4.1 as freesurfer@7.4.1").click());
    await settle();
    expect(asked).toEqual([{ method: "POST", path: "/api/software/register", body: { spec: "freesurfer@7.4.1", kind: "sandbox", path: "/srv/shared/tools/freesurfer/7.4.1" } }]);
    expect(el.querySelector(".ok-words")?.textContent).toBe("Added freesurfer@7.4.1 from /srv/shared/tools/freesurfer/7.4.1; it passed its check.");
  });

  it("points NILS at a folder of tools: adds the software place where none is declared, and says what it found there", async () => {
    answers = {
      "GET /api/places": () => ({ status: 200, body: { places: [{ id: 1, name: "registry", role: "registry", path: "/srv/nils/registry", guarantees: {}, probed: null, probed_at: null, retired_at: null }] } }),
      "POST /api/places": () => ({ status: 201, body: { id: 2, name: "software", role: "software", path: "/srv/shared/tools", guarantees: {}, probed: null, probed_at: null, retired_at: null } }),
      "GET /api/software": () => ({ status: 200, body: SHARED_TOOLS }),
    };
    act(() => root.render(<SoftwareView caps={ADMIN} place={PRODUCTION} people={people} onChanged={() => undefined} now={FIXTURE_NOW} />));
    act(() => button("Use a folder of tools").click());
    const text = el.ownerDocument.querySelector("dialog")?.textContent ?? "";
    expect(text).toContain("Where tools live");
    expect(text).toContain("NILS looks up to three levels down for tools already there (Apptainer sandbox folders and .sif files).");
    expect(button("Back to the default")).toBeUndefined();
    expect(button("Use this folder").disabled).toBe(true);
    typeId("software-folder", "/srv/shared/tools/");
    expect(el.ownerDocument.querySelector("dialog")?.textContent).toContain("It installs into /srv/shared/tools/nils and changes nothing else.");
    act(() => button("Use this folder").click());
    await settle();
    expect(asked.filter((a) => a.method !== "GET" || a.path === "/api/software")).toEqual([
      { method: "POST", path: "/api/places", body: { name: "software", role: "software", path: "/srv/shared/tools", guarantees: {} } },
      { method: "GET", path: "/api/software", body: null },
    ]);
    expect(el.querySelector(".ok-words")?.textContent).toBe("Tools now live in /srv/shared/tools. Found FreeSurfer 8.2.0 for 7 pipelines.");
  });

  it("moves a declared software place to another folder, and goes back to the default by retiring it", async () => {
    const declared = { id: 2, name: "software", role: "software", path: "/srv/shared/tools", guarantees: {}, probed: null, probed_at: null, retired_at: null };
    answers = {
      "GET /api/places": () => ({ status: 200, body: { places: [declared] } }),
      "PUT /api/places/2": (b) => ({ status: 200, body: { ...declared, ...(b as object) } }),
      "GET /api/software": () => ({ status: 200, body: PRODUCTION }),
    };
    act(() => root.render(<SoftwareView caps={ADMIN} place={SHARED_TOOLS} people={people} onChanged={() => undefined} now={FIXTURE_NOW} />));
    act(() => button("Change folder").click());
    expect((el.ownerDocument.getElementById("software-folder") as HTMLInputElement).value).toBe("/srv/shared/tools");
    expect(button("Use this folder").disabled).toBe(true);
    typeId("software-folder", "/srv/other-tools");
    act(() => button("Use this folder").click());
    await settle();
    expect(asked.find((a) => a.method === "PUT")).toEqual({ method: "PUT", path: "/api/places/2", body: { path: "/srv/other-tools" } });
    expect(el.querySelector(".ok-words")?.textContent).toBe("Tools now live in /srv/other-tools. Nothing NILS recognises there yet.");
    asked.length = 0;
    act(() => button("Change folder").click());
    act(() => button("Back to the default").click());
    await settle();
    expect(asked.find((a) => a.method === "PUT")).toEqual({ method: "PUT", path: "/api/places/2", body: { retired: true } });
    expect(el.querySelector(".ok-words")?.textContent).toBe("Tools are installed under the working place again, in /srv/nils/working/software.");
  });

  it("checks a failed tool again, and installs the converter the pipelines pin over an older one", async () => {
    answers = {
      "POST /api/software/segcsvd/1.0/verify": () => ({ status: 200, body: { verified: true, verification: {}, package: SEGCSVD } }),
      "POST /api/software/install": () => ({ status: 200, body: { installed: true, package: DCM2NIIX } }),
    };
    const older = { ...DCM2NIIX_OLD, install: { door: "POST /api/software/install", command: "nils software install dcm2niix", grant: "install:work" } };
    act(() => root.render(<SoftwareView caps={ADMIN} place={{ ...PLACE, packages: [SEGCSVD, older] }} people={people} onChanged={() => undefined} now={FIXTURE_NOW} />));
    act(() => button("Check again").click());
    await settle();
    expect(asked[0]).toEqual({ method: "POST", path: "/api/software/segcsvd/1.0/verify", body: {} });
    expect(el.querySelector(".ok-words")?.textContent).toBe("segcsvd 1.0 passed its check.");
    act(() => button("Install v1.0.20260724").click());
    await settle();
    expect(asked[1]).toEqual({ method: "POST", path: "/api/software/install", body: { spec: "dcm2niix@v1.0.20260724" } });
    expect(el.querySelector(".ok-words")?.textContent).toBe("dcm2niix v1.0.20260724 is installed.");
  });

  it("shows the terms to accept, and waits for the site file the pack names", async () => {
    act(() => root.render(<AcceptDialog p={SAMSEG} onClose={() => undefined} onDone={() => undefined} />));
    const text = el.ownerDocument.body.textContent ?? "";
    expect(text).toContain("https://surfer.nmr.mgh.harvard.edu/registration.html");
    expect(text).toContain("version 2024");
    expect(text).toContain("its image is never shared on from here");
    expect(button("Accept in my name").disabled).toBe(true);
    const terms = el.ownerDocument.querySelector('a[href="https://surfer.nmr.mgh.harvard.edu/registration.html"]') as HTMLAnchorElement;
    expect(terms.rel).toContain("noopener");
  });

  it("takes the terms' address from the administrator when the pack names none, and sends it (review fix 4)", async () => {
    const bare = { ...SAMSEG, licence: { ...SAMSEG.licence!, terms: null, site_file: null, file: null } };
    answers = { "POST /api/software/freesurfer/8.1.0/accept": () => ({ status: 200, body: { accepted: true, acceptance: { by: "astrid@site", at: "2026-10-20T09:00:00Z", terms: { address: "https://example.org/terms", version: null } }, file: null } }) };
    act(() => root.render(<AcceptDialog p={bare} onClose={() => undefined} onDone={() => undefined} />));
    expect(button("Accept in my name").disabled).toBe(true);
    type("The address of the terms", "not an address");
    expect(button("Accept in my name").disabled).toBe(true);
    type("The address of the terms", "https://example.org/terms");
    expect(button("Accept in my name").disabled).toBe(false);
    act(() => button("Accept in my name").click());
    await settle();
    expect(asked[0].body).toEqual({ terms: { address: "https://example.org/terms" } });
  });

  it("sends the converter's install the package it names when the door is the software door, and nothing for the old tools door (review fix 1)", async () => {
    const missing = { ...DCM2NIIX, status: "missing" as const, path: null };
    answers = { "POST /api/software/install": () => ({ status: 200, body: { installed: true, package: DCM2NIIX } }), "POST /api/tools/dcm2niix/install": () => ({ status: 200, body: { installed: true } }) };
    const soft = { ...missing, install: { door: "POST /api/software/install", command: "nils software install dcm2niix", grant: "install:work" } };
    act(() => root.render(<SoftwareView caps={ADMIN} place={{ ...PLACE, packages: [soft] }} people={people} onChanged={() => undefined} now={FIXTURE_NOW} />));
    act(() => button("Install dcm2niix").click());
    await settle();
    expect(asked.find((a) => a.path === "/api/software/install")?.body).toEqual({ spec: `dcm2niix@${DCM2NIIX.version}` });
    forgetInstalled();
    asked.length = 0;
    act(() => root.render(<SoftwareView caps={ADMIN} place={{ ...PLACE, packages: [{ ...missing, app: "dcm2niix", version: "v1.0.2" }] }} people={people} onChanged={() => undefined} now={FIXTURE_NOW} />));
    act(() => button("Install dcm2niix").click());
    await settle();
    expect(asked.find((a) => a.path === "/api/tools/dcm2niix/install")?.body).toBeNull();
  });

  it("sends any fix aimed at the software door the package it names, as a run refusal's fix is (review fix 12)", async () => {
    answers = { "POST /api/software/install": () => ({ status: 200, body: { installed: true, package: DCM2NIIX } }) };
    await tools.install({ tool: "dcm2niix", door: "POST /api/software/install", command: null, grant: null });
    expect(asked[0].body).toEqual({ app: "dcm2niix" });
    await tools.install({ tool: "freesurfer", door: "POST /api/software/install", command: null, grant: null, version: "8.1.0" });
    expect(asked[1].body).toEqual({ spec: "freesurfer@8.1.0" });
  });

  it("adds the licence file alone where the terms are accepted already (review fixes 6 and 13)", async () => {
    const accepted = { ...SAMSEG, licence: { ...SAMSEG.licence!, accepted: { by: "astrid@site", at: "2026-10-19T10:00:00Z" } } };
    answers = { "POST /api/software/freesurfer/8.1.0/accept": () => ({ status: 200, body: { accepted: true, acceptance: { by: "astrid@site", at: "2026-10-20T09:00:00Z", terms: { address: "https://x.org/t", version: null } }, file: { sha256: "ab", name: "license.txt", under: "licences/freesurfer" } } }) };
    act(() => root.render(<SoftwareView caps={ADMIN} place={{ ...PLACE, packages: [accepted] }} people={people} onChanged={() => undefined} now={FIXTURE_NOW} />));
    act(() => button("Add the licence file").click());
    const text = el.ownerDocument.body.textContent ?? "";
    expect(text).toContain("Add the licence file of FreeSurfer 8.1.0");
    expect(button("Place the file").disabled).toBe(true);
    const input = el.ownerDocument.querySelector('input[aria-label="The licence file"]') as HTMLInputElement;
    const f = new File(["key"], "license.txt");
    Object.defineProperty(input, "files", { value: [f] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await settle();
    act(() => button("Place the file").click());
    await settle();
    expect(asked.find((a) => a.path.endsWith("/accept"))?.body).toMatchObject({ file: "key", file_name: "license.txt" });
    expect(el.querySelector(".ok-words")?.textContent).toBe("license.txt is placed for freesurfer's runs.");
  });
});
