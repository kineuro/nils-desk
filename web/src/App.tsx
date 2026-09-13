// SPDX-License-Identifier: AGPL-3.0-only
// The shell (Wave 5 section 6): the top bar, the sections down the side, the
// page, and the assistant's rail on the right. Everything it shows is a
// predicate over the capabilities document, and each part of the desk is
// built back deliberately, so a section that is not built is not offered.

import { useEffect, useState } from "react";
import type React from "react";
import type { Capabilities } from "./capabilities";
import { holds, state } from "./deployment";
import { Home } from "./home/Home";
import { Rail } from "./Rail";
import { href, parse, type Route } from "./routes";
import { foot, initials, railPresent, sections, type Section } from "./sections";
import { where } from "./settings/install";
import { supervise, type Install } from "./settings/supervise";
import { Icon } from "./ui/Icon";

type Load = { kind: "loading" } | { kind: "failed"; why: string } | { kind: "ready"; caps: Capabilities };

export function App() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [route, setRoute] = useState<Route>(() => parse(location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parse(location.hash));
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

  // the install as the supervisor on this host reports it, for an admin
  const [install, setInstall] = useState<Install | null>(null);
  const [asked, setAsked] = useState(0);
  const supervised = load.kind === "ready" && holds(load.caps, "admin") && Boolean(load.caps.desk.settings?.supervisor_url);
  useEffect(() => {
    if (!supervised) {
      setInstall(null);
      return;
    }
    let alive = true;
    const read = () =>
      supervise
        .install()
        .then((i) => alive && setInstall(i))
        .catch(() => alive && setInstall(null));
    read();
    const t = setInterval(read, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [supervised, asked]);

  if (load.kind === "loading") return <main className="state lone">Reaching the desk</main>;
  if (load.kind === "failed") return <main className="state lone">The desk did not answer: {load.why}</main>;
  const caps = load.caps;
  const st = state(caps);
  const side = sections(caps);
  const kept = foot(caps);
  const active = [...side, ...kept].find((s) => s.id === route.section) ?? side[0] ?? null;
  const rail = active !== null && railPresent(caps, active.id);
  const who = caps.person.display_name || caps.person.subject;
  const body = ["body", side.length + kept.length > 0 ? "with-side" : null, rail ? "with-rail" : null].filter(Boolean).join(" ");

  return (
    <div className="desk">
      <header className="top">
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
          <span className="update-note" title={`to take it: ${install.release.command}`}>
            <Icon name="update" />
            {install.release.newer} is out
          </span>
        )}
        {caps.desk.signed_in && who && (
          <span className="person">
            <span className="avatar" aria-hidden="true">
              {initials(who)}
            </span>
            {who}
          </span>
        )}
      </header>
      {caps.engine?.registry.synthetic && (
        <div className="banner" role="note">
          Made-up data: this registry was built by {caps.engine.registry.synthetic}. Nothing here is a real person or a real scan.
        </div>
      )}
      {caps.desk.contract_mismatch && !caps.desk.contract_mismatch.major && (
        <div className="banner" role="note">
          The engine is ahead of this desk. Everything here still works; update the desk to see what the engine added.
        </div>
      )}
      <div className={body}>
        {side.length + kept.length > 0 && (
          <nav className="side" aria-label="sections">
            {side.map((s) => (
              <SideLink key={s.id} section={s} on={s.id === active?.id} />
            ))}
            {kept.length > 0 && (
              <div className="foot">
                {kept.map((s) => (
                  <SideLink key={s.id} section={s} on={s.id === active?.id} />
                ))}
              </div>
            )}
          </nav>
        )}
        <main className="page">
          {st.kind === "login" && <Login how={st.how} url={st.url} onDone={() => location.reload()} />}
          {st.kind === "unbound" && (
            <section className="state">
              <h1>No entitlement yet</h1>
              <p>
                The account <code>{caps.person.subject}</code> exists and holds no entitlement. An operator binds one of
                <code> reader</code>, <code>reviewer</code>, <code>operator</code> or <code>admin</code>
                {caps.desk.mode === "oidc" ? " to a group of yours at the identity provider" : " to this user"}. Nothing here is broken;
                nothing is open yet.
              </p>
            </section>
          )}
          {st.kind === "warming" && (
            <section className="state">
              <h1>Warming</h1>
              <p>The model backend has not produced its first token since it started. The rest of the desk works; the assistant waits.</p>
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
          {st.kind === "ready" && active?.id === "home" && <Home caps={caps} install={install} onChanged={() => setAsked((n) => n + 1)} />}
          {st.kind === "ready" && active === null && (
            <section className="state">
              <h1>Nothing is open to you here</h1>
              <p>The desk has no section for the entitlements this account holds.</p>
            </section>
          )}
        </main>
        {rail && active && <Rail key={active.id} caps={caps} section={active.id} />}
      </div>
    </div>
  );
}

function SideLink({ section, on }: { section: Section; on: boolean }) {
  return (
    <a className={on ? "on" : undefined} href={href(section.id)} aria-current={on ? "page" : undefined}>
      <Icon name={section.icon} />
      {section.title}
    </a>
  );
}

function Login({ how, url, onDone }: { how: "password" | "redirect"; url: string; onDone: () => void }) {
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
