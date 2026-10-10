// SPDX-License-Identifier: AGPL-3.0-only
// A fake assistant for the checks that follow a turn as it runs (leaving,
// running and the query card's discussion): one conversation whose stream
// grows when a test writes to it, whose long poll waits, as the runtime's
// does, until there is something new or the page lets it go, and whose
// history is what the test says the runtime keeps. Every number is made up.

import { vi } from "vitest";
import { INBOX } from "./onechat.fixture";
import type { Chunk, History } from "./parts";

export interface FakeChat {
  id: string;
  station: string;
  title: string;
  title_by: "words" | "model" | "person";
  document?: number | null;
}

export interface Call {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

/** A conversation as the assistant lists it. */
export const listed = (c: FakeChat) => ({
  lineage: null,
  document: null,
  created_at: "2026-10-09T19:07:29Z",
  updated_at: "2026-10-09T19:07:29Z",
  pinned: false,
  archived: false,
  forked_from: null,
  shared: false,
  ...c,
});

/**
 * The fake assistant, keeping every call. `named` is the name the model gives
 * the conversation when asked; without one the naming fails. `engine` answers
 * the doors the assistant does not.
 */
export function fakeAssistant(o: { chat: FakeChat; named?: string; engine?: (c: Call, nth: number) => { status: number; body: unknown } | undefined }) {
  let chat = listed(o.chat);
  const calls: Call[] = [];
  const stream: Chunk[] = [];
  let history: History | null = null;
  const waiting = new Set<() => void>();
  const answer = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
  const aborted = () => new DOMException("The page let it go", "AbortError");
  const one = `/assistant/conversations/${chat.id}`;
  const agent = `/assistant/agents/${chat.station}/${chat.id}`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: Call = { method: init?.method ?? "GET", url: String(input), body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null };
      calls.push(call);
      const u = new URL(call.url, "http://desk");
      const at = (path: string) => u.pathname === path;
      if (at("/assistant/conversations")) return answer(call.method === "POST" ? chat : { conversations: [chat], next: null });
      if (at(one)) return answer({ ...chat, proposals: [] });
      if (at(`${one}/title`)) {
        if (!o.named) return answer({ error: "the model did not answer" }, 502);
        chat = { ...chat, title: o.named, title_by: "model" };
        return answer(chat);
      }
      if (at(`/desk/assistant/conversations/${chat.id}/token`)) return answer({});
      if (at("/assistant/inbox")) return answer(INBOX);
      if (at(agent) && call.method === "POST") return answer({ submissionId: "sub_1" }, 202, { "Stream-Next-Offset": String(stream.length - 1) });
      if (at(agent) && u.searchParams.get("view") === "history") return history ? answer(history, 200, { "Stream-Next-Offset": history.offset ?? "-1" }) : answer({ error: "no stream" }, 404);
      if (at(agent) && u.searchParams.get("live") === "long-poll") {
        const from = Number(u.searchParams.get("offset"));
        // the long poll waits for what comes after its offset, or until the page lets it go
        while (stream.length - 1 <= from) {
          if (init?.signal?.aborted) throw aborted();
          await new Promise<void>((wake, fail) => {
            const woken = () => {
              waiting.delete(woken);
              wake();
            };
            waiting.add(woken);
            init?.signal?.addEventListener(
              "abort",
              () => {
                waiting.delete(woken);
                fail(aborted());
              },
              { once: true },
            );
          });
        }
        return answer(stream.slice(from + 1), 200, { "Stream-Next-Offset": String(stream.length - 1) });
      }
      // the stream as server-sent events is not served here, so a page long-polls
      if (at(agent)) return answer({ error: "no events here" }, 404);
      const nth = calls.filter((c) => c.method === call.method && c.url === call.url).length;
      const a = o.engine?.(call, nth);
      return a ? answer(a.body, a.status) : answer({ error: `no door ${call.method} ${u.pathname}` }, 404);
    }),
  );
  return {
    calls,
    of: (method: string, url: string) => calls.filter((c) => c.method === method && c.url === url),
    /** What the runtime writes next; every long poll waiting is answered. */
    write(...chunks: Chunk[]) {
      stream.push(...chunks);
      for (const wake of [...waiting]) wake();
    },
    /** The history the runtime serves from now on, at the stream's offset. */
    keep(messages: History["messages"], settlements: NonNullable<History["settlements"]> = []) {
      history = { offset: String(stream.length - 1), messages, settlements };
    },
    /** How many long polls are open now. */
    open: () => waiting.size,
  };
}
