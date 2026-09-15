// SPDX-License-Identifier: AGPL-3.0-only
// What makes an install ready to start. Until it is, Home is the page of these
// steps for a person who may see the install: each worked out from what the
// parts report, whether the desk needs it, and whether what it needs is there.
// Home's steps say the words; this says which of them hold the rest of the
// desk back.

import type { Capabilities } from "../capabilities";
import { may } from "../grants";
import type { Place } from "../objects/client";
import type { Backups } from "../settings/database";
import type { Install } from "../settings/supervise";
import { steps, type Facts, type StepId, type Tag } from "./steps";

export type SetupId = "installed" | "sources" | "backups" | "signin" | "model";

export interface SetupStep {
  id: SetupId;
  title: string;
  /** Needed before the rest of the desk opens; a step that is not waits until there is a moment. */
  required: boolean;
  /** What the step needs is there. */
  met: boolean;
  /** Caution where something is wrong now; neutral where nothing is done yet. */
  tone: "ok" | "caution" | "neutral";
  words: string;
  tags: Tag[];
}

const WEEK = 7 * 24 * 3600 * 1000;
const LOOPBACK = /^[a-z]+:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i;

/** The steps of setup, in order, from what the parts report. */
export function setupSteps(f: Facts, now: number = Date.now()): SetupStep[] {
  const band = steps(f, now);
  const said = (id: StepId) => band.find((s) => s.id === id) ?? null;
  const live = (f.places ?? []).filter((p) => p.retired_at === null);
  const out: SetupStep[] = [{ id: "installed", title: "NILS is installed", required: true, met: true, tone: "ok", words: said("installed")?.words ?? "", tags: [] }];

  const dicom = said("dicom");
  if (dicom) {
    const met = live.some((p) => p.role === "source");
    out.push({ id: "sources", title: "Bring in DICOM", required: true, met, tone: met ? "ok" : "neutral", words: dicom.words, tags: dicom.tags });
  }

  const safe = said("safe");
  if (safe) {
    const registry = live.find((p) => p.role === "registry") ?? null;
    const named = registry?.guarantees?.["backup"];
    const backup = typeof named === "string" ? (live.find((p) => p.name === named && p.role === "backup") ?? null) : null;
    const newest = f.archives?.archives.find((a) => a.ours) ?? null;
    const last = newest?.created_at ?? f.backups?.[0]?.finished_at ?? null;
    const recent = last !== null && now - Date.parse(last) < WEEK;
    const failed = newest?.checked?.ok === false;
    // a person who may not read the schedule sees the backup place, and that is what holds them back
    const scheduled = f.archives ? f.archives.schedule.every !== "off" : null;
    const met = backup !== null && !failed && (scheduled === null || scheduled || recent);
    const wrong = failed || safe.tags.some((t) => t.tone === "caution");
    out.push({ id: "backups", title: "Keep the registry safe", required: true, met, tone: met ? "ok" : wrong ? "caution" : "neutral", words: safe.words, tags: safe.tags });
  }

  const signin = said("signin");
  if (signin) {
    const origin = f.caps.desk.settings?.origin ?? "";
    const met = f.caps.desk.mode !== "off" || origin === "" || LOOPBACK.test(origin);
    out.push({ id: "signin", title: "Decide who signs in", required: true, met, tone: met ? "ok" : "caution", words: signin.words, tags: signin.tags });
  }

  const model = said("model");
  if (model) out.push({ id: "model", title: "A model for the assistant", required: false, met: model.state === "done", tone: model.state === "done" ? "ok" : "neutral", words: model.words, tags: model.tags });
  return out;
}

/** Whether every step the desk needs is done. */
export function minimumMet(all: SetupStep[]): boolean {
  return all.every((s) => !s.required || s.met);
}

/**
 * Whether an install is ready to start, as far as the shell can tell from the
 * places and the backups it keeps: always for a person who may not see the
 * install, and null while the places are not read yet.
 */
export function ready(caps: Capabilities, install: Install | null, places: Place[] | null, archives: Backups | null): boolean | null {
  if (!may(caps, "install:see")) return true;
  if (places === null) return null;
  return minimumMet(setupSteps({ caps, install, places, batches: null, backups: null, archives, purposes: null }));
}

/** How far setup is, in a sentence. */
export function progressWords(all: SetupStep[]): string {
  const needed = all.filter((s) => s.required);
  const done = needed.filter((s) => s.met).length;
  if (done < needed.length) return `${done} of the ${needed.length} steps the desk needs ${done === 1 ? "is" : "are"} done.`;
  const later = all.filter((s) => !s.required && !s.met).length;
  if (later === 0) return "Every step is done.";
  return `Every step the desk needs is done, and ${later === 1 ? "one more is" : `${later} more are`} worth doing.`;
}
