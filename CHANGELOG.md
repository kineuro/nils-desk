# Changelog

All notable changes to the NILS desk are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The first release will be 1.0.0; until then pre-releases are tagged `v1.0.0-alpha.N`.

## [Unreleased]

## [1.0.0-alpha.15] - 2026-09-13

Released beside the engine's 1.0.0-alpha.15 so the two stay in step. Home and Settings are the chosen design's; the Database page reads doors that engine adds, and every other page shows wherever the part it reads answers.

### Added

- Home, as the chosen design of the home page draws it. A strip of the parts says whether each answers. For an operator, a band of steps makes an install ready for real work, each worked out from what the parts report: how it is installed, a model for the assistant, bringing DICOM in, keeping the registry safe, and who signs in. The band leaves Home once every step is done. Four tiles say what the registry holds, what needs you, what is running and what changed since your last visit.
- Bringing DICOM in from Home. The supervisor looks inside a folder, and each folder inside that holds DICOM is ticked to become a batch of its own, with the pack that reads it. The folder is added as a source, the supervisor starts the engine again to read it, and a digest is queued for each ticked folder. The command a person would run by hand is beside the buttons, and where no service runs the engine, it is the command alone.
- The shell's top bar, for an admin, says how the install runs and when a newer release is out, from the supervisor's report.
- Settings, as the chosen design draws it, for an operator or an admin: a nav of its pages beside the side, and the page it opens. The desk offers a page only once it is built.
- The Parts page. Every part the deployment runs is a row with its version, the unit that runs it, its health and what a newer release does to it, with the model runtime beside the gateway. When a newer release is out, the page says what taking it changes, part by part, and an admin takes it with one button, beside `nils update --all`. What keeps the install running, a restart of one part or of all of them in order, and the address each part answers at are below. The engine, the desk and the assistant each have a page of their own, with what they are, what they reach, and a restart.
- The Database page, for an admin, where the engine serves its doors. It says what keeps the registry, where, and whether it passes the rule of a backup place elsewhere; that the pseudonym key is in no backup and how it is made again; and what was fixed when the registry was made. The backups list every archive with its size, how long it took and its last check. An admin backs up now or rehearses a restore of the newest archive with one button, beside the command, and sets the schedule and how many archives are kept. The registry's calendar, its timezone and the day its week starts on, is changed there too. Home's step to keep the registry safe reads the same door where the engine serves it: when the last archive was written, whether it passed its check, and when a backup runs.
- The Places page, for an operator. Every place is a row with its role, its path and what the engine does with it, what was declared of it, how much room it has, and whether it stands up to what its role must have. A place is added in a drawer: a source is looked inside first, each folder inside becomes a batch of its own or the whole folder one batch, and where a service keeps the engine running, the engine is started again to read the source and the digests are queued. An opened place has its guarantees changed, or is retired. Home's step for bringing DICOM in adds a source the same way.
- The Gateway and models page, under the parts, where the gateway answers the desk. It says whether the gateway is warm and how busy its streams are, the machine's card and what it can serve, the model server each local backend runs, and each provider with whether the gateway holds its key, which an admin replaces or forgets without it ever being shown. Every model is a row with the context it takes, where its prompts go, whether a local one passed its admission, and the stations it answers. What may leave is listed purpose by purpose, and an admin moves a purpose to another backend there: at once where nothing more is needed, and with a written reason, recorded beside it, where rows of the archive would leave. Identifiers are never offered a provider.
- The Identity page, for an admin. It says how people sign in, where the desk answers and at what other addresses, how the desk signs or which provider signs people in, how long a session lasts and how many are open now. In local mode it lists the people the desk keeps, with when each last signed in, and an admin changes what a person may do on the ladder, or adds a person, at once. How people sign in and where the desk answers are set up again with `nils setup`, beside them. The desk's users list says when each person last signed in and how many sessions are open, and its capabilities name its other addresses and how it signs.
- The Audit page, for an admin, where the engine serves its audit log: every act, newest first, with when it was done, who did it and for whom, what it touched and the epoch it moved to, narrowed by who acted, the act and the month.

### Fixed

- The desk forwarded a person's bearer to the supervisor, a token the desk signs in local mode or the provider's in oidc mode, and the supervisor knows only the tokens in its own configuration, so every call from Settings was refused. The desk now sends the supervisor the token from its `[supervisor]` table in every mode, once it has checked, as before, that the person is an admin.
- While a model backend was still warming, the desk showed nothing but a page saying so, which hid every section, Settings and its Gateway page with them, though the page itself said the rest of the desk works. It now says so in a banner above the page, the desk works as usual, and only the assistant waits.

## [1.0.0-alpha.14] - 2026-09-13

Released beside the engine's 1.0.0-alpha.14 so the two stay in step: a container install names both images with the engine's version. The desk itself is unchanged.

## [1.0.0-alpha.13] - 2026-09-12

Released beside the engine's 1.0.0-alpha.13 so the two stay in step: a container install names both images with the engine's version.

### Changed

- The one-line installer opens with the NILS wordmark, Karolinska Institutet and the link, and shows a bar while the binary downloads.

## [1.0.0-alpha.12] - 2026-09-12

### Fixed

- The one-line installer put 1.0.0-alpha.9 on every machine after 1.0.0-alpha.11 was out. With every release a pre-release, GitHub has no `latest` release, and the installer took the first release the API listed, which is not in version order. It now takes the highest version listed.

## [1.0.0-alpha.11] - 2026-09-12

No change of its own. Released beside the engine's 1.0.0-alpha.11 so the two stay in step: a container install names both images with the engine's version.

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
