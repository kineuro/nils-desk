// SPDX-License-Identifier: AGPL-3.0-only
// The viewer's gate (Wave 5 B6, grown by record 45 S2): headless Chrome opens
// the bench page (bench.html, served by scripts/bench-serve.mjs in front of an
// engine), the page drives the viewer or a grid of tiles and prints the viewer
// study's JSON lines; this collects them over the DevTools protocol, adds the
// browser's process-group RSS peak as the study's run.sh did, counts the
// engine's audit rows when asked, and checks the budgets.
//
//   BENCH_URL=http://127.0.0.1:5191 node scripts/viewer-bench.mjs "mode=mpr&stack=12&plane=512" [seconds]
//   BENCH_URL=... ENGINE_URL=http://127.0.0.1:18190 node scripts/viewer-bench.mjs "mode=grid&stacks=2-201" [seconds]
//
// CHROME names the browser; GPU=0 runs it on software GL. OUT appends the
// lines as JSON to a file. The budgets (record 45 S2): MPR median at most
// 17 ms and p95 at most 33 ms; one audit row per stack a grid shows.

import { spawn, execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BENCH = process.env.BENCH_URL ?? "http://127.0.0.1:5191";
const [query, secondsArg] = process.argv.slice(2);
if (!query) {
  console.error('usage: viewer-bench.mjs "mode=mpr&stack=ID" [seconds]');
  process.exit(2);
}
const params = new URLSearchParams(query);
const seconds = Number(secondsArg ?? 300);
const plane = Number(params.get("plane") ?? 512);
const width = params.get("mode") === "grid" ? 1600 : plane * 3 + 64;
const port = 9222 + Math.floor(Math.random() * 500);
const chrome = process.env.CHROME ?? "google-chrome";
const profile = mkdtempSync(join(tmpdir(), "nils-viewer-bench-"));
const gpu =
  process.env.GPU === "0"
    ? ["--disable-gpu", "--enable-unsafe-swiftshader"]
    : ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-features=Vulkan", "--use-angle=vulkan", "--enable-unsafe-webgpu"];
const flags = ["--headless=new", "--no-sandbox", "--no-first-run", "--enable-precise-memory-info", "--js-flags=--expose-gc", ...gpu, `--remote-debugging-port=${port}`, `--window-size=${width},${params.get("mode") === "grid" ? 2400 : plane * 2 + 200}`, `--user-data-dir=${profile}`, "about:blank"];
const child = spawn(chrome, [...(process.env.CHROME_FLAGS ?? "").split(" ").filter(Boolean), ...flags], { stdio: "ignore", detached: true });
const rows = [];
const started = new Date(Date.now() - 1000).toISOString().replace(/\.\d+Z$/, "Z");
let id = 0;
const pending = new Map();
let rssPeak = 0;
let pageSession = null;
let send = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function stacksOf(list) {
  const out = [];
  for (const part of (list ?? "").split(",")) {
    const [a, b] = part.split("-").map(Number);
    if (Number.isInteger(a) && Number.isInteger(b)) for (let i = a; i <= b; i++) out.push(i);
    else if (Number.isInteger(a)) out.push(a);
  }
  return out;
}
function rss() {
  try {
    const kb = execFileSync("ps", ["-o", "rss=", "-g", String(child.pid)], { encoding: "utf8" })
      .split("\n")
      .map(Number)
      .filter(Number.isFinite)
      .reduce((a, b) => a + b, 0);
    rssPeak = Math.max(rssPeak, Math.round(kb / 1024));
  } catch {
    // the group is gone
  }
}
async function version() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return r.json();
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error("Chrome did not open its debugging port");
}

try {
  const v = await version();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  send = (method, p = {}, sessionId) =>
    new Promise((res, rej) => {
      const msgId = ++id;
      pending.set(msgId, { res, rej });
      ws.send(JSON.stringify({ id: msgId, method, params: p, ...(sessionId ? { sessionId } : {}) }));
    });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message));
      else p.res(m.result);
      return;
    }
    if (m.method === "Runtime.consoleAPICalled") {
      if (m.params.type === "error" || m.params.type === "warning") console.log(`page ${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").split("\n")[0]}`);
      for (const a of m.params.args) {
        if (typeof a.value === "string" && a.value.startsWith('{"viewer":"nils"')) {
          try {
            const row = JSON.parse(a.value);
            rows.push(row);
            // after the page's own collection: the V8 heap against the array buffers behind it
            if (row.measure.startsWith("memory_after") && pageSession)
              send("HeapProfiler.collectGarbage", {}, pageSession)
                .then(() => send("HeapProfiler.collectGarbage", {}, pageSession))
                .then(() => send("Runtime.getHeapUsage", {}, pageSession))
                .then((h) => rows.push({ viewer: "nils", candidate: row.candidate, measure: `${row.measure}_split`, value: Math.round(h.usedSize / 1e6), backing_mb: Math.round((h.backingStorageSize ?? 0) / 1e6), embedder_mb: Math.round((h.embedderHeapUsedSize ?? 0) / 1e6) }))
                .catch(() => undefined);
          } catch {
            // a line the console mangled
          }
        }
      }
    }
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      console.log(`page error: ${d.exception?.description?.split("\n")[0] ?? d.text}`);
    }
  };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  pageSession = sessionId;
  await send("Runtime.enable", {}, sessionId);
  await send("Page.enable", {}, sessionId);
  await send("Page.navigate", { url: `${BENCH}/bench.html?${query}` }, sessionId);
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end && !rows.some((r) => r.measure === "done")) {
    rss();
    await sleep(500);
  }
  await send("Browser.close").catch(() => undefined);
  ws.close();
} catch (e) {
  console.log(`bench: ${e.message}`);
} finally {
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // already gone
  }
  rmSync(profile, { recursive: true, force: true });
}

const candidate = rows[0]?.candidate ?? `nils-${params.get("mode") ?? "mpr"}`;
rows.push({ viewer: "nils", candidate, measure: "process_rss_peak_mb", value: rssPeak });

// the audit: one row per person and stack, however many planes the grid asked for
if (process.env.ENGINE_URL && params.get("mode") === "grid") {
  try {
    const r = await fetch(`${process.env.ENGINE_URL}/api/audit?action=instance.open&since=${encodeURIComponent(started)}&limit=5000`);
    const doc = await r.json();
    // the grid's stacks opened since the run began (the engine keeps one row per person and stack in ten minutes)
    const grid = new Set(stacksOf(params.get("stacks")));
    const list = (doc.rows ?? []).filter((x) => (x.at ?? "") >= started && grid.has(x.scope?.stack));
    const stacks = new Set(list.map((x) => x.scope?.stack));
    rows.push({ viewer: "nils", candidate, measure: "audit_rows", value: list.length, stacks: stacks.size });
  } catch (e) {
    rows.push({ viewer: "nils", candidate, measure: "audit_rows", value: null, note: e.message });
  }
}

if (rows.length <= 1) {
  console.log("no numbers: is the bench served, does the engine answer, is the stack there?");
  process.exit(1);
}
const verdicts = [];
for (const r of rows) {
  const extra = Object.entries(r)
    .filter(([k]) => !["viewer", "candidate", "measure", "value"].includes(k))
    .map(([k, v]) => `${k} ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(", ");
  console.log(`${r.measure}: ${typeof r.value === "object" ? JSON.stringify(r.value) : r.value}${extra ? ` (${extra})` : ""}`);
  if (r.measure === "mpr_ms_median" && r.value !== null) verdicts.push(r.value <= 17 && r.p95 <= 33 ? "MPR within 17 / 33 ms" : `MPR over budget: ${r.value} / ${r.p95} ms`);
  if (r.measure === "orientation_all") verdicts.push(r.value ? "orientation labels right" : "orientation labels WRONG");
  if (r.measure === "audit_rows" && r.value !== null) {
    const tiles = rows.find((x) => x.measure === "grid_all_shown_ms")?.tiles;
    verdicts.push(r.value === tiles && r.stacks === tiles ? `one audit row per stack (${r.value})` : `audit rows ${r.value} for ${tiles} tiles over ${r.stacks} stacks`);
  }
}
for (const v of verdicts) console.log(`gate: ${v}`);
if (process.env.OUT) for (const r of rows) appendFileSync(process.env.OUT, `${JSON.stringify({ query, ...r })}\n`);
const ok = rows.some((r) => r.measure === "done") && !verdicts.some((v) => /over budget|WRONG|audit rows/.test(v));
process.exit(ok ? 0 : 1);
