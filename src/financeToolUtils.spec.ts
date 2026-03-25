import { describe, expect, it } from "vitest";

import {
  buildAssignedSpentSummary,
  buildAllocationBreakdown,
  buildBudgetHealthMonthSummary,
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

  it("builds shared budget-health month metrics from visible categories", () => {
    expect(buildBudgetHealthMonthSummary({
      budgeted: 355000,
      activity: -318000,
      to_be_budgeted: 25000,
      categories: [
        {
          id: "cat-1",
          name: "Dining Out",
          category_group_name: "Lifestyle",
          hidden: false,
          deleted: false,
          balance: -20000,
          goal_under_funded: 0,
        },
        {
          id: "cat-2",
          name: "Emergency Fund",
          category_group_name: "Savings",
          hidden: false,
          deleted: false,
          balance: 30000,
          goal_under_funded: 120000,
        },
        {
          id: "cat-3",
          name: "Travel",
          category_group_name: "Savings",
          hidden: false,
          deleted: false,
          balance: 30000,
          goal_under_funded: 60000,
        },
        {
          id: "cat-hidden",
          name: "Hidden",
          category_group_name: "Ignored",
          hidden: true,
          deleted: false,
          balance: -99999,
          goal_under_funded: 99999,
        },
      ],
    })).toEqual({
      ready_to_assign: "25.00",
      available_total: "60.00",
      overspent_total: "20.00",
      underfunded_total: "180.00",
      assigned: "355.00",
      spent: "318.00",
      assigned_vs_spent: "37.00",
      overspent_category_count: 1,
      underfunded_category_count: 2,
      overspent_categories: [
        {
          id: "cat-1",
          name: "Dining Out",
          categoryGroupName: "Lifestyle",
          amountMilliunits: 20000,
        },
      ],
      underfunded_categories: [
        {
          id: "cat-2",
          name: "Emergency Fund",
          categoryGroupName: "Savings",
          amountMilliunits: 120000,
        },
        {
          id: "cat-3",
          name: "Travel",
          categoryGroupName: "Savings",
          amountMilliunits: 60000,
        },
      ],
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
