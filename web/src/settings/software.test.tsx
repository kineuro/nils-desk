// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-only
// Settings > Software (record 57 P5, Wave 7b spec 6.7): the page against the
// engine's shapes (./software.fixture), its words, its acts by grant and door,
// and each door the page calls, with its method, path and body. Every name
// here is made up.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { capsWith } from "../review/caps.fixture";
import { software } from "../ops/client";
import { forgetInstalled } from "../ops/Install";
import { settingsPages } from "./pages";
import { failedChecks, kindWords, licenceState, nextAct, pinnedError, shortPrint, softwareActs, softwareCounts, softwareHrefFor, specError, statusTag, verifiedWords } from "./software";
import { DCM2NIIX, FIXTURE_NOW, PLACE, PYMENT, SAMSEG, SEGCSVD, SOFTWARE_DOORS, SYNTHSEG } from "./software.fixture";
import { AcceptDialog, InstallDialog, RegisterDialog, SoftwareView } from "./SoftwarePage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADMIN = capsWith(SOFTWARE_DOORS, ["install:see", "install:work", "pipelines:see"]);
const SEER = capsWith(SOFTWARE_DOORS, ["pipelines:see"]);
const people = [{ subject: "astrid@site", display: "Astrid" }];
const draw = (caps = ADMIN, place = PLACE) => renderToStaticMarkup(<SoftwareView caps={caps} place={place} people={people} onChanged={() => undefined} now={FIXTURE_NOW} />);

describe("the software place's words", () => {
  it("names the kind, the status and how a package came", () => {
    expect(kindWords(SAMSEG)).toBe("image");
    expect(kindWords(PYMENT)).toBe("registered sandbox");
    expect(kindWords(DCM2NIIX)).toBe("program");
    expect(statusTag(SYNTHSEG)).toEqual({ words: "not installed", tone: "caution" });
    expect(statusTag(SEGCSVD)).toEqual({ words: "failed verification", tone: "caution" });
    expect(statusTag({ status: "update available" }).tone).toBe("brand");
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

  it("offers each row the one act it needs next, where the grant and the door allow it", () => {
    const acts = softwareActs(ADMIN);
    expect(nextAct(SYNTHSEG, acts)).toBe("install");
    expect(nextAct(SAMSEG, acts)).toBe("accept");
    expect(nextAct(SEGCSVD, acts)).toBe("verify");
    expect(nextAct(PYMENT, acts)).toBeNull();
    // the converter installs through its own door, from Parts as before
    expect(nextAct({ ...DCM2NIIX, status: "missing" }, acts)).toBeNull();
    const none = softwareActs(SEER);
    expect(none.see).toBe(true);
    expect(nextAct(SYNTHSEG, none)).toBeNull();
    expect(softwareActs(capsWith([], ["install:work", "install:see"])).see).toBe(false);
    expect(softwareCounts(PLACE.packages)).toEqual({ packages: 5, ready: 2, look: 3 });
  });

  it("checks what a person types: app@version and an image pinned by its digest", () => {
    expect(specError("synthseg@2.0")).toBeNull();
    expect(specError("synthseg")).toBe("name it as app@version");
    expect(specError("../x@1")).toBe("name it as app@version");
    expect(pinnedError(`docker.io/x/y@sha256:${"0".repeat(64)}`)).toBeNull();
    expect(pinnedError("docker.io/x/y:latest")).toMatch(/digest/u);
  });

  it("is a Settings page for a person who may see the install or the pipelines, where the engine serves the door", () => {
    expect(settingsPages(ADMIN).map((p) => p.id)).toContain("software");
    expect(settingsPages(SEER).map((p) => p.id)).toContain("software");
    expect(settingsPages(capsWith(["GET /api/places"], ["install:see"])).map((p) => p.id)).not.toContain("software");
    expect(softwareHrefFor(ADMIN)).toBe("#settings/software");
    expect(softwareHrefFor(capsWith([], ["pipelines:see"]))).toBeNull();
  });
});

describe("the page", () => {
  it("draws each package with its kind, status, verification, licence and short fingerprint, and the one act it needs", () => {
    const html = draw();
    expect(html).toContain("<b class=\"path\">freesurfer@8.1.0</b>");
    expect(html).toContain("samseg-lesions@2, synthseg@1");
    expect(html).toContain('<span class="tag caution">LicenseRef-FreeSurfer: terms not accepted</span>');
    expect(html).toContain(">Accept</button>");
    expect(html).toContain('<span class="tag caution">failed verification</span>');
    expect(html).toContain("the image changed since it was installed");
    expect(html).toContain(">Verify again</button>");
    expect(html).toContain('<span class="tag caution">not installed</span>');
    expect(html).toContain(">Install</button>");
    // a registered install is the site's, which NILS never removes: Forget, never Remove
    expect(html).toContain("the site&#x27;s");
    expect(html).toContain('aria-label="Forget pyment@5.1.0"');
    expect(html).not.toContain('aria-label="Remove pyment@5.1.0"');
    expect(html).toContain('aria-label="Remove segcsvd@1.0"');
    // the person by name, never their account's code
    expect(html).toContain("CC-BY-NC-4.0: accepted by Astrid");
    expect(html).toContain('title="sha256:9e9e');
    expect(html).toContain(">9e9e9e9e9e9e</td>");
    // a warn is a warn, a missing check is not ok
    expect(html).toContain('class="req warn"');
    expect(html).toContain("no GPU here; it runs on the CPU, slower");
    expect(html).toContain("/srv/nils/software");
    expect(html).toContain(">Register a path</button>");
  });

  it("offers no act to a person who may only see, and none where the place is read only", () => {
    const seen = draw(SEER);
    expect(seen).not.toContain(">Accept</button>");
    expect(seen).not.toContain(">Install</button>");
    expect(seen).not.toContain(">Verify again</button>");
    expect(seen).not.toContain("Register a path");
    const ro = draw(ADMIN, { ...PLACE, place: { path: "/srv/shared/software", declared: "shared", read_only: true } });
    expect(ro).toContain('<span class="tag">read only</span>');
    expect(ro).not.toContain(">Install</button>");
    expect(ro).not.toContain(">Accept</button>");
    expect(ro).not.toContain(">Forget</button>");
    // verifying reads, and changes nothing of the place
    expect(ro).toContain(">Verify again</button>");
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
  const button = (words: string) => [...el.ownerDocument.querySelectorAll("button")].find((b) => b.textContent?.trim() === words) as HTMLButtonElement;
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

  it("installs by its digest, and a refusal says why with the checks that fail", async () => {
    let done: string | null = null;
    answers = { "POST /api/software/install": () => ({ status: 409, body: { error: "no container runtime here", needs: [{ check: "runtime", ok: false, state: "missing", said: "no docker, podman or apptainer on the engine's path" }] } }) };
    act(() => root.render(<InstallDialog spec="synthseg@2.0" offered={["synthseg@2.0"]} onClose={() => undefined} onDone={(w) => (done = w)} />));
    act(() => button("Install").click());
    await settle();
    expect(asked[0]).toEqual({ method: "POST", path: "/api/software/install", body: { spec: "synthseg@2.0" } });
    expect(el.ownerDocument.body.textContent).toContain("no container runtime here");
    expect(el.ownerDocument.body.textContent).toContain("no docker, podman or apptainer on the engine's path");
    answers = { "POST /api/software/install": () => ({ status: 200, body: { installed: true, package: SYNTHSEG } }) };
    act(() => button("Install").click());
    await settle();
    expect(done).toBe("Installed synthseg@2.0 and verified it.");
  });

  it("registers a path as it is, and refuses a relative one before asking", async () => {
    let done: string | null = null;
    answers = { "POST /api/software/register": (b) => ({ status: 200, body: { registered: true, package: { ...PYMENT, spec: (b as { spec: string }).spec } } }) };
    act(() => root.render(<RegisterDialog onClose={() => undefined} onDone={(w) => (done = w)} />));
    type("The package's name and version", "pyment@5.1.0");
    act(() => button("Folder").click());
    type("The path on this machine", "relative/path");
    expect(el.ownerDocument.body.textContent).toContain("a full path, from /");
    expect(button("Register").disabled).toBe(true);
    type("The path on this machine", "/srv/shared/software/pyment/5.1.0");
    act(() => button("Register").click());
    await settle();
    expect(asked[0].body).toEqual({ spec: "pyment@5.1.0", kind: "sandbox", path: "/srv/shared/software/pyment/5.1.0" });
    expect(done).toBe("Registered pyment@5.1.0 and verified it.");
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

  it("shows the words of an outcome in the page's line after the reload (review fix 2)", async () => {
    let changed = 0;
    answers = { "POST /api/software/install": () => ({ status: 200, body: { installed: true, package: SYNTHSEG } }) };
    act(() => root.render(<SoftwareView caps={ADMIN} place={PLACE} people={people} onChanged={() => changed++} now={FIXTURE_NOW} />));
    act(() => button("Install").click());
    const installs = [...el.ownerDocument.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Install");
    act(() => installs[installs.length - 1].click());
    await settle();
    expect(changed).toBe(1);
    expect(el.querySelector(".ok-words")?.textContent).toBe("Installed synthseg@2.0 and verified it.");
  });
  it("sends the converter's install the package it names when the door is the software door, and nothing for the old tools door (review fix 1)", async () => {
    const missing = { ...DCM2NIIX, status: "missing" as const, path: null };
    answers = { "POST /api/software/install": () => ({ status: 200, body: { installed: true, package: DCM2NIIX } }), "POST /api/tools/dcm2niix/install": () => ({ status: 200, body: { installed: true } }) };
    const soft = { ...missing, install: { door: "POST /api/software/install", command: "nils software install dcm2niix", grant: "install:work" } };
    act(() => root.render(<SoftwareView caps={ADMIN} place={{ ...PLACE, packages: [soft] }} people={people} onChanged={() => undefined} now={FIXTURE_NOW} />));
    act(() => button("Install dcm2niix").click());
    await settle();
    expect(asked.find((a) => a.path === "/api/software/install")?.body).toEqual({ app: "dcm2niix", version: DCM2NIIX.version });
    forgetInstalled();
    asked.length = 0;
    act(() => root.render(<SoftwareView caps={ADMIN} place={{ ...PLACE, packages: [{ ...missing, app: "dcm2niix", version: "v1.0.2" }] }} people={people} onChanged={() => undefined} now={FIXTURE_NOW} />));
    act(() => button("Install dcm2niix").click());
    await settle();
    expect(asked.find((a) => a.path === "/api/tools/dcm2niix/install")?.body).toBeNull();
  });

  it("offers no second acceptance for a package whose terms are accepted and whose site file is missing (review fix 6)", () => {
    const accepted = { ...SAMSEG, licence: { ...SAMSEG.licence!, accepted: { by: "astrid@site", at: "2026-10-19T10:00:00Z" } } };
    const acts = softwareActs(ADMIN);
    expect(licenceState(accepted, (x) => x, (x) => x)).toMatchObject({ words: "LicenseRef-FreeSurfer: accepted; licence file missing", accept: false, file: true });
    expect(nextAct(accepted, acts)).toBeNull();
    const html = renderToStaticMarkup(<SoftwareView caps={ADMIN} place={{ ...PLACE, packages: [accepted] }} people={people} onChanged={() => undefined} now={FIXTURE_NOW} />);
    expect(html).not.toContain(">Accept</button>");
    expect(html).toContain("accepted; licence file missing");
    expect(html).toContain("nils software accept freesurfer@8.1.0 --file PATH");
    expect(softwareCounts([accepted])).toEqual({ packages: 1, ready: 0, look: 1 });
  });
});
