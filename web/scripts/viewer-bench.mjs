// SPDX-License-Identifier: AGPL-3.0-only
// The viewer's own bench (Wave 5 slice B6's gate by hand): headless Chrome
// opens a stack's page on a running desk with ?bench=1, the viewer scrolls
// every plane and prints its numbers; this prints them as a table. Run on
// the rig against a synthetic volume, or on the group's workstation against
// the deployment.
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
const seconds = Number(secondsArg ?? 90);
const url = `${DESK}/?bench=1#stack/${stack}`;
const chrome = process.env.CHROME ?? "google-chrome";
const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--enable-logging=stderr", "--v=0", "--window-size=1024,1100", `--virtual-time-budget=${seconds * 1000}`, "--screenshot=/dev/null", url];
const child = spawn(chrome, args, { stdio: ["ignore", "ignore", "pipe"] });
const rows = [];
let buf = "";
child.stderr.on("data", (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    const m = /"({\"viewer\":\"nils\".*?})"/.exec(line) ?? /({"viewer":"nils".*})/.exec(line);
    if (m) {
      try {
        rows.push(JSON.parse(m[1].replace(/\\"/g, '"')));
      } catch {
        // a line the console mangled
      }
    }
  }
});
const timer = setTimeout(() => child.kill("SIGKILL"), (seconds + 20) * 1000);
child.on("exit", () => {
  clearTimeout(timer);
  if (rows.length === 0) {
    console.log("no numbers: is the desk up, does the engine serve the instance doors, is the stack there?");
    process.exit(1);
  }
  for (const r of rows) {
    const extra = Object.entries(r).filter(([k]) => !["viewer", "measure", "value"].includes(k)).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(`${r.measure}: ${r.value}${extra ? ` (${extra})` : ""}`);
  }
  const done = rows.some((r) => r.measure === "done");
  process.exit(done ? 0 : 1);
});
