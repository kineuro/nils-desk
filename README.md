# nils-desk

The web application of NILS: sign-in, the user interface, and one origin in front of the engine and the assistant. A Rust server with a React front end compiled into the binary.

Pre-alpha.

## Install

Installed with NILS:

```sh
curl -fsSL https://nils.kineuro.se/get | sh
```

## Documentation

https://kineuro.se/nils/docs/desk/install/

## Build

```sh
cd web && npm ci && npm run build && cd ../desk && cargo build --release
```

## Related repositories

- [nils](https://github.com/kineuro/nils): the engine
- [nils-assistant](https://github.com/kineuro/nils-assistant): the assistant
- [kvasir](https://github.com/kineuro/kvasir): the model gateway

## License

AGPL-3.0-only. See [CONTRIBUTING.md](CONTRIBUTING.md).
