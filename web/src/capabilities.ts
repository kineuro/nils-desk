// SPDX-License-Identifier: AGPL-3.0-only
// The deployment capabilities document (Wave 4c section 4.3), as
// contracts/suite/v2/capabilities.schema.json fixes it. Everything the shell
// shows is a predicate over this one object and nothing else.

import type { Detail, Grant } from "./grants";

/** A ladder name, as the engine's roles and an older engine's policy rows still name one (record 25). */
export type Role = "reader" | "reviewer" | "operator" | "admin";

export interface EngineCapabilities {
  engine: { name: string; version: string };
  contracts: Record<string, string>;
  doors: string[];
  policy: PolicyRow[];
  auth: "off" | "token" | "oidc";
  principal: string;
  /** Record 25: what the caller may open, and how much of a record it sees. */
  grants?: Grant[];
  detail?: Detail;
  /** The ladder's steps up to the caller's detail, kept for one release. */
  roles: Role[];
  registry: { epoch: number; schema_version?: number; node?: string; synthetic?: string | null };
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
  /** The grant the door needs, or any of several; an older engine names a role instead. */
  grant?: Grant | Grant[];
  role?: Role;
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
  apps: { id: string; title?: string; entitlement?: string; capabilities: Record<string, unknown> | null }[];
  /** The person: what their groups and their own grants add up to, and the names of their groups. */
  person: { subject: string; display_name: string; grants: Grant[]; detail: Detail; groups: string[] };
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
    /** Section 7.6: the desk's own settings, read only; changed in its configuration file. */
    settings?: {
      origin: string;
      engine_url: string;
      kvasir_url: string | null;
      assistant_url: string | null;
      session_hours: number;
      token_minutes: number;
      cli_token_hours: number;
      export: string;
      store: string;
      retention: string;
      engine_flags: string | null;
      /** Wave 5 section 10.4: the supervisor the desk proxies under /supervise/, when one is configured. */
      supervisor_url?: string | null;
      /** Wave 5 section 10.5: the other addresses this desk answers at. */
      also_origins?: string[];
      /** Wave 5 section 10.5: how the desk signs people in; its signing key and audience in local mode, the provider in oidc mode. Never a secret. */
      signing?: { key?: string; audience?: string; issuer?: string; client_id?: string; roles_claim?: string; groups_claim?: string } | null;
    };
  };
}
