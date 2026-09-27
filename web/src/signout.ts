// SPDX-License-Identifier: AGPL-3.0-only
// Signing out of the desk, and signing in as someone else. The desk ends its
// own session; where people sign in at an identity provider, its answer names
// the provider's end-session page, and the browser goes there so the
// provider's session ends too and the next sign-in asks who it is.

/** Where the browser goes after the desk's logout answered: the provider's end-session page, or the desk's front page. */
export function afterSignOut(status: number, body: unknown): string {
  const then = status === 200 && body && typeof body === "object" ? (body as { then?: unknown }).then : undefined;
  return typeof then === "string" && /^https?:\/\//.test(then) ? then : "/";
}

/** End the desk's session, then go where its answer says. */
export async function signOut(go: (url: string) => void = (u) => location.assign(u), post: typeof fetch = fetch): Promise<void> {
  const r = await post("/desk/logout", { method: "POST", headers: { "X-Nils-Desk": "1" } });
  if (r.status !== 200 && r.status !== 204) throw new Error(`the desk answered ${r.status}`);
  const body = r.status === 200 ? await r.json().catch(() => null) : null;
  go(afterSignOut(r.status, body));
}

/** Sign in as someone else: the desk's session ends and the provider is asked to sign in afresh, so a person can pick the account. */
export async function signInAsSomeoneElse(choose: string, go: (url: string) => void = (u) => location.assign(u), post: typeof fetch = fetch): Promise<void> {
  const r = await post("/desk/logout", { method: "POST", headers: { "X-Nils-Desk": "1" } });
  if (r.status !== 200 && r.status !== 204) throw new Error(`the desk answered ${r.status}`);
  go(choose);
}
