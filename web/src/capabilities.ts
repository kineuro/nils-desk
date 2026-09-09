// SPDX-License-Identifier: AGPL-3.0-only
// The deployment capabilities document (Wave 4c section 4.3), as
// contracts/suite/v1/capabilities.schema.json fixes it. Everything the shell
// shows is a predicate over this one object and nothing else.

export type Entitlement = "reader" | "reviewer" | "operator" | "admin" | "assist";
export type Role = Exclude<Entitlement, "assist">;

export interface EngineCapabilities {
  engine: { name: string; version: string };
  contracts: Record<string, string>;
  doors: string[];
  policy: PolicyRow[];
  auth: "off" | "token" | "oidc";
  principal: string;
  roles: Role[];
  registry: { epoch: number; schema_version?: number; node?: string };
  /** Section 6.5: the events cap, the ingest locations by name, whether a backup directory is set. */
  event_streams?: number;
  ingest_roots?: string[];
  backup_dir?: boolean;
  packs: { name: string; version: string; contract?: number }[];
  assist?: string | null;
  [key: string]: unknown;
}

export interface PolicyRow {
  door: string;
  role: Role;
  writes: boolean;
  idempotent: boolean;
  cost: "free" | "bounded" | "job" | "stream";
  result_cap: string;
  label: { present: string; past: string };
}

export interface Capabilities {
  engine: EngineCapabilities | null;
  kvasir: Record<string, unknown> | null;
  assistant: Record<string, unknown> | null;
  apps: { id: string; title?: string; entitlement?: Entitlement; capabilities: Record<string, unknown> | null }[];
  person: { subject: string; display_name: string; entitlements: Entitlement[]; roles: Role[] };
  desk: {
    version: string;
    mode: "off" | "local" | "oidc";
    contracts: Record<string, string>;
    /** The named states of section 7.2 the desk itself reports. */
    engine_reachable: boolean;
    contract_mismatch: null | { found: Record<string, string>; speaks: Record<string, string>; major: boolean };
    /** How a person logs in, by mode: none in off mode. */
    login: null | { kind: "password" | "redirect"; url: string };
    signed_in: boolean;
    /** The entitlement an export needs on this desk, when this person holds it; null otherwise. */
    export?: string | null;
  };
}
