// SPDX-License-Identifier: AGPL-3.0-only
// Settings' overview, a dashboard: what needs a person first, then a card for
// each page with its state and the facts that matter most. A card opens its
// page. What the cards read is kept between pages, and read again on asking.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { door as served } from "../deployment";
import { placesKept } from "../objects/kept";
import { href } from "../routes";
import { Icon, type IconName } from "../ui/Icon";
import { agoWords, useKept } from "../ui/kept";
import { Head, Health, messageOf } from "./common";
import { auditKept, backendsKept, backupsKept, statusKept, usersKept } from "./kept";
import { attention, auditCard, backupsCard, gatewayCard, partsCard, placesCard, registryCard, signinCard, type Card } from "./overview";
import { settingsPages } from "./pages";
import type { Install } from "./supervise";

interface Slot {
  key: string;
  page: string;
  title: string;
  icon: IconName;
  card: Card | null;
  failed: string | null;
}

/** A kept read, as far as the overview uses one. */
interface Read {
  ensure(): void;
  refresh(): Promise<unknown>;
  get(): { at: number | null; reading: boolean };
}

export function OverviewPage({ caps, install }: { caps: Capabilities; install: Install | null }) {
  const offered = settingsPages(caps).map((p) => p.id);
  const has = (id: string) => offered.includes(id);
  const places = useKept(placesKept);
  const backups = useKept(backupsKept);
  const status = useKept(statusKept);
  const users = useKept(usersKept);
  const backends = useKept(backendsKept);
  const audit = useKept(auditKept);
  const [now, setNow] = useState(() => new Date());

  // the reads this person's cards want, by the pages offered and the doors served
  const reads: Read[] = [
    has("places") ? placesKept : null,
    has("database") && served(caps, "GET /api/backups") ? backupsKept : null,
    has("database") && served(caps, "GET /api/status") ? statusKept : null,
    has("identity") && caps.desk.mode === "local" ? usersKept : null,
    has("gateway") ? backendsKept : null,
    has("audit") ? auditKept : null,
  ].filter((r): r is NonNullable<typeof r> => r !== null);

  useEffect(() => {
    for (const r of reads) r.ensure();
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once when the page opens; the button reads again
  }, []);

  const reading = reads.some((r) => r.get().reading);
  const read = reads.map((r) => r.get().at).filter((at): at is number => at !== null);
  const oldest = read.length > 0 && read.length === reads.length ? Math.min(...read) : null;
  const readAgain = () => {
    for (const r of reads) void r.refresh().catch(() => undefined);
  };
  const failed = (e: unknown, value: unknown) => (e && value === null ? messageOf(e) : null);

  const containers = install !== null && (install.runtime === "docker" || install.runtime === "podman");
  const slots: Slot[] = [{ key: "parts", page: "parts", title: "Parts", icon: "layers", card: partsCard(caps, install), failed: null }];
  if (has("places")) slots.push({ key: "places", page: "places", title: "Places", icon: "folder", card: places.value ? placesCard(places.value.places, containers) : null, failed: failed(places.error, places.value) });
  if (has("database")) {
    if (served(caps, "GET /api/backups")) slots.push({ key: "backups", page: "database", title: "Backups", icon: "shield", card: backups.value ? backupsCard(backups.value, now) : null, failed: failed(backups.error, backups.value) });
    slots.push({
      key: "registry",
      page: "database",
      title: "Registry",
      icon: "data",
      card: registryCard(caps, install, status.value?.backend ?? null, places.value?.places ?? null, backups.value?.schedule.timezone ?? null),
      failed: null,
    });
  }
  if (has("identity")) slots.push({ key: "signin", page: "identity", title: "Sign-in", icon: "users", card: signinCard(caps, users.value), failed: null });
  if (has("gateway")) slots.push({ key: "gateway", page: "gateway", title: "Kvasir", icon: "gateway", card: backends.value ? gatewayCard(caps, backends.value) : null, failed: failed(backends.error, backends.value) });
  if (has("audit")) slots.push({ key: "audit", page: "audit", title: "Audit", icon: "file", card: audit.value ? auditCard(audit.value, now) : null, failed: failed(audit.error, audit.value) });
  const needs = attention(slots.flatMap((s) => (s.card ? [s.card] : [])));
  const settled = slots.every((s) => s.card !== null || s.failed !== null);

  return (
    <div className="settings">
      <Head title="Settings" lede="How this install stands. A card opens its page.">
        {reads.length > 0 && (
          <span className="kept-at">
            <span className="meta">{reading ? "reading" : oldest !== null ? `read ${agoWords(oldest, now.getTime())}` : ""}</span>
            <button type="button" className="icon-button" title="Read everything again" aria-label="Read everything again" disabled={reading} onClick={readAgain}>
              <Icon name="restart" />
            </button>
          </span>
        )}
      </Head>
      <section className="attention" aria-label="what needs you">
        {needs.map((a) => (
          <a key={a.words} className={`attention-item ${a.tone}`} href={href("settings", a.page)}>
            <Icon name={a.tone === "brand" ? "update" : "alert"} />
            <span className="grow">{a.words}</span>
            <Icon name="chevron-right" />
          </a>
        ))}
        {needs.length === 0 && settled && (
          <p className="attention-ok">
            <Icon name="check" />
            Nothing needs you.
          </p>
        )}
      </section>
      <div className="dash">
        {slots.map((s) => (
          <a key={s.key} className="panel dash-card" href={href("settings", s.page)}>
            <span className="dash-top">
              <Icon name={s.icon} />
              <span className="dash-title">{s.title}</span>
              {s.card?.state && <Health tone={s.card.state.tone} words={s.card.state.words} />}
            </span>
            {s.card ? (
              <>
                <span className="dash-value">{s.card.value}</span>
                {s.card.facts.length > 0 && (
                  <span className="dash-facts">
                    {s.card.facts.map((f) => (
                      <span key={f}>{f}</span>
                    ))}
                  </span>
                )}
              </>
            ) : (
              <span className={s.failed ? "warn" : "meta"}>{s.failed ?? "reading"}</span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
