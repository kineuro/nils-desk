# Changelog

All notable changes to the NILS desk are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The first release will be 1.0.0; until then pre-releases are tagged `v1.0.0-alpha.N`.

## [Unreleased]

### Added

- An answer's markdown is drawn in every case: six heading levels, footnotes gathered at its end, the note, tip, important, warning and caution quotes GitHub writes, sub and superscripts, named and numbered character references, a details block, and the few HTML tags that only shape words. A single tilde no longer strikes words through, so "~5 subjects" keeps its tilde, and a loose task item no longer shows its brackets. A formula written between dollars, as \(...\) or \[...\], or in a math fence is drawn as MathML in Noto Sans Math, which the desk serves itself, while a price such as "$5 and $10" stays words; code is coloured by its language; each loads the first time an answer needs it. A reply still arriving no longer shows a half-formed table, bare asterisks or half a link, and copying works on a desk served over plain HTTP, where the browser keeps the clipboard away (the chat, slice 8).
- An answer shows what the model reasoned as a folded block above it, with the number of words; opened, the reasoning reads in a quieter style, and while the model is still reasoning the block says Thinking. Both kinds of reasoning show: what the runtime separated, which the page dropped before, and reasoning a model left inline in its words, read out for `<think>`, Gemma 4's channel, gpt-oss's harmony channels, Mistral's `[THINK]`, the markers of Cohere and Kimi K3, and the namespaced think tags. Reasoning is never copied with an answer, and each step of a reply keeps its words a paragraph apart, where two steps ran together before (the chat, slice 9).
- A new conversation is named by the model once its first answer settles: the assistant turns its first message into a name of a few words, and the head and the lists take it as soon as it arrives. Until then the conversation keeps the start of its first message, and a name you give with Rename or /rename always stays. It needs nils-assistant's titles by the model (the chat, slice 10).
- `/summarize` summarizes the earlier conversation now, so it takes less of the model's window. The thread shows where you asked and a one-line answer, the note above the thread counts the summary, and the context meter shows again after the next answer. A conversation still too short to summarize says so, and no model is asked. It needs nils-assistant's summarize (the chat, slice 11).

## [1.0.0-alpha.21] - 2026-09-14

Released beside the engine's 1.0.0-alpha.21 so the two stay in step. That engine changes nothing the desk reads, so every change works with the engine's 1.0.0-alpha.20 as well. The thread, sharing, memory, and export and recall each need the nils-assistant change named with it.

### Added

- The assistant's words are drawn from their markdown: headings, lists, quotes, tables that scroll inside themselves on a narrow screen, and code with a button that copies it. Raw HTML reads as the text it is, a link opens only to the web or to mail, and an image is named, never loaded. A Query card's discussion draws them the same way.
- A person's message on the Assistant page can be copied or edited, and an answer copied, asked for again, or marked good or missed, with a reason when the person gives one. An edited message, or an answer asked for again, continues as another version of the conversation from that message, reading what the model read before it; the versions of a message are a click apart where it stands (2 / 3), and in the lists they are one conversation, renamed, pinned, archived and deleted together. It needs nils-assistant's versions and verdicts (the chat, slice 4).
- The message box takes commands after a slash, offered as it is typed and completed with Tab: /new, /fork to continue in a copy of the conversation, /rename, /status for the model and how full the context is, and /help. Esc stops a turn, here and in a card's discussion, and Up in an empty box edits the last message.
- A new conversation offers a few ways to begin for the station chosen; one picked is put in the box, to change or to send.
- A conversation can be shared from its head, or with /share: with people named from the desk, or with everyone on it who uses the assistant. A share shows what was said and the query versions proposed, as the conversation stood when shared or last updated, never what a tool returned; its cards open on the Query page under the reader's own roles, and a reader whose roles do not reach the most the conversation could have read is refused, with the class named. Its owner sees who opened it, updates it, or stops sharing, and a reader may continue it as a conversation of their own. Shared, under Assistant, lists what others share with the person and what they share. The desk lists the people on it with `GET /desk/people`, for a person holding assist. It needs nils-assistant's shares (the chat, slice 5).
- Memory, under Assistant: what the assistant reads at the start of each new conversation. A person sees what they asked it to keep and the notes kept from their work, adds, edits and deletes them, pauses memory, or deletes everything; everyone reads the install's instructions, and an admin writes their next version. In a conversation, "remember that ..." or /remember keeps something at once, a memory the assistant offers waits for Save or Not now, and the thread says what was kept or forgotten. The assistant refuses a memory that looks like a person's data. It needs nils-assistant's memory (the chat, slice 6).
- A conversation is saved as a markdown file with Export, among its actions or with /export: what was said, the steps and the query versions proposed, never what a tool returned. When a person refers to an earlier conversation, the assistant finds their own by the words of their titles and of the answer each ended with, and the thread names that step. A turn that settles without words of its own shows the sentence it settled on as its answer. It needs nils-assistant's recall and export (the chat, slice 7).

## [1.0.0-alpha.20] - 2026-09-14

Released beside the engine's 1.0.0-alpha.20 so the two stay in step. That engine changes nothing the desk reads, so every change works with the engine's 1.0.0-alpha.19 as well. The conversations kept for each person need nils-assistant's conversation doors, and the meter needs its context.

### Added

- Conversations with the assistant are kept by the assistant, per person, and no longer in the browser. The side lists the pinned and the latest under Assistant, and All conversations lists every one, searched by title and grouped by when it was last used, the archived on a tab of their own; each is renamed, pinned, archived or deleted there or from its own head. A reload shows which proposals were accepted or disregarded. The conversations this browser kept before are offered to the assistant once, which keeps those that were the person's. It needs nils-assistant's conversation doors (the chat, slice 1).
- A conversation shows how full its context is: a thin meter by the composer, and in a Query card's discussion, reads the share of the model's window the conversation holds, amber from 70%. Once the assistant has summarized earlier turns to stay within the window, the thread says so, and the whole conversation still shows. It needs nils-assistant's context (the chat, slice 3).

### Changed

- The desk forwards the assistant's doors only for a person holding `assist`, as it already did for the token it pushes.

## [1.0.0-alpha.19] - 2026-09-13

Released beside the engine's 1.0.0-alpha.19 so the two stay in step. The charts of a Query card read the profile door that engine adds, and accepting a version the assistant proposed keeps it under the version open, which that engine learned too; every other change works with the engine's 1.0.0-alpha.18 as well.

### Added

- The Query page, built back as cards. Every query kept is a card with its versions and when it last ran; a new one starts from everyone or from cohorts, and any card starts a new card from the version open. A card opens on a version: where the counts go under the step chosen, the step's conditions with a button to take one away, and the moves the engine offers as the next step, typed in by hand, with the values a field holds most offered as proposals for a condition. Applying a move opens the next version, and every version stays a click away. On the right, the card's steps run as a timeline from its start to its answer, each with its count. Run counts the answer, and Preview shows its first rows.
- The charts of a Query card. Above the editor stands what is under the step chosen on the timeline: its subjects, sessions and stacks, each counted once however many paths reach it, then its stacks by type, its stacks by a field chosen from the catalog, the sex and the age of its subjects where the role may read them, and the kinds of their clinical events. Where the rows go under a step now says they are rows, beside the subjects, and a step of subjects on the timeline counts its subjects.
- Talk it through on a Query card: say a change in words, and the assistant that builds queries proposes it as the card's next version. The proposal stands in the steps as a dashed step with what it changes, to accept, which keeps it as the next version of the version open, or to disregard. The discussion stays with the card and picks up again on any of its versions, and the Assistant page lists it with the other conversations.
- The query an Assistant conversation is about floats over the chat as its card while the person and the assistant talk: the version the assistant proposes, with what it changes, to accept or disregard; the card's versions; its steps, each open to change by hand, where a change is the card's next version and the next message carries it; and the charts of the step chosen. The card folds down to its proposal, and opens on the Query page.

### Fixed

- The query editor mapped a move kind the engine never sends, so picking one per subject, bringing in fields and a time window's policy were never offered. Every kind of the engine's move catalog lands on its step now.
- Starting a query from an uploaded list sent the list as a number, which the engine refused. It is sent as the text the engine reads.

## [1.0.0-alpha.18] - 2026-09-13

Released beside the engine's 1.0.0-alpha.18 so the two stay in step. The Data page reads the sources door that engine adds; every other change works with the engine's 1.0.0-alpha.17 as well.

### Added

- The Data page, built back around sources. Each source place is a card: its name and folder, how what comes in is handled, the subjects, sessions and stacks it holds, and how many digests have read it and when. The chosen source lists its newest digests, each with the files it read, new, changed, unchanged and refused, and its four stages (walked, digested, classified, reviewed) as marks with their counts; a digest still reading shows so and the page reads again every twenty seconds. For an operator, Digest what is new queues a digest of the source, Handling declares whether it arrives identified and what a release does on the way out, and Bring DICOM in opens the setup's flow in a dialog. It reads the engine's `GET /api/sources`, in the engine's 1.0.0-alpha.18.

### Changed

- The assistant has a page of its own, Assistant, under Home, and the rail on the right of every page is gone. The conversations this browser keeps are listed under it in the side, newest first, below New conversation. A conversation shows what the assistant did as a folded list of steps, each new version of a query it proposes, to accept or disregard, a choice answered with a click, and a plan to confirm. The station it talks to is chosen beside the box before the first message, and a turn can be stopped. Plan it with the assistant, on the setup page, opens a new conversation with its sentence ready to send.
- Ask is called Query, and waits to be built back as the other sections do.

### Fixed

- The Assistant is offered while an install is still being set up, as the rail was, so Plan it with the assistant opens a conversation from the setup page.
- The menu button of the top bar showed on a wide window, where the side is always open. It shows only on a narrow window now.

## [1.0.0-alpha.17] - 2026-09-13

Released beside the engine's 1.0.0-alpha.17 so the two stay in step. Every change here works with the engine's 1.0.0-alpha.16 as well.

### Fixed

- A change of how people sign in signed nobody out. A desk moved from nobody signing in to the people it keeps, by running `nils setup` again, still took a browser that had opened it before as the operator, with every entitlement and no password; the engine refused that person, so the page said the engine did not answer. The desk now records how people sign in, and when that changes (the mode, the origin a local desk signs for, or the provider) every session and every login in flight is cleared. The first start of this version counts as such a change, so everyone signs in once more. In local mode a session also holds only for a person the desk still keeps.
- A desk in local mode that keeps nobody yet says so on its login page, with how to add the first person.
- The desk's start said the engine did not answer when the engine had answered and asked for a person's token. It says so now.

## [1.0.0-alpha.16] - 2026-09-13

Released beside the engine's 1.0.0-alpha.16 so the two stay in step. Choosing a folder by clicking reads the door that engine's supervisor adds; every other change works with the engine's 1.0.0-alpha.15 as well.

### Added

- A theme switch in the top bar, beside the person: as the system, dark or light. The choice is kept in the browser and holds from the first paint.
- Settings opens on an overview, a card for each page: whether every part answers and a newer release, how many places there are and whether each stands up to its role, the last backup and the schedule, what keeps the registry, how people sign in, the model the assistant reaches, and the newest act of the audit log. What needs a person is listed above the cards, the worst first, and a card opens its page. What the cards read is kept between pages and read again on asking.
- The Places, Database and Identity pages start with their few numbers: the places, the sources, how many need attention and the least room; what keeps the registry, the last backup, the schedule and the archives; how people sign in, how many, and where the desk answers.
- A folder is chosen by clicking as well as typed, wherever one is asked for: Home's step for bringing DICOM in, adding a place, and moving one. For an admin, where the supervisor answers, a button in the field opens the folders under it: the places already declared and the disks to start from, then the folders inside the one open, each with the disk mounted there, no access, or a disk that /etc/fstab names and is not mounted, said before anything is written there. A folder that does not answer within five seconds says so rather than holding the page.
- A place moves to another folder on its page: a source, an export, a share, a working or an exchange place. A source moved where a service keeps the engine running starts the engine again to read the new folder. The registry and the backup place say how they move instead.
- A first page that sets an install up. Until the steps the desk needs are done, an operator's Home is a page of them: NILS is installed, bringing DICOM in, keeping the registry safe and deciding who signs in, with a model for the assistant worth doing beside them. Each step checks itself from what the parts report, turns green once what it needs is there, and is acted on where it stands: a folder looked inside and added as a source, the engine's backup folder named the registry's backup place, a daily schedule, a first backup, a person added. Beside the steps, what each word of NILS means and how many of each an install has. Once every needed step is done the page says so and opens Home, and Settings keeps it as Setup; Home says how far setup is while a step is left.
- The rest of the desk joins the side once an install is set up: Ask, Data, Review, Release and Pipelines, each where the engine serves its doors and the person may open it, as a page that says what it will do while it is built back.

### Changed

- Each Settings page says what it is in one short line.
- Home no longer carries the band of setup steps; they have their own page.
- One side panel. The sections sit at its top and Settings at its foot. The open section unfolds its pages under it; Settings, once opened, rises to sit under the last section with its pages below it, and goes back down when another section opens. The second column that listed Settings' pages is gone. On a narrow window the side is a panel over the page, opened from the top bar.
- A place added or opened, a person added, and a purpose moved open in a dialog over the page, not a drawer at its side. On a phone the dialog rises from the bottom as a sheet.
- The Places page draws the places it read last at once, and says when that was. It reads them again when asked, after a change made on it, or when Home or the Database page has read them since, not every time it opens.

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
