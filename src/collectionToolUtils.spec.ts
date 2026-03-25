import { describe, expect, it } from "vitest";

import { buildCollectionResult } from "./tools/collectionToolUtils.js";

describe("collectionToolUtils", () => {
  const fields = ["name", "balance"] as const;
  const entries = [
    { id: "acct-1", name: "Checking", balance: "125.00", closed: false },
    { id: "acct-2", name: "Savings", balance: "500.00", closed: false },
  ];

  it("returns the full collection when there are no pagination or projection controls", () => {
    expect(buildCollectionResult({
      entries,
      entryKey: "accounts",
      countKey: "account_count",
      allFields: fields,
      input: {},
    })).toEqual({
      accounts: entries,
      account_count: 2,
    });
  });

  it("projects the collection without pagination metadata when only projection controls are provided", () => {
    expect(buildCollectionResult({
      entries,
      entryKey: "accounts",
      countKey: "account_count",
      allFields: fields,
      input: { includeIds: false, fields: ["name"] },
    })).toEqual({
      accounts: [
        { name: "Checking" },
        { name: "Savings" },
      ],
      account_count: 2,
    });
  });

  it("projects paginated entries and appends pagination metadata when pagination controls are provided", () => {
    expect(buildCollectionResult({
      entries,
      entryKey: "accounts",
      countKey: "account_count",
      allFields: fields,
      input: { includeIds: false, fields: ["name"], limit: 1, offset: 1 },
    })).toEqual({
      accounts: [
        { name: "Savings" },
      ],
      account_count: 2,
      returned_count: 1,
      offset: 1,
      limit: 1,
      has_more: false,
    });
  });
});
