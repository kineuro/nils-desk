// SPDX-License-Identifier: AGPL-3.0-only
// The shell (Wave 5 section 6): the top bar, the side and the page; the
// assistant has a page of its own. Everything it shows is a predicate over the
// capabilities document, and each part of the desk is built back
// deliberately. Until the install is set up, Home is the page of its steps
// for a person who may see the install, and the rest of the desk waits.

import { useCallback, useEffect, useState } from "react";
import type React from "react";
import { AssistantPage } from "./assistant/AssistantPage";
import { chatsKept, importHere, sidePages } from "./assistant/chats";
import type { Capabilities } from "./capabilities";
import { BatchPage } from "./data/BatchPage";
import { CohortPage } from "./data/CohortPage";
import { CohortsPage } from "./data/CohortsPage";
import { DataPage } from "./data/DataPage";
import { PseudonymsPage } from "./data/PseudonymsPage";
import { PipelinesPage } from "./ops/PipelinesPage";
import { ReleasePage } from "./ops/ReleasePage";
import { QueryPage } from "./query/QueryPage";
import { door, state } from "./deployment";
import { may } from "./grants";
import { Home } from "./home/Home";
import { CampaignsPage } from "./campaigns/CampaignsPage";
import { PlaceholderPage } from "./home/Placeholder";
import { PLACEHOLDERS } from "./home/placeholders";
import { ready as readyToStart } from "./home/setup";
import { Setup } from "./home/Setup";
import { placesKept } from "./objects/kept";
import { ProfilePage } from "./profile/ProfilePage";
import { ReviewPage } from "./review/ReviewPage";
import { href, parse, type Route } from "./routes";
import { assistantOffered, foot, initials, sections, usable } from "./sections";
import { where } from "./settings/install";
import { backupsKept } from "./settings/kept";
import { Settings } from "./settings/Settings";
import { supervise, type Install } from "./settings/supervise";
import { Side } from "./Side";
import { Icon } from "./ui/Icon";
import { useKept } from "./ui/kept";
import { PageBoundary } from "./ui/PageBoundary";
import { ThemeSwitch } from "./ui/ThemeSwitch";

type Load = { kind: "loading" } | { kind: "failed"; why: string } | { kind: "ready"; caps: Capabilities };

export function App() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  // the side on a narrow window: a panel over the page, opened from the top bar
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  // the person's conversations, kept by the assistant and listed under the Assistant in the side (the chat, slice 2)
  const talks = useKept(chatsKept);

  useEffect(() => {
    const onHash = () => {
      setRoute(parse(location.hash));
      setMenu(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let alive = true;
    const fetchCaps = () =>
      fetch("/desk/capabilities")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`the desk answered ${r.status}`))))
        .then((caps: Capabilities) => alive && setLoad({ kind: "ready", caps }))
        .catch((e: Error) => alive && setLoad({ kind: "failed", why: e.message }));
    fetchCaps();
    // refreshed when a part's health or the engine's epoch moves
    const t = setInterval(fetchCaps, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // the install as the supervisor on this host reports it, for a person who may see the install, and when it was read
  const [install, setInstall] = useState<Install | null>(null);
  const [installAt, setInstallAt] = useState<number | null>(null);
  const [asked, setAsked] = useState(0);
  const supervised = load.kind === "ready" && may(load.caps, "install:see") && Boolean(load.caps.desk.settings?.supervisor_url);
  useEffect(() => {
    if (!supervised) {
      setInstall(null);
      return;
    }
    let alive = true;
    const read = () =>
      supervise
        .install()
        .then((i) => {
          if (!alive) return;
          setInstall(i);
          setInstallAt(Date.now());
        })
        .catch(() => alive && setInstall(null));
    read();
    const t = setInterval(read, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [supervised, asked]);

  // whether the install is set up, for a person who may see it, from the places and the backups every page keeps
  const places = useKept(placesKept);
  const archives = useKept(backupsKept);
  const known = load.kind === "ready" ? load.caps : null;
  const setsUp = known !== null && usable(known) && may(known, "install:see");
  const readsPlaces = setsUp && may(known, "places:see") && door(known, "GET /api/places");
  const readsBackups = setsUp && may(known, "database:see") && door(known, "GET /api/backups");
  useEffect(() => {
    if (readsPlaces) placesKept.ensure();
    if (readsBackups) backupsKept.ensure();
  }, [readsPlaces, readsBackups]);
  const talking = known !== null && assistantOffered(known);
  useEffect(() => {
    if (!talking) return;
    // the list an older desk kept in this browser is offered once, then the list is the assistant's
    importHere()
      .catch(() => 0)
      .then(() => chatsKept.refresh())
      .catch(() => undefined);
    const t = setInterval(() => chatsKept.refresh().catch(() => undefined), 60_000);
    return () => clearInterval(t);
  }, [talking]);
  // a read that failed does not hold the desk back
  const setupReady: boolean | null =
    known === null || !readsPlaces || (places.error !== null && places.value === null)
      ? true
      : readsBackups && archives.value === null && archives.error === null
        ? null
        : readyToStart(known, install, places.value?.places ?? null, readsBackups ? archives.value : null);
  // a person who landed on setup stays there until they open Home
  const [landed, setLanded] = useState(false);
  const [left, setLeft] = useState(false);
  useEffect(() => {
    if (setupReady === false) setLanded(true);
  }, [setupReady]);

  if (load.kind === "loading") return <main className="state lone">Reaching the desk</main>;
  if (load.kind === "failed") return <main className="state lone">The desk did not answer: {load.why}</main>;
  const caps = load.caps;
  const st = state(caps);
  // a model backend that is still warming keeps only the assistant waiting
  const ready = usable(caps);
  const side = sections(
    caps,
    setupReady,
    sidePages(talks.value?.conversations ?? []),
  );
  const kept = foot(caps);
  const sided = side.length + kept.length > 0;
  // a person's own page opens from their name in the top bar, apart from the sections
  const onProfile = ready && route.section === "profile";
  const active = onProfile ? null : ([...side, ...kept].find((s) => s.id === route.section) ?? side[0] ?? null);
  const inSettings = ready && active?.id === "settings";
  const onSetup = ready && setsUp && !left && (setupReady === false || landed);
  const placeholder = active !== null && PLACEHOLDERS.some((p) => p.id === active.id && !p.built);
  const who = caps.person.display_name || caps.person.subject;
  const body = ["body", sided ? "with-side" : null].filter(Boolean).join(" ");
  const changed = () => setAsked((n) => n + 1);

  return (
    <div className="desk">
      <header className="top">
        {sided && (
          <button type="button" className="icon-button menu-button" aria-label="Sections" aria-controls="side" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            <Icon name="menu" />
          </button>
        )}
        <a className="brandmark" href={href("home")} aria-label="NILS home">
          <img src="/brand/nils-mark.svg" alt="" width="22" height="22" />
          NILS
        </a>
        {install && (
          <span className="chip where">
            <Icon name="layers" />
            {where(install)}
          </span>
        )}
        <span className="grow" />
        {install?.release.newer && (
          <a className="update-note" href={href("settings", "parts")} title={`${install.release.newer} is out; to take it: ${install.release.command}`}>
            <Icon name="update" />
            <span className="update-words">{install.release.newer} is out</span>
          </a>
        )}
        <ThemeSwitch />
        {caps.desk.signed_in && who && (
          <a className="person" href={href("profile")} title={`${who}: your profile`} aria-label={`${who}: your profile`} aria-current={onProfile ? "page" : undefined}>
            <span className="avatar" aria-hidden="true">
              {initials(who)}
            </span>
            <span className="person-name">{who}</span>
          </a>
        )}
      </header>
      {caps.engine?.registry.synthetic && (
        <div className="banner" role="note">
          Made-up data: this registry was built by {caps.engine.registry.synthetic}. Nothing here is a real person or a real scan.
        </div>
      )}
      {/* only when the engine knows doors this desk does not: an engine older than the desk
          serves everything the desk needs, and the desk already shows nothing it does not serve */}
      {caps.desk.contract_mismatch && !caps.desk.contract_mismatch.major && caps.desk.contract_mismatch.direction === "ahead" && (
        <div className="banner" role="note">
          The engine is ahead of this desk. Everything here still works; update the desk to see what the engine added.
        </div>
      )}
      {st.kind === "warming" && (
        <div className="banner" role="note">
          The model backend has not produced its first token since it started. The rest of the desk works; the assistant waits.
        </div>
      )}
      <div className={body}>
        {sided && <Side top={side} foot={kept} section={active?.id ?? null} page={route.page} open={menu} onClose={closeMenu} />}
        <main className="page">
          <PageBoundary route={`${route.section}/${route.page ?? ""}/${route.arg ?? ""}`}>
          {st.kind === "login" && (
            <Login how={st.how} url={st.url} nobody={(caps.desk.login as { nobody_yet?: boolean } | null)?.nobody_yet === true} onDone={() => location.reload()} />
          )}
          {st.kind === "unbound" && (
            <section className="state">
              <h1>No grant yet</h1>
              <p>
                The account <code>{caps.person.subject}</code> exists and holds no grant. Pages are given on the Identity page, through a group or
                to this account alone{caps.desk.mode === "oidc" ? ", and a group there can follow a group of yours at the identity provider" : ""}. Nothing
                here is broken; nothing is open yet.
              </p>
            </section>
          )}
          {st.kind === "no_engine" && (
            <section className="state">
              <h1>The engine did not answer</h1>
              <p>The desk reaches the engine and got nothing. When it answers, this page fills itself.</p>
            </section>
          )}
          {st.kind === "contract_mismatch" && (
            <section className="state">
              <h1>Contract mismatch</h1>
              <p>
                The engine speaks {Object.entries(st.found).map(([k, v]) => `${k} ${v}`).join(", ")}; this desk speaks{" "}
                {Object.entries(st.speaks).map(([k, v]) => `${k} ${v}`).join(", ")}. Update the one that is behind.
              </p>
            </section>
          )}
          {ready && active?.id === "home" && setsUp && setupReady === null && <p className="meta">Reading the install.</p>}
          {ready && active?.id === "home" && setupReady !== null && onSetup && <Setup caps={caps} install={install} onChanged={changed} onHome={setupReady ? () => setLeft(true) : undefined} />}
          {ready && active?.id === "home" && setupReady !== null && !onSetup && <Home caps={caps} install={install} />}
          {ready && active?.id === "assistant" && <AssistantPage caps={caps} conversation={route.page} />}
          {ready && active?.id === "data" && route.page === "batch" && route.arg !== null && /^\d+$/.test(route.arg) && <BatchPage caps={caps} id={Number(route.arg)} />}
          {ready && active?.id === "data" && route.page === "datasets" && route.arg !== null && route.sub === "pseudonymisation" && <PseudonymsPage caps={caps} name={route.arg} onChanged={changed} />}
          {ready && active?.id === "data" && route.page === "cohorts" && route.arg && <CohortPage caps={caps} name={route.arg} />}
          {ready && active?.id === "data" && route.page === "cohorts" && !route.arg && <CohortsPage caps={caps} />}
          {ready && active?.id === "data" && !((route.page === "batch" && route.arg !== null && /^\d+$/.test(route.arg)) || (route.page === "datasets" && route.arg !== null && route.sub === "pseudonymisation") || route.page === "cohorts") && (
            <DataPage caps={caps} install={install} onChanged={changed} dataset={route.page === "datasets" ? route.arg : null} />
          )}
          {ready && active?.id === "query" && <QueryPage caps={caps} open={route.page} />}
          {ready && active?.id === "pipelines" && <PipelinesPage caps={caps} />}
          {ready && active?.id === "release" && <ReleasePage caps={caps} page={route.page} arg={route.arg} />}
          {ready && active?.id === "review" && <ReviewPage caps={caps} page={route.page} query={route.query} />}
          {ready && active?.id === "campaigns" && <CampaignsPage caps={caps} page={route.page} arg={route.arg} query={route.query} />}
          {ready && placeholder && active && <PlaceholderPage id={active.id} />}
          {inSettings && <Settings caps={caps} install={install} checkedAt={installAt} page={route.page} onChanged={changed} />}
          {onProfile && <ProfilePage caps={caps} />}
          {ready && active === null && !onProfile && (
            <section className="state">
              <h1>Nothing is open to you here</h1>
              <p>The desk has no section for the grants this account holds.</p>
            </section>
          )}
          </PageBoundary>
        </main>
      </div>
    </div>
  );
}

function Login({ how, url, nobody, onDone }: { how: "password" | "redirect"; url: string; nobody: boolean; onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [why, setWhy] = useState<string | null>(null);
  if (how === "redirect") {
    return (
      <section className="state">
        <h1>Sign in</h1>
        <p>This desk signs you in at your organisation's identity provider.</p>
        <p>
          <a className="button" href={url}>
            Continue
          </a>
        </p>
      </section>
    );
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    fetch(url, { method: "POST", headers: { "content-type": "application/json", "X-Nils-Desk": "1" }, body: JSON.stringify({ username, password }) })
      .then(async (r) => (r.ok ? onDone() : setWhy((await r.json()).error ?? `the desk answered ${r.status}`)))
      .catch((e: Error) => setWhy(e.message));
  };
  return (
    <section className="state">
      <h1>Sign in</h1>
      {nobody && (
        <div className="note caution">
          <div className="note-body">
            <p className="note-lead">Nobody can sign in yet.</p>
            <p className="note-detail">
              This desk keeps its own people, and none has been added. On the machine the desk runs on, run nils setup again, which asks for the first person, or add them with:
            </p>
            <code>nils-desk user add &lt;name&gt; --admin --config nils-desk.toml</code>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="login">
        <label>
          Username <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <p>
          <button type="submit" className="button">
            Sign in
          </button>
        </p>
        {why && <p className="warn">{why}</p>}
      </form>
    </section>
  );
}
