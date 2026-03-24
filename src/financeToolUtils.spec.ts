import { describe, expect, it } from "vitest";

import {
  buildAssignedSpentSummary,
  buildAllocationBreakdown,
  buildUpcomingWindowSummary,
  compactObject,
  formatMilliunits,
  listMonthsInRange,
  toTopRollups,
  toSpentMilliunits,
} from "./tools/financeToolUtils.js";

describe("finance tool utils", () => {
  it("formats milliunits as decimal currency strings", () => {
    expect(formatMilliunits(125000)).toBe("125.00");
    expect(formatMilliunits(-9876)).toBe("-9.88");
  });

  it("builds assigned vs spent summaries", () => {
    expect(buildAssignedSpentSummary(250000, 175000)).toEqual({
      assigned: "250.00",
      spent: "175.00",
      assigned_vs_spent: "75.00",
    });
  });

  it("treats positive activity as non-spending for spend-style summaries", () => {
    expect(toSpentMilliunits(-125000)).toBe(125000);
    expect(toSpentMilliunits(125000)).toBe(0);
  });

  it("sorts and limits top rollups while removing empty fields", () => {
    expect(
      toTopRollups(
        [
          { id: "cat-1", name: "Dining Out", amountMilliunits: 82000, transactionCount: 4 },
          { id: "cat-2", name: "Rent", amountMilliunits: 240000, transactionCount: 1 },
          { id: "cat-3", name: "Coffee", amountMilliunits: 24000 },
        ],
        2,
      ),
    ).toEqual([
      {
        id: "cat-2",
        name: "Rent",
        amount: "240.00",
        transaction_count: 1,
      },
      {
        id: "cat-1",
        name: "Dining Out",
        amount: "82.00",
        transaction_count: 4,
      },
    ]);
  });

  it("omits undefined, null, and empty arrays from compact objects", () => {
    expect(
      compactObject({
        name: "snapshot",
        note: undefined,
        debt: null,
        top_categories: [],
        account_count: 3,
      }),
    ).toEqual({
      name: "snapshot",
      account_count: 3,
    });
  });

  it("lists months across an inclusive month range", () => {
    expect(listMonthsInRange("2026-02-01", "2026-04-01")).toEqual([
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
  });

  it("builds allocation breakdowns with target variance", () => {
    expect(buildAllocationBreakdown(560000, 800000, 70)).toEqual({
      amount: "560.00",
      actual_percent: "70.00",
      target_percent: "70.00",
      variance_percent: "0.00",
    });
  });

  it("summarizes upcoming windows with compact money fields", () => {
    expect(buildUpcomingWindowSummary(185000, -240000)).toEqual({
      upcoming_inflows: "185.00",
      upcoming_outflows: "240.00",
      net_upcoming: "-55.00",
    });
  });
});
