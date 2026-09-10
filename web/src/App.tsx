// SPDX-License-Identifier: AGPL-3.0-only
// The shell. A fresh install of the engine and the desk opens here and sees
// what the deployment is and what it holds, and nothing that is not there.
// Each part of the desk is built back deliberately.

import { useEffect, useState } from "react";
import type React from "react";
import type { Capabilities } from "./capabilities";
import { state } from "./deployment";
import { Home } from "./home/Home";

type Load = { kind: "loading" } | { kind: "failed"; why: string } | { kind: "ready"; caps: Capabilities };

export function App() {
  const [load, setLoad] = useState<Load>({ kind: "loading" });

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

  if (load.kind === "loading") return <main className="state">Reaching the desk</main>;
  if (load.kind === "failed") return <main className="state">The desk did not answer: {load.why}</main>;
  const caps = load.caps;
  const st = state(caps);

  return (
    <div className="desk">
      <header className="top">
        <span className="mark">
          <img src="/brand/nils-mark.svg" alt="" width="22" height="22" />
          NILS
        </span>
        {caps.desk.signed_in && <span className="person">{caps.person.display_name}</span>}
      </header>
      {caps.engine?.registry.synthetic && (
        <div className="banner" role="note">
          Made-up data: this registry was built by {caps.engine.registry.synthetic}. Nothing here is a real person or a real scan.
        </div>
      )}
      <main>
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
        {st.kind === "ready" && <Home caps={caps} />}
      </main>
      <footer>
        <span>desk {caps.desk.version}, {caps.desk.mode} mode</span>
        {caps.engine && <span>engine {caps.engine.engine.version}, epoch {caps.engine.registry.epoch}</span>}
        {caps.desk.contract_mismatch && !caps.desk.contract_mismatch.major && <span className="warn">the engine is ahead of this desk</span>}
      </footer>
    </div>
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
