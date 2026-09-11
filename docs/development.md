# Working on the desk

What someone changing the desk needs and the [documentation](https://kineuro.se/nils/docs/desk/install/) does not cover. Installing, configuring and choosing who may sign in are on the documentation site.

## The layout

| | |
|---|---|
| `desk/` | The Rust binary: the session, the proxy, the store, the capabilities document. `cargo test` runs it against a fake engine. |
| `web/` | The React front end, embedded into the binary at build time. `npx vitest run` tests the shell's predicates. |
| `nils-desk.example.toml` | The configuration, annotated. |
| [`kineuro/nils`](https://github.com/kineuro/nils) | The contracts the desk is generated from: `contracts/openapi` and `contracts/suite`. |

## Building and running it

```sh
cd web && npm ci && npm run build && cd ../desk && cargo build --release
cp ../nils-desk.example.toml nils-desk.toml   # edit the engine url
./target/release/nils-desk check --config nils-desk.toml
./target/release/nils-desk serve --config nils-desk.toml
```

`check` compares the engine's contract versions with the desk's and exits non zero, by name, when the engine is behind. `serve` refuses to start on the same condition; an engine that is ahead is a warning the shell shows in its footer; an engine that does not answer is a state the shell renders, not a refusal.

## The viewer

Review's viewer is cornerstone3D over the desk's own `nils:` image loader: a ring of slabs around the current plane, fetched ahead of the scroll through the engine's instance doors and evicted behind, decoded in a worker pool by the OpenJPH (HTJ2K) and OpenJPEG (JPEG 2000) WASM decoders, which `npm run build` copies from their packages into `web/public/codecs/` so they are served from the desk's own origin. The first picture is the server's render; the decoded plane replaces it. The level follows the viewport. The loader's ring and eviction are pure and tested (`web/src/viewer/ring.test.ts`). The viewer's own numbers sit in its footer; to read them headless against a running desk and a stack the engine serves:

```sh
cd web && DESK_URL=http://127.0.0.1:7203 node scripts/viewer-bench.mjs <stack id>
```
