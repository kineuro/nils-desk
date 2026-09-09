// SPDX-License-Identifier: AGPL-3.0-only
// The ingest forms (Wave 4c section 7.5, D50): every verb the desk offers
// runs as a job against a pre-registered location, named `@root/relative`,
// and the desk composes only the command line the engine's job door
// accepts. A path that is absolute, empty or steps to a parent is refused
// here before the engine refuses it again.

export type Verb = "digest" | "classify" | "fingerprint" | "linkage import";

export interface Located {
  root: string;
  path: string;
}

/** `@root/relative`, or the reason it is refused. */
export function locate(l: Located): { ok: true; at: string } | { ok: false; why: string } {
  if (!l.root) return { ok: false, why: "pick a registered location" };
  const p = l.path.trim();
  if (p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p)) return { ok: false, why: "a path under the location, not an absolute one" };
  if (p.split(/[\\/]/).some((seg) => seg === "..")) return { ok: false, why: "a path may not step to a parent" };
  const at = p ? `@${l.root}/${p.replace(/^\.\//, "")}` : `@${l.root}`;
  return { ok: true, at };
}

export interface IngestForm {
  verb: Verb;
  location: Located;
  name?: string;
  modality?: string;
  force?: boolean;
  files?: string;
  id_type?: string;
  id_column?: string;
  code_column?: string;
  pack?: string;
}

/** The command line for the job door, without the leading nils. */
export function command(f: IngestForm): { ok: true; command: string[] } | { ok: false; why: string } {
  const named = (cmd: string[]) => {
    if (f.name?.trim()) cmd.push("--name", f.name.trim());
    return cmd;
  };
  switch (f.verb) {
    case "digest": {
      const at = locate(f.location);
      if (!at.ok) return at;
      const cmd = named(["digest", at.at]);
      if (f.files?.trim()) cmd.push("--files", f.files.trim());
      if (f.pack?.trim()) cmd.push("--pack", f.pack.trim());
      return { ok: true, command: cmd };
    }
    case "classify": {
      const cmd = named(["classify"]);
      if (f.pack?.trim()) cmd.push("--pack", f.pack.trim());
      if (f.modality?.trim()) cmd.push("--modality", f.modality.trim());
      return { ok: true, command: cmd };
    }
    case "fingerprint": {
      const cmd = named(["fingerprint"]);
      if (f.modality?.trim()) cmd.push("--modality", f.modality.trim());
      if (f.force) cmd.push("--force");
      return { ok: true, command: cmd };
    }
    case "linkage import": {
      const at = locate(f.location);
      if (!at.ok) return at;
      if (!f.location.path.trim()) return { ok: false, why: "the CSV, by its path under the location" };
      const cmd = ["linkage", "import", at.at];
      if (f.id_type?.trim()) cmd.push("--id-type", f.id_type.trim());
      if (f.id_column?.trim()) cmd.push("--id-column", f.id_column.trim());
      if (f.code_column?.trim()) cmd.push("--code-column", f.code_column.trim());
      return { ok: true, command: cmd };
    }
  }
}

/** The restore page prints the exact command and the procedure; it runs nothing (D50). */
export function restoreProcedure(archive: string, home: string): string[] {
  const a = archive.trim() || "<ARCHIVE>";
  const h = home.trim() || "<HOME>";
  return [
    `# 1. Stop the engine; a restore replaces the registry and the linkage store under it.`,
    `systemctl stop nils-serve   # or however this deployment runs nils serve`,
    `# 2. A pre-restore archive of what is there now, and its check.`,
    `nils backup --registry ${h}`,
    `nils verify --registry ${h} <the archive nils backup just printed>`,
    `# 3. Check the archive you are about to put back.`,
    `nils verify --registry ${h} ${a}`,
    `# 4. The restore itself. --yes is the only confirmation there is.`,
    `nils restore --registry ${h} --yes ${a}`,
    `# 5. Start the engine and read its status.`,
    `systemctl start nils-serve`,
    `nils status --registry ${h}`,
  ];
}
