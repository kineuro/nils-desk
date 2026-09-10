# Changelog

All notable changes to the NILS desk are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The first release will be 1.0.0; until then pre-releases are tagged `v1.0.0-alpha.N`.

## [Unreleased]

## [1.0.0-alpha.3] - 2026-09-10

### Fixed

- A relative path in the configuration is relative to the configuration. The wizard ends by printing the one command a person runs by hand, `nils-desk user add <name> --admin --config <path>`. Run from your own directory it said "added", made a second store where you stood, and left the desk you meant refusing the login with nothing to say why. The service never noticed, because systemd gives it a working directory; a person has none. Every command now loads its configuration by path and reads `store`, `[local] key` and `[oidc] client_secret_file` as relative to it. A path spelled out in full is left alone.
- The installer's own flag has a name of its own. `--dir=DIR` meant where the binary goes, and `--dir DIR` was passed to the wizard, where it means where the registry and everything else lives: one flag, two meanings, told apart by an equals sign. The script's flag is `--bin-dir` now, and `--help` says which is which.

## [1.0.0-alpha.2] - 2026-09-10

### Added

- Container images, `ghcr.io/kineuro/nils-desk`, for x86-64 and arm64, published with every release and public.

### Fixed

- The provider a `nils-desk register` makes now allows the grant types it needs. Without them Authentik refused the first real login with `invalid_request: The request is otherwise malformed`.
- The engine is asked with the person's own bearer, so a signed-in person no longer reads "the engine did not answer" in `oidc` mode, where the desk holds no bearer of its own.
- The shell checks the login before the engine: someone with no session has no bearer, so the engine's 401 said nothing about the engine, and a 401 or 403 now counts as reachable.

## [1.0.0-alpha.1] - 2026-09-10

### Added

- The first release: `nils-desk` for five targets with their checksums, the web application inside the binary.
