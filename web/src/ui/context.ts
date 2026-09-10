// SPDX-License-Identifier: AGPL-3.0-only
// The rail's context, typed (Wave 5 section 9.2). Each page declares what it
// contributes; the type is the allowlist. Identifiers, names, counts and
// codes cross; a row never does. `admit` is the runtime guard: anything not
// in the allowlist, or shaped like a row, is dropped before it reaches the
// assistant, and the gate asserts that.

export interface PageContext {
  page: { kind: string; id: string | null };
  document_id?: number;
  content_hash?: string;
  chain?: number[];
  epoch?: number;
  sets?: { name: string; grain: string }[];
  funnel?: { set: string; rows: number }[];
  pack?: { name: string; version: string };
  handle_id?: number;
  declaration?: Record<string, string | number | boolean | null>;
  error_codes?: string[];
  job_ids?: number[];
}

const KEYS: (keyof PageContext)[] = [
  "page", "document_id", "content_hash", "chain", "epoch", "sets", "funnel", "pack", "handle_id", "declaration", "error_codes", "job_ids",
];

const MAX_TEXT = 200;
const MAX_LIST = 64;

function scalar(v: unknown): v is string | number | boolean | null {
  return v === null || typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= MAX_TEXT);
}

/** The context a page may hand the rail: the allowlisted keys, each in its shape, nothing else. */
export function admit(input: unknown): PageContext {
  const src = (input ?? {}) as Record<string, unknown>;
  const page = src.page as { kind?: unknown; id?: unknown } | undefined;
  const out: PageContext = {
    page: { kind: typeof page?.kind === "string" ? page.kind.slice(0, MAX_TEXT) : "unknown", id: typeof page?.id === "string" ? page.id.slice(0, MAX_TEXT) : null },
  };
  for (const k of KEYS) {
    const v = src[k];
    if (v === undefined || k === "page") continue;
    switch (k) {
      case "document_id":
      case "handle_id":
      case "epoch":
        if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
        break;
      case "content_hash":
        if (typeof v === "string" && /^[0-9a-f]{8,64}$/.test(v)) out[k] = v;
        break;
      case "chain":
      case "job_ids":
        if (Array.isArray(v)) out[k] = v.filter((x): x is number => typeof x === "number").slice(0, MAX_LIST);
        break;
      case "error_codes":
        if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string" && x.length <= MAX_TEXT).slice(0, MAX_LIST);
        break;
      case "sets":
        if (Array.isArray(v)) {
          out.sets = v
            .filter((x): x is { name: string; grain: string } => typeof x?.name === "string" && typeof x?.grain === "string")
            .map((x) => ({ name: x.name.slice(0, MAX_TEXT), grain: x.grain.slice(0, MAX_TEXT) }))
            .slice(0, MAX_LIST);
        }
        break;
      case "funnel":
        if (Array.isArray(v)) {
          out.funnel = v
            .filter((x): x is { set: string; rows: number } => typeof x?.set === "string" && typeof x?.rows === "number")
            .map((x) => ({ set: x.set.slice(0, MAX_TEXT), rows: x.rows }))
            .slice(0, MAX_LIST);
        }
        break;
      case "pack": {
        const p = v as { name?: unknown; version?: unknown };
        if (typeof p?.name === "string" && typeof p?.version === "string") out.pack = { name: p.name.slice(0, MAX_TEXT), version: p.version.slice(0, MAX_TEXT) };
        break;
      }
      case "declaration": {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const d: Record<string, string | number | boolean | null> = {};
          for (const [dk, dv] of Object.entries(v as Record<string, unknown>).slice(0, MAX_LIST)) if (scalar(dv)) d[dk.slice(0, MAX_TEXT)] = dv;
          out.declaration = d;
        }
        break;
      }
    }
  }
  return out;
}

/** True when nothing in the context looks like a row: no list of objects with more than the allowed shape, no long text. */
export function rowFree(ctx: PageContext): boolean {
  const walk = (v: unknown, depth: number): boolean => {
    if (depth > 3) return false;
    if (scalar(v)) return true;
    if (Array.isArray(v)) return v.length <= MAX_LIST && v.every((x) => walk(x, depth + 1));
    if (v && typeof v === "object") return Object.keys(v).length <= MAX_LIST && Object.values(v).every((x) => walk(x, depth + 1));
    return false;
  };
  return walk(ctx, 0);
}
