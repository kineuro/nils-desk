// SPDX-License-Identifier: AGPL-3.0-only
// The reads the desk keeps between pages: the places, which Home, Settings'
// Places page and its Database page all read, and the registry's summary,
// whose stack count says whether data is in before setup is done.

import { keeper } from "../ui/kept";
import { objects, type Place, type Summary } from "./client";

export const placesKept = keeper<{ places: Place[]; enforced?: boolean }>(() => objects.places());
export const summaryKept = keeper<Summary>(() => objects.summary());
