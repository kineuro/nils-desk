# nils-desk

**The desk of NILS.** One process, the only origin a person's browser talks to: it holds the session and the person's tokens, serves the front end from bytes compiled into the binary, proxies the engine, Kvasir, the assistant and registered apps on one origin, and composes the deployment capabilities document that every section, control and menu item is a predicate over. It owns nothing that answers "who changed this": that is the engine's actor.

> **Pre-alpha.** Built in the open as part of Wave 4c of NILS v1 (`kineuro/nils`, `docs/specs/wave4c-the-assistant.md`, sections 4 and 7). Nothing here runs yet.

## Where things are

| | |
|---|---|
| [`kineuro/nils`](https://github.com/kineuro/nils) | The engine, the design record, the specifications and the contracts this desk is generated from (`contracts/openapi`, `contracts/suite`). |
| `desk/` | The Rust binary: the session, the proxy, the store, the capabilities document. |
| `web/` | The React front end, embedded into the binary at build time. |

## The three modes

`off` (one person, every entitlement), `local` (users the desk keeps, its own issuer and JWKS) and `oidc` (an identity provider through a trust list). The engine, Kvasir and the desk speak the same five entitlements, fixed in `contracts/suite/v1`.

## License

AGPL-3.0-only, under the same [Contributor License Agreement](CLA.md) as the engine. See [CONTRIBUTING.md](CONTRIBUTING.md).
