// SPDX-License-Identifier: AGPL-3.0-only
// Database (Wave 5 section 10.3): which place the registry is on and
// whether it passes the rule; the registry's size, epoch and schema version;
// the last backup and when the next runs; backup now as a job; a restore
// rehearsal that verifies an archive without applying it; for the server
// backend, the connection, the schema and the read-only role, the password
// never shown.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { Backup, Restore } from "../data/Data";
import { type CustodyStore, ops } from "../ops/client";
import { objects, type Place } from "../objects/client";
import { door as served } from "../sections";
import { classify, Failure, type Failed } from "../ui/Failure";

export function Database({ caps }: { caps: Capabilities }) {
  const [custody, setCustody] = useState<{ home: string; backend: string; registry_id: string; stores: CustodyStore[] } | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [failed, setFailed] = useState<Failed | null>(null);
  useEffect(() => {
    ops.custody().then(setCustody).catch((e: unknown) => setFailed(classify(e)));
    if (served(caps, "GET /api/places")) objects.places().then((p) => setPlaces(p.places)).catch(() => setPlaces([]));
  }, [caps]);
  const registryPlace = places.find((p) => p.role === "registry" && !p.retired_at) ?? null;
  const backup = registryPlace ? places.find((p) => p.name === registryPlace.guarantees?.backup) ?? null : null;
  const registryStore = custody?.stores.find((s) => s.store === "registry") ?? null;
  const bytes = registryStore?.files.reduce((n, f) => n + f.bytes, 0) ?? null;
  const server = custody && custody.backend !== "sqlite";
  return (
    <div className="database">
      {failed && <Failure failed={failed} />}
      <dl className="facts">
        <dt>place</dt>
        <dd>
          {registryPlace ? (
            <>
              {registryPlace.name}, <code>{registryPlace.path}</code>
              {backup ? <span className="tag"> backed up to {backup.name}</span> : <span className="tag warn"> no backup place: fails the rule</span>}
            </>
          ) : (
            <>
              <code>{custody?.home ?? ""}</code> <span className="meta">(not bound to a place)</span>
            </>
          )}
        </dd>
        <dt>backend</dt>
        <dd>{custody?.backend ?? ""}</dd>
        <dt>registry id</dt>
        <dd>
          <code>{custody?.registry_id ?? ""}</code>
        </dd>
        <dt>epoch</dt>
        <dd>{caps.engine?.registry.epoch ?? ""}</dd>
        <dt>schema version</dt>
        <dd>{caps.engine?.registry.schema_version ?? "unknown"}</dd>
        {bytes !== null && (
          <>
            <dt>size</dt>
            <dd>{(bytes / 1e6).toFixed(1)} MB in {registryStore?.files.length} files</dd>
          </>
        )}
        {registryStore && (
          <>
            <dt>kept</dt>
            <dd>{registryStore.kept}</dd>
          </>
        )}
      </dl>
      {server && custody && (
        <div className="panel">
          <h3>The server</h3>
          <p className="meta">The connection, the schema and the read-only role the ask reader uses, as the engine declares them; the password is never shown.</p>
          <pre>{custody.stores.filter((s) => s.store !== "registry").length === 0 ? "" : ""}{custody.stores.find((s) => s.store === "registry")?.where ?? ""}</pre>
        </div>
      )}
      <h3>Backups</h3>
      <Backup caps={caps} />
      <h3>Restore rehearsal</h3>
      <p className="meta">Verify runs as a job above and applies nothing; restore itself is the procedure below, by hand, with the engine stopped.</p>
      <Restore />
    </div>
  );
}
