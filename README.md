# nils-desk

**The desk of NILS.** One process, the only origin a person's browser talks to: it holds the session and the person's tokens, serves the front end from bytes compiled into the binary, proxies the engine, Kvasir, the assistant and registered apps on one origin, and composes the deployment capabilities document that every section, control and menu item is a predicate over. It owns nothing that answers "who changed this": that is the engine's actor.

> **Pre-alpha.** Built in the open as part of Wave 4c of NILS v1 (`kineuro/nils`, `docs/specs/wave4c-the-assistant.md`, sections 4 and 7). It installs and runs, and the interfaces are still moving: take a release, not a promise of stability.

## Installing

The desk comes with the engine, and one line installs both:

```
curl -fsSL https://nils.kineuro.se/get | sh
```

To take this binary on its own, see [the desk's install page](https://kineuro.se/nils/docs/desk/install/): a release for five targets with the web application inside it, a container image at `ghcr.io/kineuro/nils-desk`, or a build from this repository.

## Where things are

| | |
|---|---|
| [`kineuro/nils`](https://github.com/kineuro/nils) | The engine, the design record, the specifications and the contracts this desk is generated from (`contracts/openapi`, `contracts/suite`). |
| `desk/` | The Rust binary: the session, the proxy, the store, the capabilities document. `cargo test` runs it against a fake engine. |
| `web/` | The React front end, embedded into the binary at build time: `npm ci && npm run build` in `web/`, then `cargo build` in `desk/`. `npx vitest run` tests the shell's predicates. |
| `nils-desk.example.toml` | The configuration, annotated. |

## Running it

```sh
cd web && npm ci && npm run build && cd ../desk && cargo build --release
cp ../nils-desk.example.toml nils-desk.toml   # edit the engine url
./target/release/nils-desk check --config nils-desk.toml
./target/release/nils-desk serve --config nils-desk.toml
```

`check` compares the engine's contract versions with the desk's and exits non zero, by name, when the engine is behind. `serve` refuses to start on the same condition; an engine that is ahead is a warning the shell shows in its footer; an engine that does not answer is a state the shell renders, not a refusal.

## The viewer

Review's viewer (Wave 5 section 8.2) is cornerstone3D over the desk's own `nils:` image loader: a ring of slabs around the current plane, fetched ahead of the scroll through the engine's instance doors and evicted behind, decoded in a worker pool by the OpenJPH (HTJ2K) and OpenJPEG (JPEG 2000) WASM decoders, which `npm run build` copies from their packages into `web/public/codecs/` so they are served from the desk's own origin. The first picture is the server's render; the decoded plane replaces it. The level follows the viewport. The loader's ring and eviction are pure and tested (`web/src/viewer/ring.test.ts`). The viewer's own numbers sit in its footer; to read them headless against a running desk and a stack the engine serves:

```sh
cd web && DESK_URL=http://127.0.0.1:7203 node scripts/viewer-bench.mjs <stack id>
```

## The three modes

`off` (one person, every entitlement), `local` (users the desk keeps, its own issuer and JWKS) and `oidc` (an identity provider through a trust list). The engine, Kvasir and the desk speak the same five entitlements, fixed in `contracts/suite/v1`.

- **local**: `nils-desk user add anna --admin` (the password on stdin) makes the first user; the admin grants `reader`, `reviewer`, `operator`, `admin` and `assist` on the settings page. The desk mints tokens of fifteen minutes for the person who just signed in, signed with an EdDSA key it made at first start, and publishes `/.well-known/jwks.json` and `/.well-known/openid-configuration`; the engine trusts it like any provider (the flags are in `nils-desk.example.toml`). `nils login --desk URL` gets the command line a token of one day.
- **oidc**: `nils-desk register --authentik https://auth.example.org --token FILE --origin https://desk.example.org --allow staff --bind reader=staff --bind operator=neuro-ops ...` creates, idempotently, the application, the OAuth2 provider with a signing key, the policy binding, the five entitlements bound to the groups named and the entitlements scope mapping, then prints the engine's trust flag and the desk's `[oidc]` table. A second run changes nothing. Sign in is the authorization code grant with PKCE; the desk holds the person's tokens and refreshes them before expiry; the display name is recorded beside the subject at first sight, so a person renamed at the provider moves no row.

## License

AGPL-3.0-only, under the same [Contributor License Agreement](CLA.md) as the engine. See [CONTRIBUTING.md](CONTRIBUTING.md).
