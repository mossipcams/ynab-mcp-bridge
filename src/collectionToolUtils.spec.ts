import { describe, expect, it } from "vitest";

import {
  hasPaginationControls,
  hasProjectionControls,
  paginateEntries,
  projectRecord,
} from "./tools/collectionToolUtils.js";

describe("collection tool utils", () => {
  it("projects requested fields and omits ids when requested", () => {
    const entry = {
      id: "txn-1",
      amount: "12.34",
      date: "2026-03-01",
      payee_name: "Coffee Shop",
    };

    expect(projectRecord(entry, ["date", "amount", "payee_name"] as const, {
      fields: ["amount", "payee_name"],
      includeIds: false,
    })).toEqual({
      amount: "12.34",
      payee_name: "Coffee Shop",
    });
  });

  it("paginates entries with stable metadata", () => {
    expect(paginateEntries(["a", "b", "c", "d"], {
      limit: 2,
      offset: 1,
    })).toEqual({
      entries: ["b", "c"],
      metadata: {
        returned_count: 2,
        offset: 1,
        limit: 2,
        has_more: true,
        next_offset: 3,
      },
    });
  });

  it("detects whether projection or pagination controls were provided", () => {
    expect(hasProjectionControls({})).toBe(false);
    expect(hasProjectionControls({ fields: ["date"] })).toBe(true);
    expect(hasProjectionControls({ includeIds: false })).toBe(true);
    expect(hasPaginationControls({})).toBe(false);
    expect(hasPaginationControls({ limit: 10 })).toBe(true);
    expect(hasPaginationControls({ offset: 5 })).toBe(true);
  });
});
