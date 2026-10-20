import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensurePeople, forgetRefusal, namer } from "./who";

let asked: string[] = [];
const real = globalThis.fetch;
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  asked = [];
  forgetRefusal();
});
afterEach(() => {
  globalThis.fetch = real;
});

describe("the directory of people is asked once, and a refusal is remembered (review fix 4)", () => {
  it("does not ask again after a 403 or a 404", async () => {
    for (const status of [403, 404]) {
      forgetRefusal();
      asked = [];
      globalThis.fetch = ((input: RequestInfo | URL) => {
        asked.push(String(input));
        return Promise.resolve(new Response(JSON.stringify({ error: "no" }), { status }));
      }) as typeof fetch;
      ensurePeople();
      await settle();
      ensurePeople();
      ensurePeople();
      await settle();
      expect(asked).toEqual(["/desk/people"]);
    }
  });
  it("asks again after a failure that is not a refusal, and names fall back to the principal or a person", async () => {
    globalThis.fetch = ((input: RequestInfo | URL) => {
      asked.push(String(input));
      return Promise.resolve(new Response("{}", { status: 500 }));
    }) as typeof fetch;
    ensurePeople();
    await settle();
    ensurePeople();
    await settle();
    expect(asked.length).toBe(2);
    const name = namer({ person: undefined } as never, null);
    expect(name("astrid@site")).toBe("astrid@site");
    expect(name("0123456789abcdef0123")).toBe("a person");
    expect(namer({ person: undefined } as never, [{ subject: "astrid@site", display: "Astrid" }])("person:astrid@site")).toBe("Astrid");
  });
});
