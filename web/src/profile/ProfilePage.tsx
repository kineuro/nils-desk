// SPDX-License-Identifier: AGPL-3.0-only
// A person's own page (records 23 and 25), kept terse: how they sign in, with
// the subject the desk knows them by on hover, their groups, and what they may
// open in the Identity page's few words, the pages hidden from them together
// and how much of a record they see as one tag. A line points to the Kvasir
// page for a ChatGPT subscription of their own, or the install's when nobody
// signs in.

import type { Capabilities } from "../capabilities";
import { may, type Detail } from "../grants";
import { href } from "../routes";
import { PAGE_ICONS } from "../settings/AccessForm";
import { Head } from "../settings/common";
import { RecordsTag } from "../settings/GroupCards";
import { PAGE_LINES, SIGN_IN, andWords, levelOf, yourWords, type PageLine } from "../settings/identity";
import { settingsPages } from "../settings/pages";
import { Icon } from "../ui/Icon";

export function ProfilePage({ caps }: { caps: Capabilities }) {
  const { person, desk } = caps;
  const who = person.display_name || person.subject;
  const off = desk.mode === "off";
  const kvasirPage = settingsPages(caps).some((p) => p.id === "gateway");
  // a subscription of one's own serves the assistant, so it is a person's who may use it and see Kvasir (record 25)
  const subscription = caps.kvasir === null ? null : off ? "install" : may(caps, "assistant:use") && may(caps, "kvasir:see") ? "own" : null;

  return (
    <div className="settings">
      <Head title={who} lede={off ? "Nobody signs in, so every page is open." : "How you sign in and what you may open."} />
      <div className="signin-row">
        <span className="signin-item" title={person.subject}>
          <Icon name="users" />
          {SIGN_IN[desk.mode]}
          <span className="sr-only">, as {person.subject}</span>
        </span>
        {!off && (
          <span className="amarks">
            {person.groups.length === 0 ? (
              <span className="meta">No groups</span>
            ) : (
              person.groups.map((g) => (
                <span key={g} className="tag">
                  {g}
                </span>
              ))
            )}
          </span>
        )}
      </div>
      <section className="stack roomy">
        <div className="section-head rule-top">
          <h2>Access</h2>
        </div>
        <YourAccess grants={person.grants} detail={person.detail} />
      </section>
      {subscription && (
        <p className="signin-item subscription-line">
          <Icon name="cloud" />
          {subscription === "own" ? "Your ChatGPT subscription:" : "The install's ChatGPT subscription:"} {kvasirPage ? <a href={href("settings", "gateway")}>Kvasir page</a> : "Kvasir page"}
        </p>
      )}
    </div>
  );
}

/** The Identity page's lines, read: each page a person holds and how far, the pages hidden from them together, and how much of a record they see. */
export function YourAccess({ grants, detail }: { grants: readonly string[]; detail: Detail }) {
  const shown = (settings: boolean) => PAGE_LINES.filter((l) => l.settings === settings && levelOf(grants, l) !== "hidden");
  const pages = shown(false);
  const settings = shown(true);
  const hidden = [...PAGE_LINES.filter((l) => !l.settings && levelOf(grants, l) === "hidden").map((l) => l.title), ...(settings.length === 0 ? ["Settings"] : [])];

  const row = (line: PageLine) => {
    const level = levelOf(grants, line);
    const icon = PAGE_ICONS[line.id];
    return (
      <div key={line.id} className={line.settings ? "arow deep" : "arow"}>
        {icon && <Icon name={icon} />}
        <b>{line.title}</b>
        <span className="state">
          <span className={level === "see" ? "amark" : "amark do"}>{level}</span>
        </span>
        <span className="what">{yourWords(line, level)}</span>
      </div>
    );
  };

  return (
    <div className="alist">
      {pages.map(row)}
      {settings.length > 0 && (
        <>
          <div className="arow">
            <Icon name="settings" />
            <b>Settings</b>
          </div>
          {settings.map(row)}
        </>
      )}
      {hidden.length > 0 && (
        <div className="arow hidden" title="Whoever may change people and groups can open them.">
          <Icon name="lock" />
          <b>{andWords(hidden)}</b>
          <span className="state meta">hidden</span>
        </div>
      )}
      <div className="arow">
        <Icon name="shield" />
        <b>Records</b>
        <span className="state">
          <RecordsTag detail={detail} />
        </span>
      </div>
    </div>
  );
}
