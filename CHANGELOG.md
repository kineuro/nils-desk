# Changelog

All notable changes to the NILS desk are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The first release will be 1.0.0; until then pre-releases are tagged `v1.0.0-alpha.N`.

## [Unreleased]

## [1.0.0-alpha.10] - 2026-09-12

No change of its own. Released beside the engine's 1.0.0-alpha.10 so the two stay in step: a container install names both images with the engine's version.

## [1.0.0-alpha.9] - 2026-09-12

No change of its own. Released beside the engine's 1.0.0-alpha.9 so the two stay in step: a container install names both images with the engine's version.

## [1.0.0-alpha.8] - 2026-09-11

No change of its own. Released beside the engine's 1.0.0-alpha.8, whose wizard offers podman and docker side by side, so the two stay in step: a container install names both images with the engine's version.

## [1.0.0-alpha.7] - 2026-09-11

No change of its own. Released beside the engine's 1.0.0-alpha.7, which runs the gateway and the assistant in containers and restarts what an update changed, so the two stay in step: a container install names both images with the engine's version.

## [1.0.0-alpha.6] - 2026-09-11

No change of its own. Released beside the engine's 1.0.0-alpha.6, which adds `nils uninstall`, so the two stay in step: a container install names both images with the engine's version.

## [1.0.0-alpha.5] - 2026-09-11

No change of its own. Released beside the engine's 1.0.0-alpha.5 so the two stay in step: a container install names both images with the engine's version, and a desk without that tag would be built on the machine instead of pulled.

## [1.0.0-alpha.4] - 2026-09-10

### Fixed

- The installer opens the terminal instead of asking whether it is there. Piped into a shell with no controlling terminal it put the binary down and then died on `cannot open /dev/tty`: the device is still there, passes every test that can be made of it, and refuses to open, so the branch meant to fall back to the defaults never ran and a scripted install ended on an error instead of installing. The open is in a subshell, because a redirection that fails on a special builtin ends a shell with `set -e`.

### Changed

- One place knows how a configuration path resolves: `start_at` reads the file through `Config::read` rather than parsing it a second time itself.

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
