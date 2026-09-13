// SPDX-License-Identifier: AGPL-3.0-only
// What Settings' overview reads, kept between pages like the places: the
// backups and their schedule, the registry's status, the people the desk
// keeps, the gateway's backends and the newest acts of the audit log.

import { ops, type AuditRow } from "../ops/client";
import { keeper } from "../ui/kept";
import { database, type Backups, type RegistryStatus } from "./database";
import { identity, type Users } from "./identity";
import { kvasir, type Backend } from "./kvasir";

export const backupsKept = keeper<Backups>(() => database.backups());
export const statusKept = keeper<RegistryStatus>(() => database.status().then((s) => s.registry));
export const usersKept = keeper<Users>(() => identity.users());
export const backendsKept = keeper<Backend[]>(() => kvasir.backends().then((b) => b.backends));
/** The newest acts; enough to say the last one and how many this month. */
export const auditKept = keeper<AuditRow[]>(() => ops.audit({ limit: 200 }).then((r) => r.rows));
