// SPDX-License-Identifier: AGPL-3.0-only
// Headless station runs through the desk's proxy (Wave 4c sections 9.13
// and 9.14): the keyword tab and the anonymisation page start a run, poll
// it, and render its verdict from the assistant's store. The desk holds
// no opinion of its own about what the station found.

import type { Capabilities } from "../capabilities";

const H = { "content-type": "application/json", "X-Nils-Desk": "1" };

export interface StationRun {
  run: string;
  conversation: string;
  state: "queued" | "running" | "settled" | "failed" | "aborted";
  reply?: { text?: string; metadata?: { terminal?: string } } | null;
  error?: string | null;
}

export interface Verdict {
  station: string;
  terminal: string;
  result: Record<string, unknown>;
  checks: { name: string; passed: boolean; why: string | null }[];
  proposals: { kind: string; ref: Record<string, unknown>; sentence: string }[];
}

async function fail(r: Response): Promise<never> {
  const text = await r.text();
  try {
    const j = JSON.parse(text) as { error?: unknown };
    if (typeof j.error === "string") throw new Error(j.error);
  } catch (e) {
    if (e instanceof Error && e.message !== text) throw e;
  }
  throw new Error(`the assistant answered ${r.status}`);
}

/** The stations the assistant serves, by id, from the capabilities document. */
export function stationsServed(caps: Capabilities): string[] {
  const list = (caps.assistant?.["stations"] as { id?: string }[] | undefined) ?? [];
  return list.flatMap((s) => (typeof s.id === "string" ? [s.id] : []));
}

export const stations = {
  async start(station: string, message: string): Promise<StationRun> {
    const r = await fetch(`/assistant/stations/${encodeURIComponent(station)}/runs`, { method: "POST", headers: H, body: JSON.stringify({ message }) });
    if (!r.ok) await fail(r);
    return (await r.json()) as StationRun;
  },
  async run(id: string): Promise<StationRun> {
    const r = await fetch(`/assistant/runs/${encodeURIComponent(id)}`);
    if (!r.ok) await fail(r);
    return (await r.json()) as StationRun;
  },
  async verdict(id: string): Promise<Verdict | null> {
    const r = await fetch(`/assistant/runs/${encodeURIComponent(id)}/verdict`);
    if (r.status === 404) return null;
    if (!r.ok) await fail(r);
    return (await r.json()) as Verdict;
  },
  /** Start a run and follow it to its end; the callback sees every state. */
  async follow(station: string, message: string, onState: (r: StationRun) => void, everyMs = 4000): Promise<{ run: StationRun; verdict: Verdict | null }> {
    let run = await this.start(station, message);
    onState(run);
    while (run.state === "queued" || run.state === "running") {
      await new Promise((r) => setTimeout(r, everyMs));
      run = await this.run(run.run);
      onState(run);
    }
    return { run, verdict: await this.verdict(run.run) };
  },
};

/** The station the desk speaks to: the concierge when the assistant serves one, else ask-help (Wave 4c section 9.12). */
export function stationOf(caps: Capabilities): string {
  const list = (caps.assistant?.["stations"] as { id?: string }[] | undefined) ?? [];
  return list.some((s) => s.id === "concierge") ? "concierge" : "ask-help";
}
