// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from "vitest";
import { ask, chain, DoorError, runOnce, type DocumentHandle, type Options, type Run } from "./client";
import applied from "../../test/fixtures/apply.json";
import stale from "../../test/fixtures/apply_stale.json";
import child from "../../test/fixtures/documents_get_child.json";
import root from "../../test/fixtures/documents_get.json";
import options from "../../test/fixtures/options.json";
import run from "../../test/fixtures/run.json";

type Answer = { status: number; body: unknown };
function fakeFetch(route: (method: string, path: string, body: unknown) => Answer) {
  const calls: { method: string; path: string; body: unknown; headers: Record<string, string> }[] = [];
  const f = vi.fn(async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ method: init?.method ?? "GET", path, body, headers });
    const a = route(init?.method ?? "GET", path, body);
    return { ok: a.status < 400, status: a.status, text: async () => JSON.stringify(a.body) } as Response;
  });
  vi.stubGlobal("fetch", f);
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("the ask client", () => {
  it("sends every write with the desk header and the options token, and names a stale token", async () => {
    const calls = fakeFetch((_m, p) => (p === "/api/ask/apply" ? { status: 409, body: stale } : { status: 200, body: {} }));
    const o = options as unknown as Options;
    let err: unknown;
    try {
      await ask.apply(1, o, "scope", [{ move_id: 1, args: { field: "name", op: "not_null" } }]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DoorError);
    expect((err as DoorError).stale).toBe(true);
    expect(calls[0].headers["X-Nils-Desk"]).toBe("1");
    expect(calls[0].body).toEqual({ document_id: 1, epoch: o.epoch, token: o.token, set: "scope", moves: [{ move_id: 1, args: { field: "name", op: "not_null" } }] });
  });
  it("an applied move answers the child, its parent and fresh options", async () => {
    fakeFetch(() => ({ status: 200, body: applied }));
    const a = await ask.apply(1, options as unknown as Options, "scope", []);
    expect(a.document).toBe(2);
    expect(a.parent).toBe(1);
    expect(a.options.token).not.toBe((options as unknown as Options).token);
  });
  it("walks the version chain oldest first from the engine's parent links", async () => {
    const byId: Record<string, unknown> = { "1": root, "2": child };
    fakeFetch((_m, p) => ({ status: 200, body: byId[p.split("/").pop()!] }));
    const list = await chain(2);
    expect(list.map((d) => d.document)).toEqual([1, 2]);
    expect(list.map((d) => d.parent)).toEqual([null, 1]);
    expect((list[1] as DocumentHandle).principal).toBe(root.principal);
  });
  it("presenting a result twice executes the query once", async () => {
    const calls = fakeFetch(() => ({ status: 200, body: run }));
    const [a, b] = await Promise.all([runOnce(41, 7), runOnce(41, 7)]);
    const c = await runOnce(41, 7);
    expect(calls.filter((x) => x.path === "/api/ask/run")).toHaveLength(1);
    expect(a.handle).toBe((run as Run).handle);
    expect(b).toBe(a);
    expect(c).toBe(a);
    // another epoch is another run
    await runOnce(41, 8);
    expect(calls.filter((x) => x.path === "/api/ask/run")).toHaveLength(2);
  });
  it("a failed run is not remembered", async () => {
    let n = 0;
    const calls = fakeFetch(() => (n++ === 0 ? { status: 500, body: { error: "the reader is closed" } } : { status: 200, body: run }));
    await expect(runOnce(50, 1)).rejects.toThrow("the reader is closed");
    await expect(runOnce(50, 1)).resolves.toBeTruthy();
    expect(calls).toHaveLength(2);
  });
});
