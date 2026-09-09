# Security

nils-desk holds a person's session and tokens and is the one origin a browser talks to, so reports are taken seriously now, before there is code to run.

**Report a vulnerability** to admin@kineuro.se, or through "Report a vulnerability" under this repository's Security tab. Please do not open a public issue for it. We answer within a week, fix confirmed issues as fast as we can, and credit you in the release notes if you wish.

**In scope now:** the repository itself (its workflows, templates and the `cla-signatures` branch). When the desk exists, this file lists what it protects and how: the session cookie, the tokens it holds server side, the cross-origin defences of its proxy, and the three identity modes.

**Out of scope:** the operating system, reverse proxy, storage and identity services you run the desk behind.
