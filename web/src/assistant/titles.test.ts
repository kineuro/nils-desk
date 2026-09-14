// SPDX-License-Identifier: AGPL-3.0-only
// The chat, slice 10: the open conversation takes the name the model gave it,
// once the list of conversations has it.

import { describe, expect, it } from "vitest";
import { type Chat, renamedIn } from "./chats";

const chat = (o: Partial<Chat> = {}): Chat => ({
  id: "c-1",
  station: "concierge",
  title: "How many subjects does each",
  title_by: "words",
  lineage: null,
  document: null,
  created_at: "2026-09-14T08:00:00Z",
  updated_at: "2026-09-14T08:00:00Z",
  pinned: false,
  archived: false,
  forked_from: null,
  ...o,
});

describe("a conversation named by the model", () => {
  it("takes the new name from the list, and nothing when the list says what the page already shows", () => {
    const meta = chat();
    expect(renamedIn(meta, [chat({ title: "Subjects per cohort", title_by: "model" })])).toEqual({ ...meta, title: "Subjects per cohort", title_by: "model" });
    expect(renamedIn(meta, [chat()])).toBeNull();
    expect(renamedIn(meta, [chat({ id: "c-2", title: "Another conversation" })])).toBeNull();
    expect(renamedIn(null, [chat()])).toBeNull();
  });
});
