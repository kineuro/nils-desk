// SPDX-License-Identifier: AGPL-3.0-only
// The workbench, headless (Wave 5 slice B3's bar): every authored question
// runs through the desk's own path, write then store then run, against a
// live engine, and its numbers are compared with the station's document for
// the same question. A second pass builds one question by clicking (the
// apply door, move by move) and checks it hashes the same as the written one.
//
//   ENGINE_URL=http://127.0.0.1:18090 node scripts/headless.mjs <gold dir> [<station run json>]
//
// Prints one line per question and a summary; exits 1 when a number differs.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ENGINE = process.env.ENGINE_URL ?? "http://127.0.0.1:18090";
const TOKEN = process.env.ENGINE_TOKEN ?? null;
const [goldDir, stationRun] = process.argv.slice(2);
if (!goldDir) {
  console.error("usage: headless.mjs <gold dir> [<station run json>]");
  process.exit(2);
}

async function door(method, path, body) {
  const headers = { "content-type": "application/json", "X-Nils-Desk": "1" };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  const r = await fetch(`${ENGINE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${j.error ?? ""}`);
  return j;
}

const station = stationRun ? JSON.parse(readFileSync(stationRun, "utf8")) : null;
// the station's run names an authored question "auth-<gold file name>"
const byId = new Map((station?.results ?? []).map((r) => [String(r.id).replace(/^auth-/, ""), r]));

let same = 0, differ = 0, failed = 0, uncompared = 0;
const files = readdirSync(goldDir).filter((f) => f.endsWith(".ask.yml")).sort();
for (const f of files) {
  const text = readFileSync(join(goldDir, f), "utf8");
  const id = f.replace(/\.ask\.yml$/, "");
  try {
    // the write path: draft repairs and stores, exactly what the Start page does
    const d = await door("POST", "/api/ask/draft", { text });
    if (d.document === null) {
      failed++;
      console.log(`${id}: did not validate: ${(d.diagnosis?.issues ?? []).map((i) => i.message).join("; ")}`);
      continue;
    }
    const ran = await door("POST", "/api/ask/run", { document_id: d.document });
    let verdict = "";
    const s = byId.get(id);
    if (s?.document) {
      const theirs = await door("POST", "/api/ask/run", { document_id: s.document });
      const equal = theirs.content_hash === ran.content_hash;
      const rowsEqual = theirs.row_count === ran.row_count;
      if (equal) same++;
      else differ++;
      verdict = equal ? "same hash as the station" : rowsEqual ? `same rows (${ran.row_count}), different hash` : `differs: station ${theirs.row_count} rows, desk ${ran.row_count} rows`;
    } else {
      uncompared++;
      verdict = "no station document to compare";
    }
    console.log(`${id}: doc ${d.document} rows ${ran.row_count} hash ${String(ran.content_hash).slice(0, 12)}; ${verdict}`);
  } catch (e) {
    failed++;
    console.log(`${id}: ${e.message}`);
  }
}

// click against talk: rebuild one cohort-scoped count by moves and compare the hash with the written document
let clicked = "not attempted";
try {
  const written = await door("POST", "/api/ask/draft", { text: readFileSync(join(goldDir, "cohort-b-size.ask.yml"), "utf8") });
  const start = await door("POST", "/api/ask/start", { from: { cohorts: ["ms-cohort-b"] } });
  const stored = await door("POST", "/api/ask/documents", { document: start.document });
  const opts = await door("POST", "/api/ask/options", { document_id: stored.document, set: start.set });
  const setOut = opts.moves.find((m) => m.kind === "set_out");
  let head = stored.document;
  if (setOut) {
    const a = await door("POST", "/api/ask/apply", { document_id: head, epoch: opts.epoch, token: opts.token, set: start.set, moves: [{ move_id: setOut.id, args: { set: start.set, level: "count" } }] });
    head = a.document;
  }
  const a = await door("POST", "/api/ask/run", { document_id: head });
  const b = await door("POST", "/api/ask/run", { document_id: written.document });
  clicked = a.content_hash === b.content_hash ? `clicked and written hash the same (${String(a.content_hash).slice(0, 12)})` : `clicked ${a.row_count} rows ${String(a.content_hash).slice(0, 12)}, written ${b.row_count} rows ${String(b.content_hash).slice(0, 12)}`;
} catch (e) {
  clicked = `click path: ${e.message}`;
}

console.log(`\n${files.length} questions: ${same} same as the station, ${differ} differ, ${uncompared} uncompared, ${failed} failed; ${clicked}`);
process.exit(differ + failed > 0 ? 1 : 0);
