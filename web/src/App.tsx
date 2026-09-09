// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from "react";
import type React from "react";
import type { Capabilities } from "./capabilities";
import { sections, state } from "./sections";
import { Question } from "./ask/Question";
import { Results } from "./results/Results";
import { Operations } from "./ops/Operations";
import { Data } from "./data/Data";
import { Settings } from "./settings/Settings";

type Load = { kind: "loading" } | { kind: "failed"; why: string } | { kind: "ready"; caps: Capabilities };

/** The shell: a pure function of the deployment capabilities document. */
export function App() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [current, setCurrent] = useState<string>(() => sectionOfHash() ?? "ask");

  // the hash names the section and, past the slash, what it opens:
  // #ask/12, #results, #operations/releases/77
  useEffect(() => {
    const onHash = () => {
      const s = sectionOfHash();
      if (s) setCurrent(s);
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
  const active = list.find((s) => s.id === current) ?? list[0];

  return (
    <div className="desk">
      <header className="top">
        <span className="mark">NILS</span>
        <nav>
          {list.map((s) => (
            <button key={s.id} className={s.id === active?.id ? "on" : ""} onClick={() => { setCurrent(s.id); if (!location.hash.startsWith(`#${s.id}`)) location.hash = `#${s.id}`; }}>
              {s.title}
            </button>
          ))}
        </nav>
        <span className="person">{caps.person.display_name}</span>
      </header>
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
        {st.kind === "ready" && active && <Section id={active.id} caps={caps} />}
        {st.kind === "ready" && !active && <section className="state">Nothing is open to this person.</section>}
      </main>
      <footer>
        <span>desk {caps.desk.version}, {caps.desk.mode} mode</span>
        {caps.engine && <span>engine {caps.engine.engine.version}, epoch {caps.engine.registry.epoch}</span>}
        {caps.desk.contract_mismatch && !caps.desk.contract_mismatch.major && <span className="warn">the engine is ahead of this desk</span>}
      </footer>
    </div>
  );
}

/** The section the hash names: its first segment, with app: kept whole. */
export function sectionOfHash(hash: string = location.hash): string | null {
  const m = /^#([a-z]+(?::[a-z0-9_-]+)?)(?:\/|$)/.exec(hash);
  return m ? m[1] : null;
}

function Section({ id, caps }: { id: string; caps: Capabilities }) {
  switch (id) {
    case "ask":
      return <Question />;
    case "results":
      return <Results caps={caps} />;
    case "operations":
      return <Operations caps={caps} />;
    case "data":
      return <Data caps={caps} />;
    case "settings":
      return <Settings caps={caps} />;
    case "assistant":
      return <section><h1>Assistant</h1><p>The chat pane arrives with D6.</p></section>;
    default:
      if (id.startsWith("app:")) {
        const app = caps.apps.find((a) => `app:${a.id}` === id);
        return <section><h1>{app?.title ?? app?.id}</h1><iframe title={app?.title} src={`/apps/${app?.id}/`} /></section>;
      }
      return null;
  }
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
