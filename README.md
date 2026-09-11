# nils-desk

**The desk of NILS**: the web application over the NILS engine. It is the one address people open in a browser: it signs them in and passes what they do to the engine, and to the assistant where one is installed.

It is part of [NILS](https://github.com/kineuro/nils) and needs a running engine.

> **Pre-alpha.** The desk installs and runs, and its interfaces still change between releases.

## Install

The NILS setup wizard installs the desk with the engine:

```sh
curl -fsSL https://nils.kineuro.se/get | sh
```

To install the desk on its own, from a release, a container image or source, see [Install the desk](https://kineuro.se/nils/docs/desk/install/).

## Documentation

**[kineuro.se/nils/docs](https://kineuro.se/nils/docs/)**

- [Install the desk](https://kineuro.se/nils/docs/desk/install/)
- Who may sign in: [one machine, no login](https://kineuro.se/nils/docs/desk/off/), [the desk keeps the people](https://kineuro.se/nils/docs/desk/local/), or [an identity provider decides](https://kineuro.se/nils/docs/desk/oidc/)
- [The desk's configuration](https://kineuro.se/nils/docs/desk/configuration/)
- [Behind a proxy, and in a container](https://kineuro.se/nils/docs/desk/proxy/)

## The parts of NILS

| Repository | Part |
|---|---|
| [kineuro/nils](https://github.com/kineuro/nils) | The engine: the registry, the rule packs, the `nils` command and the setup wizard. Everything else talks to it. |
| **kineuro/nils-desk** | The desk: the web application over the engine, and where people sign in. |
| [kineuro/nils-assistant](https://github.com/kineuro/nils-assistant) | The assistant: turns a question in words into one the engine answers. |
| [kineuro/kvasir](https://github.com/kineuro/kvasir) | The model gateway: every call the assistant makes to a model goes through it. |

## Building from source

```sh
cd web && npm ci && npm run build && cd ../desk && cargo build --release
```

`desk/` is the Rust binary and `web/` the front end compiled into it. [docs/development.md](docs/development.md) has running it against an engine, the tests, and the viewer's benchmark.

## License

AGPL-3.0-only, under the same [contributor license agreement](CLA.md) as the engine. See [CONTRIBUTING.md](CONTRIBUTING.md).
