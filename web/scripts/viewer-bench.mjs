// SPDX-License-Identifier: AGPL-3.0-only
// The viewer's own bench (Wave 5 slice B6's gate by hand): headless Chrome
// opens a stack's page on a running desk with ?bench=1, the viewer scrolls
// every plane and prints its numbers to the console; this drives the browser
// over the DevTools protocol, collects the lines for a while, and prints them
// as a table. Run on the rig against a synthetic volume, or on the group's
// workstation against the deployment.
//
//   DESK_URL=http://127.0.0.1:7203 node scripts/viewer-bench.mjs <stack id> [seconds]
//
// The floor the study measured: first image under a second on the LAN,
// 60 frames per second through the stack, the whole stack never resident.

import { spawn } from "node:child_process";

const DESK = process.env.DESK_URL ?? "http://127.0.0.1:7203";
const [stack, secondsArg] = process.argv.slice(2);
if (!stack) {
  console.error("usage: viewer-bench.mjs <stack id> [seconds]");
  process.exit(2);
}
const seconds = Number(secondsArg ?? 120);
// the viewport's width decides the level the viewer picks; BENCH_WINDOW sets it (1024 by default, the study's)
const window = Number(process.env.BENCH_WINDOW ?? 1024);
const port = 9222 + Math.floor(Math.random() * 500);
// BENCH_LEVEL forces the pyramid level the viewer scrolls at; unset, the viewport decides
const level = process.env.BENCH_LEVEL ? `&level=${Number(process.env.BENCH_LEVEL)}` : "";
const url = `${DESK}/?bench=1${level}#stack/${stack}`;
const chrome = process.env.CHROME ?? "google-chrome";
const child = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${port}`, `--window-size=${window},${window + 76}`, "--user-data-dir=/tmp/nils-viewer-bench-profile", "about:blank"], { stdio: "ignore" });
const rows = [];
let id = 0;
const pending = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const msgId = ++id;
      pending.set(msgId, { res, rej });
      ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
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
      for (const a of m.params.args) {
        if (typeof a.value === "string" && a.value.startsWith('{"viewer":"nils"')) {
          try {
            rows.push(JSON.parse(a.value));
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
  await send("Runtime.enable", {}, sessionId);
  await send("Page.enable", {}, sessionId);
  await send("Page.navigate", { url }, sessionId);
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end && !rows.some((r) => r.measure === "done")) await sleep(500);
  await send("Browser.close").catch(() => undefined);
  ws.close();
} catch (e) {
  console.log(`bench: ${e.message}`);
} finally {
  child.kill("SIGKILL");
}

if (rows.length === 0) {
  console.log("no numbers: is the desk up, does the engine serve the instance doors, is the stack there?");
  process.exit(1);
}
for (const r of rows) {
  const extra = Object.entries(r).filter(([k]) => !["viewer", "measure", "value"].includes(k)).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`${r.measure}: ${r.value}${extra ? ` (${extra})` : ""}`);
}
process.exit(rows.some((r) => r.measure === "done") ? 0 : 1);
