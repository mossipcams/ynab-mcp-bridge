import { describe, expect, it } from "vitest";

import {
  hasPaginationControls,
  paginateEntries,
  projectRecord,
} from "./tools/collectionToolUtils.js";

describe("collection tool helpers", () => {
  it("falls back to safe pagination defaults when limit or offset are not finite", () => {
    expect(paginateEntries(["a", "b", "c"], {
      limit: Number.NaN,
      offset: Number.NaN,
    })).toEqual({
      entries: ["a", "b", "c"],
      metadata: {
        has_more: false,
        limit: 50,
        offset: 0,
        returned_count: 3,
      },
    });
  });

  it("treats empty field selections as a request for the default projection", () => {
    expect(projectRecord({
      id: "acct-1",
      name: "Checking",
      type: "checking",
    }, ["name", "type"], {
      fields: [],
      includeIds: false,
    })).toEqual({
      name: "Checking",
      type: "checking",
    });
  });

  it("detects pagination controls only when a numeric control is actually present", () => {
    expect(hasPaginationControls({})).toBe(false);
    expect(hasPaginationControls({
      limit: undefined,
      offset: undefined,
    })).toBe(false);
  });
});
