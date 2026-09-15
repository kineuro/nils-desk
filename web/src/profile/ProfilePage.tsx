// SPDX-License-Identifier: AGPL-3.0-only
// A person's own page (record 23), opened from their name in the top bar:
// who the desk knows them as and what they may do, and their own ChatGPT
// subscription, which serves only their conversations. On a desk that signs
// nobody in, the subscription is the install's, signed in on the Kvasir page.

import { useEffect, useState } from "react";
import type { Capabilities } from "../capabilities";
import { holds } from "../deployment";
import { href } from "../routes";
import { Head } from "../settings/common";
import { MODES, topStep } from "../settings/identity";
import { kvasir, type Subscription } from "../settings/kvasir";
import { settingsPages } from "../settings/pages";
import { placeOf } from "../settings/subscription";
import { SubscriptionCard } from "../settings/SubscriptionCard";

export function ProfilePage({ caps }: { caps: Capabilities }) {
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const reaches = caps.kvasir !== null;

  useEffect(() => {
    if (!reaches) return;
    let alive = true;
    kvasir
      .subscriptions()
      .then((s) => alive && setSubscriptions(s?.subscriptions ?? null))
      .catch(() => alive && setSubscriptions(null));
    return () => {
      alive = false;
    };
  }, [reaches]);

  const who = caps.person.display_name || caps.person.subject;
  const step = caps.person.groups.length > 0 ? caps.person.groups.join(", ") : topStep([]);
  const assist = holds(caps, "assist");
  const mode = MODES.find((m) => m.id === caps.desk.mode) ?? null;
  const place = placeOf(subscriptions);
  // a person's own subscription serves their conversations, so it is offered to a person who uses the assistant
  const own = assist ? place.profile : null;
  const kvasirPage = settingsPages(caps).some((p) => p.id === "gateway");

  return (
    <div className="settings">
      <Head title={who} lede={own ? "Who the desk knows you as, what you may do, and your own ChatGPT subscription." : "Who the desk knows you as, and what you may do."} />
      <section className="panel card">
        <dl className="facts">
          <dt>signed in as</dt>
          <dd>
            <span className="path">{caps.person.subject}</span>
          </dd>
          <dt>your role</dt>
          <dd>{step ?? "none yet"}</dd>
          <dt>the assistant</dt>
          <dd>{assist ? "yours to use" : "not open to you"}</dd>
          <dt>signing in</dt>
          <dd>{mode?.words ?? caps.desk.mode}</dd>
        </dl>
      </section>
      {own && (
        <section className="stack">
          <div className="section-head rule-top">
            <h2>Subscription</h2>
          </div>
          <SubscriptionCard row={own} />
        </section>
      )}
      {place.kvasir && (
        <section className="stack">
          <div className="section-head rule-top">
            <h2>Subscription</h2>
          </div>
          <p>
            This desk signs nobody in, so the ChatGPT subscription is the install's, and every conversation on it uses that one.{" "}
            {kvasirPage && <a href={href("settings", "gateway")}>The Kvasir page</a>}
          </p>
        </section>
      )}
    </div>
  );
}
