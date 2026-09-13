// SPDX-License-Identifier: AGPL-3.0-only
// The reads the desk keeps between pages: the places, which Home, Settings'
// Places page and its Database page all read.

import { keeper } from "../ui/kept";
import { objects, type Place } from "./client";

export const placesKept = keeper<{ places: Place[]; enforced?: boolean }>(() => objects.places());
