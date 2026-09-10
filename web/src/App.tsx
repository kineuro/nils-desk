// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import type React from "react";
import type { Capabilities } from "./capabilities";
import { sections, state } from "./sections";
import { legacy, parse, type Route } from "./routes";
import { Home } from "./home/Home";
import { Question } from "./ask/Question";
import { Results } from "./results/Results";
import { Review } from "./review/Review";
import { Release } from "./release/Release";
import { Pipelines } from "./pipelines/Pipelines";
import { Data } from "./data/Data";
import { Settings } from "./settings/Settings";
import { Pane } from "./assistant/Pane";
import { ObjectPage } from "./objects/ObjectPage";
import { Rail, RailProvider, railPresent, usePageContext } from "./Rail";
import { install as installShortcuts } from "./ui/shortcuts";
import { controls } from "./sections";

type Load = { kind: "loading" } | { kind: "failed"; why: string } | { kind: "ready"; caps: Capabilities };

/** The shell: a pure function of the deployment capabilities document. */
export function App() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [route, setRoute] = useState<Route>(() => parse());

  // the hash names the section and, past the slash, what it opens, or an object's page (section 6.3)
  useEffect(() => {
    const onHash = () => {
      const moved = legacy(location.hash);
      if (moved) {
        location.hash = moved;
        return;
      }
      setRoute(parse());
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => installShortcuts((h) => { location.hash = h; }), []);

  useEffect(() => {
    let alive = true;
    const fetchCaps = () =>
      fetch("/desk/capabilities")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`the desk answered ${r.status}`))))
        .then((caps: Capabilities) => alive && setLoad({ kind: "ready", caps }))
        .catch((e: Error) => alive && setLoad({ kind: "failed", why: e.message }));
    fetchCaps();
    // refreshed when the engine's epoch moves or a part's health changes:
    // the desk keeps the document briefly, so a poll is cheap
    const t = setInterval(fetchCaps, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (load.kind === "loading") return <main className="state">Reaching the desk</main>;
  if (load.kind === "failed") return <main className="state">The desk did not answer: {load.why}</main>;
  const caps = load.caps;
  const st = state(caps);
  const list = sections(caps);
  const current = route.kind === "object" ? null : route.section;
  const active = current === null ? null : (list.find((s) => s.id === current) ?? list[0] ?? null);
  const rail = st.kind === "ready" && railPresent(caps) && current !== "assistant";

  return (
    <RailProvider>
      <div className={`desk${rail ? " with-rail" : ""}`}>
        <header className="top">
          <a className="mark" href="#home" aria-label="NILS home">
            <img src="/brand/nils-mark.svg" alt="" width="22" height="22" />
            NILS
          </a>
          <nav aria-label="sections">
            {list.map((s) => (
              <a key={s.id} className={s.id === active?.id ? "on" : ""} href={`#${s.id}`}>
                {s.title}
              </a>
            ))}
          </nav>
          <span className="person">{caps.person.display_name}</span>
        </header>
        {caps.engine?.registry.synthetic && (
          <div className="banner" role="note">
            Made-up data: this registry was built by {caps.engine.registry.synthetic}. Nothing here is a real person or a real scan.
          </div>
        )}
        <div className="body">
          <main>
            {st.kind === "login" && <Login how={st.how} url={st.url} onDone={() => location.reload()} />}
            {st.kind === "unbound" && (
              <section className="state">
                <h1>No entitlement yet</h1>
                <p>
                  The account <code>{caps.person.subject}</code> exists and holds no entitlement. An operator binds one of
                  <code> reader</code>, <code>reviewer</code>, <code>operator</code> or <code>admin</code>
                  {caps.desk.mode === "oidc" ? " to a group of yours at the identity provider" : " to this user on the settings page"}.
                  Nothing here is broken; nothing is open yet.
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
            {st.kind === "ready" && route.kind === "object" && <ObjectPage caps={caps} kind={route.object} id={route.id} />}
            {st.kind === "ready" && route.kind === "section" && active && <Section id={active.id} caps={caps} route={route} />}
            {st.kind === "ready" && route.kind === "section" && !active && <section className="state">Nothing is open to this person.</section>}
          </main>
          {rail && <Rail caps={caps} />}
        </div>
        <footer>
          <span>desk {caps.desk.version}, {caps.desk.mode} mode</span>
          {caps.engine && <span>engine {caps.engine.engine.version}, epoch {caps.engine.registry.epoch}</span>}
          {caps.desk.contract_mismatch && !caps.desk.contract_mismatch.major && <span className="warn">the engine is ahead of this desk</span>}
        </footer>
      </div>
    </RailProvider>
  );
}

function Section({ id, caps, route }: { id: string; caps: Capabilities; route: Route & { kind: "section" } }) {
  switch (id) {
    case "home":
      return <Home caps={caps} />;
    case "ask":
      return <Ask caps={caps} route={route} />;
    case "data":
      return <Data caps={caps} />;
    case "review":
      return <Review caps={caps} />;
    case "release":
      return <Release caps={caps} />;
    case "pipelines":
      return <Pipelines caps={caps} />;
    case "settings":
      return <Settings caps={caps} />;
    case "assistant":
      return <AssistantSection caps={caps} />;
    default:
      if (id.startsWith("app:")) {
        const app = caps.apps.find((a) => `app:${a.id}` === id);
        return (
          <section>
            <h1>{app?.title ?? app?.id}</h1>
            <iframe title={app?.title} src={`/apps/${app?.id}/`} />
          </section>
        );
      }
      return null;
  }
}

/** Ask: the questions, and the results beside them as a tab (section 6.2 has no Results section; a result is an object). */
function Ask({ caps, route }: { caps: Capabilities; route: Route & { kind: "section" } }) {
  const tabs = controls(caps, "ask");
  const tab = route.tab === "results" && tabs.includes("results") ? "results" : "questions";
  return (
    <>
      {tabs.length > 1 && (
        <nav className="tabs" aria-label="ask">
          <a className={tab === "questions" ? "on" : ""} href="#ask">
            Questions
          </a>
          <a className={tab === "results" ? "on" : ""} href="#ask/results">
            Results
          </a>
        </nav>
      )}
      {tab === "questions" ? <Question caps={caps} /> : <Results caps={caps} />}
    </>
  );
}

/** Section 7.7 and Wave 5 section 6.4: the same conversation at full width, for work that is not about one object. */
function AssistantSection({ caps }: { caps: Capabilities }) {
  usePageContext({ page: { kind: "assistant", id: null }, epoch: caps.engine?.registry.epoch });
  return (
    <section className="ask">
      <h1>Assistant</h1>
      <p>Words to a document. Open a question to refine it in the rail instead, one step at a time.</p>
      <Pane caps={caps} docId={null} chain={[]} epoch={caps.engine?.registry.epoch ?? 0} onOpen={(id) => { location.hash = `#ask/${id}`; }} />
    </section>
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
        <a className="button" href={url}>Continue</a>
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
        <label>Username <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>
        <label>Password <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        <button type="submit">Sign in</button>
        {why && <p className="warn">{why}</p>}
      </form>
    </section>
  );
}
