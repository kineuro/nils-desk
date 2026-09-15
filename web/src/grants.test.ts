// SPDX-License-Identifier: AGPL-3.0-only
// The grants vocabulary against the vectors every part runs (record 25;
// contracts/suite/v2/vectors/grants.json, copied as grants.vectors.json): the
// sets the ladder's names stand for, and what may and sees answer for a caller
// whose grants and detail the vectors resolve.

import { describe, expect, it } from "vitest";
import type { Capabilities } from "./capabilities";
import { DETAILS, GRANTS, holdsGrant, isGrant, may, SETS, sees, type Detail, type Grant, type Step } from "./grants";
import raw from "./grants.vectors.json";

interface Resolved {
  grants?: string[];
  detail?: string;
  refused?: boolean;
}

interface Vectors {
  sets: Record<string, { grants: string[]; detail: string }>;
  everything: { grants: string[]; detail: string };
  roles: Record<string, string>;
  claims: { name: string; claims: { grants?: string[]; detail?: string; groups?: string[] }; expect: Resolved }[];
  ceilings: { name: string; grants: string[]; detail: string; ceiling: Step; expect: Resolved }[];
  named: { name: string; roles: string; expect: Resolved }[];
}

const vectors = raw as unknown as Vectors;

interface Access {
  grants: Grant[];
  detail: Detail;
}

const detailOf = (d: string | undefined): Detail => (DETAILS as readonly string[]).includes(d ?? "") ? (d as Detail) : "plain";

/** A name met in a group binding or a role list: a ladder name or assist stands for its set, a grant for itself, anything else for nothing. */
function named(name: string): Access {
  if (Object.hasOwn(SETS, name)) return SETS[name as keyof typeof SETS];
  return { grants: isGrant(name) ? [name] : [], detail: "plain" };
}

/** Grants add up, as given and never widened here; the higher detail holds. */
function union(all: Access[]): Access {
  return { grants: all.flatMap((a) => a.grants), detail: DETAILS[Math.max(0, ...all.map((a) => DETAILS.indexOf(a.detail)))] };
}

/** Every grant a list holds, sorted by code point as the vectors are. */
const held = (have: readonly string[]): Grant[] => GRANTS.filter((g) => holdsGrant(have, g)).sort();

function person(a: Access): Capabilities {
  return { person: { subject: "p", display_name: "p", grants: a.grants, detail: a.detail, groups: [] } } as unknown as Capabilities;
}

/** What may and sees answer for this access agrees with what the vector expects. */
function agrees(a: Access, want: Resolved) {
  const caps = person(a);
  const opened = GRANTS.filter((g) => may(caps, g)).sort();
  if (want.refused) {
    expect(opened).toEqual([]);
    return;
  }
  expect(opened).toEqual(want.grants);
  expect(DETAILS.filter((d) => sees(caps, d))).toEqual(DETAILS.slice(0, DETAILS.indexOf(want.detail as Detail) + 1));
}

describe("the vocabulary", () => {
  it("is every grant the vectors name, with sensitive the highest detail", () => {
    expect([...GRANTS].sort()).toEqual(vectors.everything.grants);
    expect(DETAILS[DETAILS.length - 1]).toBe(vectors.everything.detail);
    expect(DETAILS).toEqual(["plain", "quasi", "sensitive"]);
  });

  it("keeps the sets the ladder's names and assist stand for", () => {
    expect(Object.keys(SETS).sort()).toEqual(Object.keys(vectors.sets).sort());
    for (const [name, set] of Object.entries(vectors.sets)) {
      const ours = SETS[name as keyof typeof SETS];
      expect([...ours.grants].sort(), name).toEqual(set.grants);
      expect(ours.detail, name).toBe(set.detail);
      // a set already holds the see of every work it gives
      expect(held(ours.grants), name).toEqual(set.grants);
    }
  });
});

describe("a caller's claims", () => {
  for (const v of vectors.claims) {
    it(v.name, () => {
      const own: Access = { grants: (v.claims.grants ?? []).filter(isGrant), detail: detailOf(v.claims.detail) };
      const groups = (v.claims.groups ?? []).map((g) => named(vectors.roles[g] ?? ""));
      agrees(union([own, ...groups]), v.expect);
    });
  }
});

describe("a ceiling", () => {
  for (const v of vectors.ceilings) {
    it(v.name, () => {
      const set = SETS[v.ceiling];
      const grants = held(v.grants).filter((g) => g === "assistant:use" || holdsGrant(set.grants, g));
      const detail = DETAILS[Math.min(DETAILS.indexOf(detailOf(v.detail)), DETAILS.indexOf(set.detail))];
      agrees({ grants, detail }, v.expect);
    });
  }
});

describe("a named token's role list", () => {
  for (const v of vectors.named) {
    it(v.name, () => {
      const names = v.roles.split(",").filter((s) => s !== "");
      agrees(union(names.map(named)), v.expect);
    });
  }
});
