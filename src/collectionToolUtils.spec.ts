import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  buildCollectionResult,
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

  it("keeps entry shape intact when pagination is requested without projection controls", () => {
    expect(buildCollectionResult({
      entries: [
        { id: "a", visible: "first", internal_note: "keep me" },
        { id: "b", visible: "second", internal_note: "keep me too" },
      ],
      entryKey: "items",
      countKey: "item_count",
      allFields: ["visible"] as const,
      input: {
        limit: 1,
        offset: 1,
      },
    })).toEqual({
      items: [
        { id: "b", visible: "second", internal_note: "keep me too" },
      ],
      item_count: 2,
      returned_count: 1,
      offset: 1,
      limit: 1,
      has_more: false,
    });
  });

  it("returns full entries and counts when no projection or pagination controls are provided", () => {
    expect(buildCollectionResult({
      entries: [
        { id: "a", visible: "first", internal_note: "keep me" },
        { id: "b", visible: "second", internal_note: "keep me too" },
      ],
      entryKey: "items",
      countKey: "item_count",
      allFields: ["visible"] as const,
    })).toEqual({
      items: [
        { id: "a", visible: "first", internal_note: "keep me" },
        { id: "b", visible: "second", internal_note: "keep me too" },
      ],
      item_count: 2,
    });
  });

  it("projects fields without pagination when projection controls are provided", () => {
    expect(buildCollectionResult({
      entries: [
        { id: "a", visible: "first", internal_note: "keep me" },
      ],
      entryKey: "items",
      countKey: "item_count",
      allFields: ["visible"] as const,
      input: {
        fields: ["visible"],
        includeIds: false,
      },
    })).toEqual({
      items: [
        { visible: "first" },
      ],
      item_count: 1,
    });
  });

  it("treats pagination as a pure slice when projection controls are absent", () => {
    fc.assert(fc.property(
      fc.array(
        fc.record({
          id: fc.string(),
          visible: fc.string(),
          internal_note: fc.string(),
        }),
        { maxLength: 8 },
      ),
      fc.integer({ min: -3, max: 10 }),
      fc.integer({ min: -3, max: 10 }),
      (entries, limit, offset) => {
        const normalizedOffset = Math.max(Math.trunc(offset), 0);
        const normalizedLimit = Math.max(Math.trunc(limit), 1);
        const slicedEntries = entries.slice(normalizedOffset, normalizedOffset + normalizedLimit);
        const hasMore = normalizedOffset + slicedEntries.length < entries.length;

        expect(buildCollectionResult({
          entries,
          entryKey: "items",
          countKey: "item_count",
          allFields: ["visible"] as const,
          input: {
            limit,
            offset,
          },
        })).toEqual({
          items: slicedEntries,
          item_count: entries.length,
          returned_count: slicedEntries.length,
          offset: normalizedOffset,
          limit: normalizedLimit,
          has_more: hasMore,
          ...(hasMore
            ? { next_offset: normalizedOffset + slicedEntries.length }
            : {}),
        });
      },
    ));
  });

  it("falls back to default pagination for non-finite inputs", () => {
    expect(paginateEntries(["a", "b", "c"], {
      limit: Number.NaN,
      offset: Number.POSITIVE_INFINITY,
    })).toEqual({
      entries: ["a", "b", "c"],
      metadata: {
        returned_count: 3,
        offset: 0,
        limit: 50,
        has_more: false,
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
