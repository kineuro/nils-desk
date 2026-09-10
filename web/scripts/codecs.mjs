// SPDX-License-Identifier: AGPL-3.0-only
// Before a build: the two WASM decoders the viewer uses are copied from
// their packages into public/codecs/, so the desk serves them from its own
// origin and the binary embeds them. Their licences ride along.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const out = new URL("../public/codecs/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const files = [
  ["@cornerstonejs/codec-openjph/dist/openjphjs.js", "openjphjs.js"],
  ["@cornerstonejs/codec-openjph/dist/openjphjs.wasm", "openjphjs.wasm"],
  ["@cornerstonejs/codec-openjph/LICENSE", "LICENSE-openjph.txt"],
  ["@cornerstonejs/codec-openjpeg/dist/openjpegwasm_decode.js", "openjpegwasm_decode.js"],
  ["@cornerstonejs/codec-openjpeg/dist/openjpegwasm_decode.wasm", "openjpegwasm_decode.wasm"],
  ["@cornerstonejs/codec-openjpeg/LICENSE", "LICENSE-openjpeg.txt"],
];
for (const [from, to] of files) {
  const src = new URL(`../node_modules/${from}`, import.meta.url).pathname;
  if (!existsSync(src)) {
    if (to.startsWith("LICENSE")) continue;
    console.error(`missing ${from}; run npm ci`);
    process.exit(1);
  }
  copyFileSync(src, join(out, to));
}
console.log(`codecs in place: ${files.length} files`);
