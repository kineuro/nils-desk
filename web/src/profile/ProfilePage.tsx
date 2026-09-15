// SPDX-License-Identifier: AGPL-3.0-only
// A person's own page (records 23 and 25), opened from their name in the top
// bar: who the desk knows them as and their groups, and what they may see and
// do in the Identity page's words. A ChatGPT subscription of their own is
// added on the Kvasir page, and a line here says so to a person who may add
// one; on a desk that signs nobody in, the subscription is the install's.

import type { Capabilities } from "../capabilities";
import { may, type Detail } from "../grants";
import { href } from "../routes";
import { PAGE_ICONS } from "../settings/AccessForm";
import { Head } from "../settings/common";
import { MODES, PAGE_LINES, RECORD_WORDS, andWords, levelOf, yourWords, type PageLine } from "../settings/identity";
import { settingsPages } from "../settings/pages";
import { Icon } from "../ui/Icon";

export function ProfilePage({ caps }: { caps: Capabilities }) {
  const { person, desk } = caps;
  const who = person.display_name || person.subject;
  const off = desk.mode === "off";
  const mode = MODES.find((m) => m.id === desk.mode) ?? null;
  const kvasirPage = settingsPages(caps).some((p) => p.id === "gateway");
  // a subscription of one's own serves the assistant, so it is a person's who may use it and see Kvasir (record 25)
  const subscription = caps.kvasir === null ? null : off ? "install" : may(caps, "assistant:use") && may(caps, "kvasir:see") ? "own" : null;

  return (
    <div className="settings">
      <Head title={who} lede="Who the desk knows you as, and what you may see and do." />
      <section className="panel card">
        <dl className="facts">
          <dt>{off ? "the desk knows you as" : "signed in as"}</dt>
          <dd>
            <span className="path">{person.subject}</span>
          </dd>
          <dt>signing in</dt>
          <dd>{mode?.title ?? desk.mode}</dd>
          {!off && (
            <>
              <dt>your groups</dt>
              <dd>
                {person.groups.length === 0 ? (
                  "none"
                ) : (
                  <span className="amarks">
                    {person.groups.map((g) => (
                      <span key={g} className="tag">
                        {g}
                      </span>
                    ))}
                  </span>
                )}
              </dd>
            </>
          )}
        </dl>
      </section>
      <section className="stack roomy">
        <div className="section-head rule-top">
          <h2>What you may see and do</h2>
          <span className="meta">{off ? "all of it, since nobody signs in" : "an admin sets this"}</span>
        </div>
        <YourAccess grants={person.grants} detail={person.detail} />
      </section>
      {subscription && (
        <div className="note">
          <Icon name="cloud" />
          <div className="note-body">
            <p className="note-detail">
              {subscription === "own"
                ? "A ChatGPT subscription of your own, which serves only your conversations, is added and signed in on the Kvasir page."
                : "This desk signs nobody in, so the ChatGPT subscription is the install's, signed in on the Kvasir page."}{" "}
              {kvasirPage && <a href={href("settings", "gateway")}>The Kvasir page</a>}
            </p>
          </div>
        </div>
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
            <span className="what">The pages under it that are open to you.</span>
          </div>
          {settings.map(row)}
        </>
      )}
      {hidden.length > 0 && (
        <div className="arow hidden">
          <Icon name="lock" />
          <b>{andWords(hidden)}</b>
          <span className="state meta">not shown to you</span>
          <span className="what">An admin can open them for you.</span>
        </div>
      )}
      <div className="arow">
        <Icon name="shield" />
        <b>What you see in records</b>
        <span className="state">
          <span className="amark">{RECORD_WORDS[detail].choice.toLowerCase()}</span>
        </span>
        <span className="what">{RECORD_WORDS[detail].says}</span>
      </div>
    </div>
  );
}
