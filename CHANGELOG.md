# Changelog

All notable changes to the NILS desk are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The first release will be 1.0.0; until then pre-releases are tagged `v1.0.0-alpha.N`.

## [Unreleased]

### Fixed

- A sheared stack's three planes show it where its planes are. The viewer reads the manifest's `step` (the engine's mean step from one plane to the next, from the planes' positions) and, where the step has a part in the plane (a tilted gantry, a slab whose planes shift as they go), holds the volume in a grid square to the stack's rows, columns and normal, wider by the planes' drift, each plane written into it at its own shift, as dcm2niix places such a stack. Before, the planes were stacked one above the other along the normal, and a head acquired with a 20 degree shear leaned by up to 36 degrees on the sagittal. The stack view places each plane at its own position too. A manifest without `step` reads as before.
- Checks: unit tests on the step, the shear rule (a tenth of a pixel over the stack, as the engine reads it), the grid at every level for a forward and a backward shear, the shifted plane, and a synthetic head resampled through the grid; and in chromium, cornerstone drawing a head-like ellipsoid sampled at the true voxels of a gantry-tilted axial, an oblique axial of 0.5 x 0.5 x 5 mm voxels, a double oblique with an 18 degree shear and a sagittal running right to left, read back from the canvas: in both the stack's planes and the scanner's axes every plane is upright (within 1.5 degrees), in proportion (within 4 percent) and whole, the head's cap at the top; held unshifted, the same stacks fail it.

## [1.0.0-alpha.46] - 2026-09-26

Released beside the engine's 1.0.0-alpha.46: the gallery, a hundred of a single-axis campaign's items checked at once with the value suggested, who suggested it and how sure, and accepted in one move, and a campaign's page that counts its suggestions from outside and brings more in from a file. The desk still speaks the engine's HTTP contract 7 and suite contract 3.

### Added

- The gallery (record 50), for a campaign that asks one axis such as body part: `#campaigns/<id>/gallery`, opened by Gallery on the campaign's page. A hundred items at once, each a small picture of its stack (its own plane and the two across it) with the value suggested, who suggested it (v0's labels, a model, or the engine's rules) and how sure, the least certain first or grouped by suggestion. A number key or the item's picker corrects an item, a group the suggester read wrong is set in one move, and Accept all as shown (Ctrl+Enter) sends every item's own value; each is still its own answer by the person, with the suggestion kept beside it. The next hundred pictures load while the first are checked. Sealed items and the share the campaign holds back are never in it; they are read one by one. Needs the engine's gallery doors.
- A campaign's page counts its suggestions from outside per author and value, and its maker brings more in from a file (v0's export, or a model's proposals with a `p:<value>` column per class).

## [1.0.0-alpha.45] - 2026-09-26

Released beside the engine's 1.0.0-alpha.45: the desk takes the whole screen, the reader's planes are cut along the stack's own axes with the scanner's axes one click away, the reader has compact and expanded rows and moves on to the next unanswered axis, and it holds an answer to the pack's exclusions between axes and shows its hints. The desk still speaks the engine's HTTP contract 7 and suite contract 3.

### Added

- The reader holds an answer to the pack's exclusions between axes (pack contract 6, the MRI pack 0.6.0). An answer that holds both sides of an exclusion is refused with its reason, as the engine refuses it, and what an exclusion rules out is greyed on both rows with the reason on hover. A hint whose condition holds and whose value the answer does not hold yet is shown under the rows and never refuses an answer. A campaign made before the pack said either reads as before.

### Changed

- The desk takes the window's width on any screen (record 48, after the learners report). No page is held to a fixed width any more (Home, Data, Query, Review, Campaigns, Pipelines, Settings and the rest); only running text keeps a readable measure. The layout check measures every section at 1366 by 768, 1440 by 900, 1920 by 1080 and 2560 by 1440.
- The reader's three planes fill the left side and grow with the screen: the plane the stack was acquired in large and the other two beside it or under it at half its side, or three equal planes in a row on a very wide side. The viewer follows the window when it is resized. The right panel keeps a readable width (34rem, up to 42rem on a large screen) and holds a seven-axis item without a scroll at every size checked.
- An oblique stack is no longer drawn tilted. The three planes are cut along the stack's own axes by default: each plane is the volume axis nearest the patient's plane, turned the radiological way (head up, the patient's left on the right of an axial or coronal, the front on the left of a sagittal), so an axial planned along the AC-PC line shows its sagittal and coronal with the head as the operator aligned it, and no voxel is interpolated across the tilt. The scanner's axes (the head as it lay, tilted by the planning angle) are one click away on an oblique stack and the choice is kept. A stack square to the scanner looks the same either way. Checked on the cameras, on a synthetic volume resampled through them at 15 and 30 degrees, and in cornerstone in a real browser.
- Compact and expanded rows, kept per person: in compact every asked axis is a find box that lists its values on focus, with what is chosen or implied beside it as chips; expanded is the rows as before. A value taken from a box's list, by Enter or a click, clears the box, and the focus goes on to the next axis still unanswered, past what another choice implies; a multi-valued axis keeps the focus for another value until Enter on an empty box or Tab. `/` still finds a whole answer.
- The viewer's numbers (first image, frames, bytes moved, planes decoded) are behind a small `i` beside the views, not under the picture.

## [1.0.0-alpha.44] - 2026-09-25

Released beside the engine's 1.0.0-alpha.44: the reader looks an answer up. A row finds a value by any name it goes by, the rows follow each other through the pack's implications and exclusions, `/` finds a whole answer, the header's key facts stand whole, and the chosen view is kept. The vocabulary and combinations the engine serves are read where the engine has them. The desk still speaks the engine's HTTP contract 7 and suite contract 3.

### Changed

- The reader after the second real read (record 48): answering is looking up. A row finds a value by any name it goes by, from the names the engine serves with the question: its label, the pack's terms (a vendor's name for the sequence: BRAVO, IR-FSPGR, 3D TFE or TFL find MPRAGE) and the words its rules read, case, spaces and hyphens not counting; the row says why it matched ("BRAVO → MPRAGE").
- The rows follow each other. After each choice the pack's implications and exclusion groups are carried through the answer: a value another choice implies is filled in, marked implied and held until that choice changes (technique MPRAGE fills base T1w), and a value that can no longer hold is greyed and says why on hover (FLAIR greys STIR, a base of T2w greys MPRAGE). Clearing a choice releases what it implied. Can't tell stays open on every row. The answer sent is the settled one.
- `/` finds a whole answer: typing any name of any value in it ("bravo", "mprage gd") offers whole combinations of the asked axes, the registry's most common first, where the engine counts them (a count across the registry that never includes the campaign's stacks or a sealed one, so it says nothing of the stack being read), then what the pack's shape settles for a value alone. Enter fills every row it names; the rater then changes what differs. The keys card lists it.
- The header block hides nothing behind a hover: a long line wraps inside the block (the other fields' lines keep to two, and beside a suggestion the text keeps to a line), and the key facts (slices, orientation, slice thickness and spacing, pixel spacing, matrix, field, scanner) stand as pieces of their own on a line that wraps and is never cut. The header's doors read `h` header and `H` how decided.
- The picture's view (the stack or three planes) a reader chooses is kept for the next item and the next visit, in the browser's storage where it keeps any. The viewer has no window presets to keep.
- The layout check also proves the key facts are never cut, that the lookup and the whole-answer search fit, and that the view is kept.

## [1.0.0-alpha.43] - 2026-09-25

Released beside the engine's 1.0.0-alpha.43: the reader on one screen, with the file's text on a blind item and the derived axes on a line of their own. The new header and derive doors are read where the engine has them. The desk still speaks the engine's HTTP contract 7 and suite contract 3.

### Changed

- The reader after the first real read (record 48). Blind hides NILS's answers, never the file: a blind item shows the header's text (series description, protocol, sequence name and variant, scanning sequence, acquisition type and scan options, image type, then the other text fields) and the physics (TR, TE, TI, flip angle, echo train, b values, bandwidth and field, then the scanner and the geometry) in a compact monospace block, a long value cut with an ellipsis and whole on hover. `h` opens the whole header of one instance, direct identifiers left out, filtered as one types; Escape closes it. The rater answers only the asked axes: where the question names derived axes, they are never drawn as rows or sent, and a line under the rows shows them live as the engine's derive door computes them from the answer as it stands (can't tell shown as `?`). The adjudicator sees each rater's derived axes beside the answer. An axis or axes question is read on one screen: the three planes on the left, and on the right the header block, compact rows, the derived line, one line saying what will be sent, and the answer. On three rows or more a row's number finds it and its first letters answer it, Enter taking the best match and going on to the next row; a long vocabulary lists its matches only while it is typed into. Can't tell keeps its home-row key and `m` still marks unsure. On an item read in the open the suggestion stays, each candidate on one line, and the evidence opens over the panel on `H`. An engine without the new fields or doors shows the flat header as before, no derived line, and `h` opens the evidence.
- A layout check in chromium (Playwright) proves the reader fits 1440 by 900 and 1366 by 768 with no page or panel scroll, blind, in the open and on an older engine; CI runs it.

## [1.0.0-alpha.42] - 2026-09-25

No change of its own. Released beside the engine's 1.0.0-alpha.42 so the two stay in step: a container install names both images with the engine's version. It still speaks the engine's HTTP contract 7 and suite contract 3.

## [1.0.0-alpha.41] - 2026-09-25

No change of its own. Released beside the engine's 1.0.0-alpha.41 so the two stay in step: a container install names both images with the engine's version. It still speaks the engine's HTTP contract 7 and suite contract 3.

## [1.0.0-alpha.40] - 2026-09-25

Released beside the engine's 1.0.0-alpha.40: can't tell on each axis and an unsure mark in the reader. The desk still speaks the engine's HTTP contract 7 and suite contract 3.

### Added

- Can't tell and unsure in the reader (record 48). Where the engine's axes question names its reserved word for it, every axis row offers "can't tell" beside none, keyed on the home row from the left (`a` on the first row, `d` on the second, then `f`, `g`, `j`, `k`, `l`); pressed again it clears. It is sent as that axis's value, stays apart from none, and is never held to the pack's implications or exclusion groups. Where the answer door takes it, `m` or the Unsure button marks the answer for a second look, sent as `unsure` only when set. A line above the buttons says what will be sent, can't tell and the unsure mark included, on a blind item as on any other. The adjudicator sees can't tell marked on its own and who marked an answer unsure; a rater's can't tell against another's value is a disagreement on that axis. The campaign page counts can't tell per axis and the answers marked unsure. An engine without these fields shows neither control.

## [1.0.0-alpha.39] - 2026-09-25

Released beside the engine's 1.0.0-alpha.39: review on one mechanism, the reader, and analyses with help on the Pipelines page. The desk still speaks the engine's HTTP contract 7 and suite contract 3.

### Added

- Models (record 45 S6): a section under `models:see` where the engine lists its models. Models by task and slot with the promoted one first; one model with its card, encoders, the label set it was trained on and its history. Under `models:work`: register a card (a train run registers what it fitted, and the dialog lists those runs), admit with a check, promote or retire after a panel that says what else moves. A refusal is shown in the engine's own words, such as a promotion before admission.
- Pipelines gains a Catalog page where the engine serves the catalog: each pipeline pinned by image, what it writes, and the runs with their units, files and staged proposals. Run on a selection takes a saved selection, the parameters, and the model or label set the descriptor reads, and shows what the run writes before it is queued. With no container runtime the page says why and offers no Run.
- Review grows three pages, each shown where something waits there (record 45 S5, S7). Picks: the occasions a pick run doubts, opened on the session board (each candidate's stacks as pictures that scroll together, the run's pick marked, a main toggle and a required why); a person's pick stands through every later pick run, Keep the run's pick acknowledges, and Withdraw lets the run's pick apply again. Proposals: what models proposed, as a change matrix from the value held now to the value proposed, each group committed or withdrawn alone, and commit by filter by model, axis, from and to after a panel that counts it. Asked: System 1's legal candidates for a stack with both systems' evidence and the certificate; only legal candidates are drawn. "Ask people about these" links to the Campaigns section's maker once that section is built into the desk.
- The viewer shows three planes (record 45 S2). Beside the stack, a Three planes view holds axial, coronal and sagittal planes of one cornerstone3D volume, filled from the slab door from the current plane outwards, at the finest pyramid level whose volume fits 256 MB and the card's largest 3D texture, so level 1 for a 220 by 1024 by 1024 stack. A stack deeper than that texture (2048 planes on most cards) is held at every second plane, or every third, and the view says so in a note; the stack view keeps every plane. Window and level move together across the three. Each plane, and the stack itself, is lettered at its edges (L, R, A, P, S, I) from the orientation and origin the engine's manifest names; a manifest without them is read as axial and says orientation unknown, with no letters. Where the volume cannot be held (no WebGL2, over the budget, a door that refuses) the three planes are the server's render, turned to read the radiological way and drawn to their size in millimetres.
- A tile for grids: one plane of a stack from the render door at the level that fills it, read only once on screen, a manifest read once per stack and six at a time; the wheel moves it a plane, and tiles that share a sync move together. The engine keeps one audit row per person and stack however many planes a tile shows.
- A bench for the viewer: `bench.html`, built by `vite.bench.config.ts` and served by `scripts/bench-serve.mjs` in front of an engine, which `scripts/viewer-bench.mjs` drives headless to measure first image, scroll, the planes' fill and MPR latency, window and level, heap and memory, the orientation letters against a marker, and a grid's audit rows.
- The reader (record 48 R1): the rating workspace fills in the answer the rules and System 1 agree on, and Enter confirms it; where they differ the legal candidates show with their probabilities. Each axis has one line of what decided it, the rest one key away; the next stacks' pictures are warmed while one is read; like stacks come as a grid of tiles accepted in one move, with those held back queued to read one by one; claims go in order of value by default; and the session's decisions and median seconds show, with each rater's pace on the campaign page. An item of a sealed sample reads blind. An engine without the reader's doors still gets its lines from the review item and the explain door.
- Analyses with help on the Pipelines page (record 49 A7). Run on a selection shows the engine's pre-flight before Run: units ready of the whole, the units that lack an input folded by why, stacks left out, the estimated time, the GPU and the lane's budget, and Run waits while the engine names a blocker; each parameter shows its range from the descriptor. A run's number opens its page: the units by state (running, waiting, done, failed, kept on resume), Cancel while its job runs and Resume when it stopped, its table of measures as the ask reads it (one row per scan at detail quasi; below it the totals over groups by sex or scanner, which the engine withholds for a group under 5 scans, with that note), its checks and breaches with a link to their review items, and the files it made. Where the assistant serves the analysis-plan station, a question becomes a plan shown as a run filled in with its pre-flight, and one button starts it. A door the engine lacks offers nothing.

### Fixed

- The viewer read the engine's tile containers wrongly: the offsets are from the start of a container, and a slab is a container of planes, each a container of tiles. No plane decoded against the engine, so the stack showed only the server's first picture.
- Scrolling the stack held every slab it passed: a plane decoded ahead of the scroll did not move the slab ring, so nothing was evicted. The ring now moves with every plane shown, and a scroll through a 2,500 plane stack stays near 250 MB of heap.
- The window the viewer opens at is shifted by the stack's intercept, so a signed stack opens at the engine's window.

### Changed

- Models is a page now, so it is named like any other: a person's profile lists it as hidden where it is not held, and a group reads as Every page only when it holds Models too. Campaigns stays as it was until its pages are built.

## [1.0.0-alpha.38] - 2026-09-24

Released beside the engine's 1.0.0-alpha.38 and Kvasir's 1.0.0-alpha.8: the models and campaigns grants, the engine's HTTP contract 7, and a model server on the Kvasir page.

### Added

- A model server on the Kvasir page (record 47, D1). Add a model offers "A model server": an address and a key, where the key goes once to Kvasir's credential door, staged under a name of its own, and never stays in the desk. Kvasir lists the server's models, each with its context, longest answer, concurrency, reasoning, tools and vision, and whether it is loaded or cold; ticked models are admitted one by one, and a cold tick says first that asking loads it on the server. A model server is one card listing its models, each removable, with Check, More models, Replace key and Remove server, and a station's drawer picks one of the server's models. The older "A model server of yours" is the same choice now.
- The desk speaks suite contract 3 (record 42 R7), which adds four grants: `models:see` and `models:work` for the registered classifier models, and `campaigns:see` and `campaigns:work` for annotation and curation campaigns. The group editor and a person's access offer Models and Campaigns as pages, each at hidden, see or work; the reviewer's set now holds `models:see`, the operator's `models:see` and `models:work`, and the admin's all four. Their pages are not built yet, so the grants open no section, tile or link, a person's profile lists them only when held, and a group that holds every other page still reads as Every page. An engine at suite 2 is older and still usable.
- The desk speaks the engine's HTTP contract 7, so an engine on 7 no longer shows the banner that the engine is ahead. Contract 7 only adds doors (the model registry, picks, derivatives, campaigns and label sets) and the actor rules for a model's or an agent's answer, none of which a person at the desk meets yet. The oldest engine the desk works against is still at contract 5, and one at 5 or 6 is older and usable.

### Changed

- Nothing changes for what an install already holds. A group made from a suite 2 set, such as the Admins group of an existing install, still answers to its ladder name wherever one is met (an app's entitlement, the export setting, the users list): a ladder name met as a need does not ask for the four new grants. Such a group gains no grant by itself; an admin gives Models and Campaigns in the group editor.

## [1.0.0-alpha.37] - 2026-09-23

Released beside the engine's 1.0.0-alpha.37, whose release keeps the real date.

### Removed

- The dates are no longer a choice when data leaves (record 38). Every release keeps the real date, so the date policies that shifted the dates by one offset a person or cut them to the year are gone from the desk, as they are from the engine. How a dataset is pseudonymised no longer offers them: its dates read kept as recorded, and the pair it used to refuse, dates that move with the UIDs kept, cannot arise. New release no longer has a dates override, and sends no dates; the UIDs are still each dataset's own until overridden there. The note that a dataset moving its dates has the release's sessions numbered in date order is gone with them. Where a date must not show in a path, the release dialog, the dataset's page and its Change dialog say to label the sessions by months since baseline (M00, M06) with a session scheme. A release made before keeps the policy it was released under: the Releases table still reads shifted or cut to the year on such a row, with its sessions numbered in date order, and a dataset whose handling an older engine still answers with a date policy is shown as it stands and never sent it back.

## [1.0.0-alpha.36] - 2026-09-19

No change of its own. Released beside the engine's 1.0.0-alpha.36 so the two stay in step: a container install names both images with the engine's version.

## [1.0.0-alpha.35] - 2026-09-17

No change of its own. Released beside the engine's 1.0.0-alpha.35 so the two stay in step: a container install names both images with the engine's version.

## [1.0.0-alpha.34] - 2026-09-17

No change of its own. Released beside the engine's 1.0.0-alpha.34 so the two stay in step: a container install names both images with the engine's version.

## [1.0.0-alpha.33] - 2026-09-17

No change of its own. Released beside the engine's 1.0.0-alpha.33 so the two stay in step: a container install names both images with the engine's version.

## [1.0.0-alpha.32] - 2026-09-17

### Fixed

- The banner saying the engine is ahead of this desk no longer stands after everything has been updated. This desk is generated from the engine's HTTP contract 6, which added the pseudonymiser's tag list to contract 5, and it now says so. Beside that it names the oldest contract it works against, which is 5: an engine below that is refused as it always was, and an engine at 5 is older than this desk and works, since a contract only ever adds doors and the desk asks whether a door is served before it uses one. An engine older than the desk in that way is said at the command line and changes nothing on the pages, so the engine and the desk are still released apart.

## [1.0.0-alpha.31] - 2026-09-17

### Changed

- The tag chooser reads what the pseudonymiser removes from the engine that owns it (record 28). The engine now serves that policy, so the desk no longer carries a copy of it: Choose tags lists what the door serves, each tag with the group holding it and what becomes of it in the engine's own words, and the desk supplies the names and nothing else. A tag the desk has no name for is listed all the same, with its number, its group and what happens to it, since what is removed is the engine's to say and a missing word is a gap in the words. The bar and the count on the Tags card are read from the same answer. Against an engine that serves no such list the chooser says so in a sentence and shows what this dataset keeps and removes of its own, which is edited and saved exactly as before.

## [1.0.0-alpha.30] - 2026-09-16

### Changed

- The Datasets page says less (record 27). Its lede is six words, and what the two trees are for is a disclosure, closed until it is asked for. A dataset's card is its name, the state it is in, its folder, how its files come in, the cohort it feeds, its two trees in one line and its three numbers, with the commentary that stood beside each of them gone. Each batch in the table carries its thread as five cells, one a stage, coloured as that stage stands and named in one letter under the head that spells the five in order, so where a batch got to is read at a glance. That one person is one subject, wherever they come from, is a disclosure rather than a standing paragraph.
- Add a dataset browses the engine's own folders. The dialog lists the folders of the engine's ingest locations, a page at a time and filtered by name, each row saying what a look inside it found, and the folder picked says what is in it before anything is declared. It asks for work on the Data page and nothing else: someone who may add a dataset but holds no grant on the install no longer has to type an absolute path from memory. A folder outside the engine's locations is still typed, and the same look door says what is in it by its bare path; an engine that serves no folders door, and a person without work on Data, get that field exactly as before. How the files come in is three choices with one consequence each, and the prose around the identity rule, the map and what happens to an identifier the map does not know is cut to the choices themselves.
- Vault it and Purge it say it in numbers (record 27). Purge shows what the engine answered as four numbers, with the plain sentence that they are a forecast of what the act would reach and not a promise of it, and each reason the act can be held back on stands on its own line with its own count. Every refusal and guard is where it was: the engine decides whether the act may run and says so in its own words, the warning that it cannot be undone stands, and it still asks why and for the dataset's name typed out.
- All hundred tags the pseudonymiser removes are listed, and a dataset's own exceptions are chosen among them (record 27). Choose tags, on the Pseudonymisation page, shows every tag with its name, its group and what becomes of it, narrowed by a search box and by the four groups; ticking a row keeps that tag as this dataset's own exception, and a tag the hundred do not hold is named in a box of its own and removed beside them. The rows the engine settles itself carry a lock rather than a tick: the identifier is replaced by the subject's code, the age is computed from the birth date and written back, and the two tags that make a file a file are remapped when the scans leave. What leaves and what stays is counted by those same rules, so a dataset that keeps four of them reads 96 removed and 4 kept and never a hundred, and the bar on the card counts the same list. The chooser is now the one place these lists are edited: How a dataset is pseudonymised no longer takes them as typed words, where a name that was not a tag was taken here and refused by the engine, and sends a person to the chooser instead.
- Provide a map says what the engine wants (record 27). The file is read on this machine and refused here, with the reason, when nothing names its columns, when it has no rows under that line, or when it is longer than the hundred thousand rows the door takes in one call; a file that separates its columns with semicolons or tabs is read like any other, since the columns are read here and the rows are posted as values. Each column is shown with the first values under it, what its values look like and what it is taken for: an identifier of one of the site's types or of a new one made here with a description, the number that stands for the person, the code, or ignored. The column that stands for the person carries its type like any other, which the engine requires of it. A rehearsal names the subjects, the identifiers, the held files it would release, the merges and every conflict before a row is written, and filing waits on a rehearsal that came back clean. Held until mapped states the case before the choice: how many files and identifiers wait, that they reach neither the pseudonymised tree nor the registry and are not lost, then the shapes with their files and when each was first seen, then the three ways out with a consequence each, the reveal refused in plain words to anyone not cleared to see identifiers.
- A batch's page, Cohorts and Review say less, and Rules walks every axis (record 27). The commentary that stood beside every value is behind one disclosure a card, closed until it is asked for, and every field, count, row action and piece of evidence stays where it was. A batch's five stages each carry a word of state, and every refusal says what to do about it. Rules walks all eleven axes the pack declares rather than the four word lists it showed, and which values take a word is computed from the pack rather than fixed here: an axis no word reaches is shown, marked as such, with its Add a word disabled and the reason beside it, and an axis whose values an older engine only numbered is not mistaken for one. A word the site added is drawn apart from one the pack shipped, and a proposed one from an adopted one; that matching ignores capitals, that a word is plain text and not a pattern, and that spaces at either end are part of it are said where a word is read and where one is added. No text a person reads on these pages names how far an account goes or what a field is called in the store.
- The Pseudonymisation page of a dataset says less (record 27). A fact stands as its value under a small label, and the sentence that used to stand in grey beside every value is behind one disclosure a card, closed until it is asked for. Identity holds the two trees as a flow, what a file's identifier is read from and its type, what the map holds, and what becomes of an identifier the map does not know; Tags holds the removed tags as one bar in their four groups, what is kept on purpose, written, kept and dropped, and this dataset's own lists, with Choose tags beside them; When it leaves holds the dates, the UIDs and the faces. Where the originals stand, and the acts on them, move to the side of the page, and who sees what is one line to the Identity page, where it is set. Every fact the page carried is still on it.

## [1.0.0-alpha.29] - 2026-09-16

### Added

- The Data page as shape C: the batch is the thread. Data has two pages in the side, Datasets and Cohorts. Each dataset is a card with its name and folder, what arrives through it (identified, de-identified by someone else, or our own codes in PatientID), the cohort it feeds, its two trees (the originals, locked, and the pseudonymised tree the registry reads), its subjects, stacks and batches, its newest batch in a line, and a state: held, to sort, reading now, not read yet, not sorted, or up to date. Now lists the open jobs from the engine's event stream, updated every second, or read every few seconds where the stream refuses or the engine has none: what each does, who started it and since when, how far it is with its rate and what is left, the files a pseudonymisation holds until mapped, the steps queued after a job as one dashed card, and a failed job with its error and one next move; Cancel keeps its button and says why when a person lacks the verb's grant. The chosen dataset's batches follow, each with five marks (pseudonymised, walked, digested, classified, reviewed) read from the batch's stages where the engine gives them, and each opening its own page.
- Add a dataset: the name and the folder, what arrives, who a file is about (a DICOM keyword or a folder of the path, and the identifier's type from the registry's list or a new one made here, with the shapes probed over a sample where the folder lies under a source), the map as a CSV read in the browser, its columns named for what they are, and what the engine says it would do before anything is written, whether a file whose identifier the map does not know is held or coded, and the cohort the subjects join. A folder that holds a v0 cohort layout is declared as one: dcm-raw renamed dcm-anon, v0's map filed, the originals left. Add and bring in adds the dataset, starts the engine again where a service keeps it running, files the map and queues the bring-in.
- Bring in what is new, as one chain: pseudonymise, then digest the pseudonymised tree, then fingerprint and classify with the dataset's pack, each step queued after the one before it; or the first step alone. A dataset that arrives de-identified or coded starts at the digest. The dialog says the grants each step needs, and about how long the first step takes at the machine's last measured rate where the engine gives one, with the files that rate was measured over beside it.
- A batch's own page, at `#data/batch/<id>`: which dataset it came from and what pseudonymised and read it, the five stages as a strip (pseudonymised, walked, digested, classified, reviewed) with the count under each, what the stage found and the job that did it, the reviewed stage opening Review filtered by the batch; what it added by base, the files it refused by reason with Read the N again, which queues a digest that reads the refused files too; the jobs that ran on it; and at the side its timeline, the dataset's pseudonymisation facts and where else its files show. Read again queues a digest of the dataset, and Sort N queues a fingerprint and a classify for what waits. An engine that reports the batch's stages on the batch row gives all five; an older one gives four, read from the batch's counts, its report and the jobs, and the timeline says the engine keeps none for a batch.
- The Pseudonymisation page of a dataset, at `#data/datasets/<name>/pseudonymisation`, in four sections: identifiers become codes (the rule, the map by type with its counts, the code, where the identifiers are kept, what is held, what merged); the pseudonymised tree (the originals and the pseudonymised tree as two cards, with the originals kept, vaulted or purged, then what the tree keeps and removes, tag group by tag group); who sees what (the three details with how many people hold each, from the desk's own people); and when it leaves (the leaving policy). At the side, Held until mapped with the held files by shape and their three ways out, the two questions the identity-check station answers, and what waits on Review. Provide a map reads a CSV on this machine, says what each column looks like, guesses what it means (an identifier of one of the registry's types or a new type made with a description, the number that stands for the person, the code, or ignored), rehearses the import and shows what it will do (subjects, identifiers, held files released, merges, conflicts), refuses to file it while a conflict stands, then files it as a job. Held until mapped lists the held files by shape with Provide a map, Code them anyway and Reveal them to me, the last for a person who sees every detail. Change edits what arrives, what an unmapped identifier does, the cohort the dataset feeds, the tags kept and removed on top of the four groups, the originals, and the leaving policy, through the dataset's place. The identity-check station's run shows on the page as it goes, then what it saw per rule as shapes with counts, what it found, its proposal, and Use this rule and read again. Each part needs its door: an engine without the linkage doors shows the page with a line where each would be.
- The originals of a dataset are acted on, not only declared. Their card on the Pseudonymisation page says where they stand (kept here, vaulted into a place, purged) and, where the engine serves the doors and the person has Data work, offers Vault it and Purge it. Vault it asks where they go, from the places the engine takes, narrowed to the role it names when it refuses one, and why, says what moves in files and bytes, and says plainly that the pseudonymised tree, the registry and every person's code are untouched. Purge it is deliberately harder: what the engine answers the act would reach (files, bytes, how many verified, how many not, how many held), why, and the dataset's name typed out to confirm; where the engine says it is not ready the act is refused in the engine's own words. Purging removes the only identified copy of those scans and cannot be undone, and a held file's original is what a map would still release. Each act is a job of its own, on Now and on Pipelines like any other, and the card says the new state once it ends.
- Data / Cohorts, at `#data/cohorts`. A cohort is a membership and nothing else, and the page shows one card per cohort: what waits on Review, that it is empty, new or sorted; where its members come from, fed by a dataset, promoted from a query card with its version and date, or by hand; its subjects, sessions and stacks; its releases, owner and age. New cohort takes a name, an owner and why, and, from a list, the codes that join at once. The three ways a subject joins are on the page: a dataset feeds it, a query promotes them, a hand adds them. It needs an engine that serves the cohort doors; making one needs work on the Data page.
- A cohort's page, at `#data/cohorts/<name>`: how it came to be and whose it is; its subjects, sessions, stacks and what waits on Review, with the way there; its members over time as a step chart, each join up and each leave down; how they joined, newest first, with the batch, the card or the audit beside each; and beside it the datasets holding its people, its releases and the queries to start from it, each opening a card on everyone in it. Add or remove takes codes, which way and a reason, recorded on every membership; Rename keeps its members, history and releases; Retire keeps them too and takes the cohort out of the lists, from where it can be brought back; Release opens New release with the cohort chosen.
- Make a cohort on a query card's answer, once it is run complete: the subjects of its rows, at any grain, become a new cohort named from the card, or join one that exists, with why, and the cohort's card is on Data / Cohorts at once. Promoting is Data work now, not Release work.
- The Review page, built back, at `#review` with three pages under one head. The queue (`#review`, or `#review?batch=<id>` from a batch) is a cohort's open items, the costliest first, with the cohorts as chips from the engine's review summary where it serves one, and on top the three kinds as cards: the stacks the rules are unsure of, with Sort them and the rules' guess accepted in bulk for the items triage says need no reading (one audit row each, the rest named with why), the subjects that may be one person, and the sessions that moved. A row is decided at a scope (this scan, its series, this subject, this scanner), with the engine's refusal in words when someone of higher standing decided before; looked at in the viewer with the item's evidence beside it; or seen. Why is this opens from a look: the explain door's answer axis by axis with how sure the pack was and because of what, a decision otherwise, and Add a word for the site prefilled from the row; an engine without the door shows the item's own evidence.
- Rules (`#review/rules`): the pack in a strip, the scope a change is tried on (a batch, a scanner the signals name, everything), the axes in the order they are decided with what each is made of, and the chosen axis's values with their words, flag and, from the signals, how many stacks were decided there and how many are unsure (by value where the engine counts so, by axis where it does not). Add a word rehearses an overlay through the try door on the scope and proposes it with why; at pack contract 5 any list is named by `axis.value`, at contract 4 only the four buckets the pack lets a site edit. The proposals table adopts with what the closure says it moves, and how many query cards stop reproducing, or refuses on the item beside the overlay. Tune with the assistant starts the keyword-tune station on the chosen scope and axis.
- Identifiers (`#review/identifiers`): the identity questions by kind, two codes sharing one identifier, files held until the map names their identifier, subjects coded without a map, each with what settles it: the map on the dataset's Pseudonymisation page, a decision, or a merge of the alias into the canonical subject, which needs Data: Work and records in full.
- A station's run on a page: started headless, followed to its end, drawn as its phases (survey, prediction, rehearsal, check, proposal for keyword-tune; read, probe, proposal, yours for identity-check, with what the probe saw under each rule as shapes and counts) and its verdict, the acts the person's. keyword-tune and identity-check can be picked in the Assistant chat.
- The Release page, at `#release`: every release as a table with its version, layout, how its dates and UIDs left, its subjects and sessions, when and by whom, whether it was handed over, and whether it was withdrawn and why. New release is of a cohort or of a query card's complete answer at stack grain kept on this desk; it is named for what it is of, the day and the next number of that day, in a BIDS or descriptive layout, and says how the files of each dataset leave under that dataset's own handling, which session scheme, and which export place it is written to. A cohort with stacks still waiting on Review is said so before it leaves. Select first says what it reaches without writing anything; Release queues the job. It needs work on the Release page.
- Pipelines, built back as the jobs. Now lists what runs and what waits, live from the engine's event stream where it serves one and read every few seconds otherwise, each a card with what it is doing, to what, for whom, how far it is and what it is waiting for; a job that stopped says why and offers the same command again, or Dismiss. Under it every job the engine lists, filtered by state. A cancel goes by the verb's grant, a digest with Data work, a sort with Pipelines work, a release with Release work, a backup with Database work; the card keeps its button and says why when a person lacks the grant.
- The addresses `#data/datasets` and `#data/datasets/<name>`, `#data/cohorts` and `#data/cohorts/<name>`, `#data/batch/<id>`, `#data/datasets/<name>/pseudonymisation`, `#review` with `#review/rules` and `#review/identifiers`, `#release` with `#release/new/<name>`, and `#pipelines`; a page opened from another is reached back through the trail above it.

### Changed

- The sources view is the Datasets page, and the words with it: Datasets, Add a dataset, Bring in what is new. On an engine before record 26 the page reads as before, with the digest queued alone. How a dataset is handled is changed on its Pseudonymisation page, from its card's menu; the card's Handling dialog is gone.
- The release body sends a card's answer as its handle, which the engine reads itself and refuses when it no longer reproduces, and takes `datasets` beside `cohorts`.
- An address may name a page of what a page opened, `#data/datasets/<name>/pseudonymisation`, and narrow its page after a question mark, `#review?batch=12`; an address without either reads as it did.

## [1.0.0-alpha.28] - 2026-09-15

### Added

- Groups give pages. A group has a name, grants, a detail and, where people sign in at a provider, the provider groups it follows. A grant names a page and how far a person goes there, `see` or `work`, and the assistant's `use`; the detail says what they see in records: `plain`, `quasi` (sex and age) or `sensitive`. A person holds what all their groups give, with grants an admin gives them alone on top, and the desk refuses a change that would leave nobody who may change people and groups. An install starts with Readers, Reviewers, Operators and Admins, made from the ladder when the desk first starts; each person joins the group of their top step and keeps `assist` as a grant of their own.
- The identity doors: `GET /desk/groups` and `GET /desk/access` for `identity:see`; `POST /desk/groups`, `PUT` and `DELETE /desk/groups/{id}`, `POST /desk/users` and `PUT /desk/access/{subject}` for `identity:work`, each from the desk's own origin, as signing in and out now are. `GET /desk/users` and `PUT /desk/users/{name}/entitlements` answer for one release, a ladder name standing for its set.
- The command line: `nils-desk user add <name>` takes `--group`, `--grant` and `--detail` beside `--admin`, which joins Admins. `nils-desk user access <name>` changes only what it names, `--group`, `--grant` or `--detail`, and `--none` takes everything away; `user grant` answers for one release. `nils-desk group list|add|set|remove`, where `group set` also changes only what it names, clears with `--no-grants` or `--no-follows` and renames with `--rename`. `--entitlement` still takes a ladder name, as its set, for one release.
- `[oidc] groups_claim`, `groups` unless set.

### Changed

- The desk signs the tokens the engine, Kvasir, the assistant and apps receive wherever people sign in, with `grants` and `detail` and no `roles`, minted again when what a person holds changes. In `oidc` mode the provider says who a person is and which groups they are in, and the token's subject is the provider's subject at the provider's host, as the parts knew it; everyone signs in once more after the update. The engine and Kvasir trust the desk's issuer, keeping its subjects, beside the provider, as the settings page and `nils-desk register` print.
- The capabilities document names a person's `grants`, `detail` and `groups` in place of entitlements and roles, and the desk speaks suite 2: an engine that speaks suite 1 is a contract mismatch.
- The assistant's doors need `assistant:use`, the supervisor's `install:work`, an app's its entitlement (a grant or a ladder name), and reading results `query:see`. An export needs `query:work` unless the configuration names another grant or a ladder name.

## [1.0.0-alpha.27] - 2026-09-15

No change of its own. Released beside the engine's 1.0.0-alpha.27 so the two stay in step: a container install names both images with the engine's version.

## [1.0.0-alpha.26] - 2026-09-14

No change of its own. Released beside the engine's 1.0.0-alpha.26 so the two stay in step: a container install names both images with the engine's version.

## [1.0.0-alpha.25] - 2026-09-14

### Added

- Start and Stop on the Kvasir page, for a downloaded model in GGUF, where the install runs llama.cpp for Kvasir. The local models section names the runtime, its llama.cpp build and archive, and whether it answers; where the install runs none it says Kvasir runs no model here and keeps each model's commands as before. A model loading into llama.cpp reads as loading, and the list is read again every two seconds until it serves or does not start. A serving model says the name it is served as, the context and slots llama.cpp settled on, and whether Kvasir admitted it: warming until its first answer, being checked, admitted, or refused with the checks it failed. A model that did not start says why, with what llama.cpp logged behind a disclosure. llama.cpp runs one model at a time, so starting a model while another serves asks first, naming the one it stops. A started model is stopped before it can be removed. A model Kvasir starts keeps its commands folded under Or run it yourself, and one it cannot start shows them open with why. It needs Kvasir's runtime doors; with a Kvasir that has none, the section is as it was.
- A provider added on the Kvasir page names the stations it does not answer yet. A station with no row in the table stays in your systems, so a provider answers only the stations moved to it: one that reads no rows moves there without more, rows of the archive go only once an admin writes down why, and identifiers never do. Each station that may move has its Change beside it, which opens the dialog of Where each station goes with the provider chosen.

### Fixed

- The first person setup adds, who may do everything, may use the assistant. `nils-desk user add --admin` gave them `admin` alone, and using the assistant takes `assist`, which stands beside the other entitlements rather than under `admin`, so the Assistant was missing from their side and its doors refused them until an admin granted `assist` on People. A user added with `--admin` now holds `assist` as well. Someone added before keeps what they hold: an admin grants `assist` on People. A desk where nobody signs in, or whose people sign in at a provider, was not affected.

## [1.0.0-alpha.24] - 2026-09-14

Released beside the engine's 1.0.0-alpha.24 so the two stay in step. That engine changes nothing the desk reads, so this desk works with the engine's 1.0.0-alpha.23 as well.

### Fixed

- The Kvasir page, a person's own ChatGPT subscription on their profile, and Kvasir on Home and in Setup show wherever people sign in. The desk read Kvasir's catalog with no credential, which Kvasir refuses once people sign in, so the desk took Kvasir for absent and left those out. It now reads the catalog with the signed-in person's own token, as its proxy to Kvasir already does. A desk where nobody signs in was not affected.

## [1.0.0-alpha.23] - 2026-09-14

Released beside the engine's 1.0.0-alpha.23 so the two stay in step. Bring DICOM in at any depth needs that engine's ingest folders and look doors. The Kvasir page, the subscriptions and local models need Kvasir 1.0.0-alpha.4, and a person's own subscription serving their conversations needs nils-assistant 1.0.0-alpha.23.

### Added

- Bring DICOM in chooses from the engine's own ingest locations, for an operator, where the engine serves `POST /api/ingest/folders`, so it works where no supervisor answers. It opens at the locations, sources first, and goes into folders at any depth with a trail back up, a filter by name and Show more for the next page, so a folder of a hundred thousand folders is paged rather than cut off at 500. Each folder on screen says what a look inside it found: DICOM or not, its modalities and scanners, and how many files it holds. Folders ticked anywhere gather in a chosen list, where a folder inside another chosen one says so, and each becomes a digest of its own, named from its path; the page says what was queued. A folder no source place holds is offered to be added as a source first, without starting the engine again. An admin whose supervisor answers still reaches a folder outside those locations, and without the engine's doors the dialog is as it was. It needs an engine that serves the ingest folders and look doors.
- The Kvasir page, at the address the Gateway and models page had. Its table lists each model Kvasir holds with where its prompts go, its admission and the stations it answers; a model in your systems reads as admitted, as being checked for the hour after it is added or while a check runs, or as refused with the checks it failed. An admin adds a model from a dialog: a model server on this machine, one on another machine of theirs, or a provider named or at another address, with its key. Find its models lists what the server serves; Test sends the model one short request and says what came back, whether nothing answered at the address, the key was refused, there is no model by that name, or the server refuses for now; and Add is offered only after a test that answered for exactly what the dialog shows. An admin also checks a model with Kvasir's admission suite from its row, and removes one after a dialog that names the model, its key and where the stations it answered go instead. Where each station goes offers ChatGPT through people's own subscriptions, with a written reason where rows would go and never for identifiers, as for a provider. It needs Kvasir's models held in its database.
- The ChatGPT subscription. Each person signs in with their own on their profile, which opens from their name in the top bar; on a desk that signs nobody in, the install's is signed in on the Kvasir page. Signing in shows a code to copy, the link to enter it at and the minutes left, and follows the sign-in until it is done; signed in, the card says since when, offers the subscription's models and signs out. It says the subscription serves only its person's conversations, for the stations an admin lets go to ChatGPT, that rows of the registry go to it only where an admin wrote down why, and that identifiers never do. It needs Kvasir's subscriptions; until Kvasir serves them, the desk leaves them out.
- Local models on the Kvasir page, for an admin. Kvasir downloads models from the Hugging Face Hub and runs none of them. The section says where new downloads go and how much room is free there, changed from a small dialog that shows Kvasir's words when it refuses a folder, while models downloaded earlier stay where they are; and whether a Hugging Face token is set, which only a gated or private model needs, set from a password field or cleared, and never shown. Each model lists its revision with a short commit, its path and its state: queued, downloading with a bar and how much of it is there, paused, downloaded, or failed with why. A download is paused and resumed from its row, and a model is removed after a dialog that says its files are deleted and how much room comes back; while a model is queued or downloading, the list is read again every five seconds. A downloaded model shows the commands that start it on llama.cpp, Ollama, SGLang or vLLM, each to copy: a model server started with one is added with Add a model. Download a model takes the model's name as owner/name, a revision and the patterns of the files to download; Look up lists those files with their sizes and the total, and Download is offered only after a look-up for exactly what the dialog shows. A refusal says there is not room, with both sizes, that the model needs a Hugging Face token, or that the model is in the list already, to resume or remove. It needs Kvasir's local models; until Kvasir serves them, the desk leaves the section out.

### Changed

- The desk calls the model gateway Kvasir wherever a person reads it: Home's parts, Setup, Settings' overview, the Parts page, and what each page says keeps running.

### Fixed

- Opening a conversation whose last turn failed no longer blanks the desk. The assistant keeps a failed turn's error as an object of its own, and the thread drew that object as it was; it now shows the error's words, after a reload and on the stream alike.
- A page that stops drawing says so in its own place, with what went wrong and a way to draw it again, and the rest of the desk keeps working. Opening another page or conversation draws afresh. Before, one such page took the whole desk with it.

## [1.0.0-alpha.22] - 2026-09-14

Released beside the engine's 1.0.0-alpha.22 so the two stay in step. That engine changes nothing the desk reads, so every change works with the engine's 1.0.0-alpha.21 as well. Titles by the model, /summarize, mentions and the memory a new conversation reads each need the nils-assistant change named with it.

### Added

- An answer's markdown is drawn in every case: six heading levels, footnotes gathered at its end, the note, tip, important, warning and caution quotes GitHub writes, sub and superscripts, named and numbered character references, a details block, and the few HTML tags that only shape words. A single tilde no longer strikes words through, so "~5 subjects" keeps its tilde, and a loose task item no longer shows its brackets. A formula written between dollars, as \(...\) or \[...\], or in a math fence is drawn as MathML in Noto Sans Math, which the desk serves itself, while a price such as "$5 and $10" stays words; code is coloured by its language; each loads the first time an answer needs it. A reply still arriving no longer shows a half-formed table, bare asterisks or half a link, and copying works on a desk served over plain HTTP, where the browser keeps the clipboard away (the chat, slice 8).
- An answer shows what the model reasoned as a folded block above it, with the number of words; opened, the reasoning reads in a quieter style, and while the model is still reasoning the block says Thinking. Both kinds of reasoning show: what the runtime separated, which the page dropped before, and reasoning a model left inline in its words, read out for `<think>`, Gemma 4's channel, gpt-oss's harmony channels, Mistral's `[THINK]`, the markers of Cohere and Kimi K3, and the namespaced think tags. Reasoning is never copied with an answer, and each step of a reply keeps its words a paragraph apart, where two steps ran together before (the chat, slice 9).
- A new conversation is named by the model once its first answer settles: the assistant turns its first message into a name of a few words, and the head and the lists take it as soon as it arrives. Until then the conversation keeps the start of its first message, and a name you give with Rename or /rename always stays. It needs nils-assistant's titles by the model (the chat, slice 10).
- `/summarize` summarizes the earlier conversation now, so it takes less of the model's window. The thread shows where you asked and a one-line answer, the note above the thread counts the summary, and the context meter shows again after the next answer. A conversation still too short to summarize says so, and no model is asked. It needs nils-assistant's summarize (the chat, slice 11).
- Typing @ in the message box offers your query cards, the registry's cohorts and your kept results. The one you pick goes into the message and shows as a chip, and a card's chip opens the card on the Query page. The assistant reads what you named with its own tools, so a mention lets it read nothing it could not read before. It needs nils-assistant's mentions (the chat, slice 12).
- A new conversation reads all you asked the assistant to keep while it fits in 3,000 characters. Beyond that it reads what is closest to your first message, and the assistant looks up the rest when you refer to it; the Memory page says which. Asking it to forget reaches any of your memories. It needs nils-assistant's relevant memories (the chat, slice 13).

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
