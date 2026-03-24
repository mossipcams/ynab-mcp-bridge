import { describe, expect, it, vi } from "vitest";

import * as GetBudgetCleanupSummaryTool from "./tools/GetBudgetCleanupSummaryTool.js";
import * as GetCategoryTrendSummaryTool from "./tools/GetCategoryTrendSummaryTool.js";
import * as GetGoalProgressSummaryTool from "./tools/GetGoalProgressSummaryTool.js";
import * as GetIncomeSummaryTool from "./tools/GetIncomeSummaryTool.js";
import * as GetUpcomingObligationsTool from "./tools/GetUpcomingObligationsTool.js";

function parseText(result: Awaited<ReturnType<typeof GetUpcomingObligationsTool.execute>>) {
  return JSON.parse(result.content[0].text);
}

describe("advanced finance tools", () => {
  it("builds compact upcoming obligation windows from scheduled transactions", async () => {
    const api = {
      scheduledTransactions: {
        getScheduledTransactions: vi.fn().mockResolvedValue({
          data: {
            scheduled_transactions: [
              {
                id: "sched-1",
                date_next: "2026-03-18",
                amount: -180000,
                deleted: false,
                payee_name: "Landlord",
                category_name: "Rent",
                account_name: "Checking",
              },
              {
                id: "sched-2",
                date_next: "2026-03-20",
                amount: -45000,
                deleted: false,
                payee_name: "Electric Co",
                category_name: "Utilities",
                account_name: "Checking",
              },
              {
                id: "sched-3",
                date_next: "2026-03-25",
                amount: 250000,
                deleted: false,
                payee_name: "Employer",
                category_name: "Inflow: Ready to Assign",
                account_name: "Checking",
              },
              {
                id: "sched-4",
                date_next: "2026-04-02",
                amount: -12000,
                deleted: false,
                payee_name: "Streaming",
                category_name: "Subscriptions",
                account_name: "Credit Card",
              },
              {
                id: "sched-5",
                date_next: "2026-04-20",
                amount: -7000,
                deleted: false,
                payee_name: "App Store",
                category_name: "Subscriptions",
                account_name: "Credit Card",
              },
            ],
          },
        }),
      },
    };

    const result = await GetUpcomingObligationsTool.execute(
      { planId: "plan-1", asOfDate: "2026-03-16", topN: 3 },
      api as any,
    );

    expect(api.scheduledTransactions.getScheduledTransactions).toHaveBeenCalledWith("plan-1", undefined);
    expect(parseText(result)).toEqual({
      as_of_date: "2026-03-16",
      obligation_count: 4,
      windows: {
        "7d": {
          upcoming_inflows: "0.00",
          upcoming_outflows: "225.00",
          net_upcoming: "-225.00",
          obligation_count: 2,
        },
        "14d": {
          upcoming_inflows: "250.00",
          upcoming_outflows: "225.00",
          net_upcoming: "25.00",
          obligation_count: 3,
        },
        "30d": {
          upcoming_inflows: "250.00",
          upcoming_outflows: "237.00",
          net_upcoming: "13.00",
          obligation_count: 4,
        },
      },
      top_due: [
        {
          id: "sched-1",
          date_next: "2026-03-18",
          payee_name: "Landlord",
          category_name: "Rent",
          account_name: "Checking",
          amount: "180.00",
          type: "outflow",
        },
        {
          id: "sched-2",
          date_next: "2026-03-20",
          payee_name: "Electric Co",
          category_name: "Utilities",
          account_name: "Checking",
          amount: "45.00",
          type: "outflow",
        },
        {
          id: "sched-3",
          date_next: "2026-03-25",
          payee_name: "Employer",
          category_name: "Inflow: Ready to Assign",
          account_name: "Checking",
          amount: "250.00",
          type: "inflow",
        },
      ],
    });
  });

  it("builds a compact goal progress summary for a month", async () => {
    const api = {
      months: {
        getPlanMonth: vi.fn().mockResolvedValue({
          data: {
            month: {
              month: "2026-03-01",
              deleted: false,
              categories: [
                {
                  id: "cat-1",
                  name: "Emergency Fund",
                  deleted: false,
                  hidden: false,
                  goal_type: "TB",
                  goal_target: 500000,
                  goal_under_funded: 120000,
                  goal_percentage_complete: 76,
                  goal_months_to_budget: 4,
                },
                {
                  id: "cat-2",
                  name: "Vacation",
                  deleted: false,
                  hidden: false,
                  goal_type: "MF",
                  goal_target: 180000,
                  goal_under_funded: 45000,
                  goal_percentage_complete: 50,
                  goal_months_to_budget: 2,
                },
                {
                  id: "cat-3",
                  name: "Car Insurance",
                  deleted: false,
                  hidden: false,
                  goal_type: "NEED",
                  goal_target: 90000,
                  goal_under_funded: 0,
                  goal_percentage_complete: 100,
                  goal_months_to_budget: 1,
                },
                {
                  id: "cat-4",
                  name: "Fun Money",
                  deleted: false,
                  hidden: false,
                  goal_type: null,
                  goal_under_funded: 0,
                },
              ],
            },
          },
        }),
      },
    };

    const result = await GetGoalProgressSummaryTool.execute(
      { planId: "plan-1", month: "2026-03-01", topN: 2 },
      api as any,
    );

    expect(api.months.getPlanMonth).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(parseText(result as any)).toEqual({
      month: "2026-03-01",
      goal_count: 3,
      underfunded_total: "165.00",
      on_track_count: 1,
      off_track_count: 2,
      top_underfunded_goals: [
        {
          id: "cat-1",
          name: "Emergency Fund",
          amount: "120.00",
          goal_target: "500.00",
          goal_percentage_complete: 76,
          goal_months_to_budget: 4,
        },
        {
          id: "cat-2",
          name: "Vacation",
          amount: "45.00",
          goal_target: "180.00",
          goal_percentage_complete: 50,
          goal_months_to_budget: 2,
        },
      ],
    });
  });

  it("builds a compact budget cleanup summary for a month", async () => {
    const api = {
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              {
                id: "tx-1",
                date: "2026-03-02",
                amount: -20000,
                deleted: false,
                approved: false,
                cleared: "uncleared",
                category_id: null,
                category_name: null,
                payee_name: "Unknown Store",
                account_name: "Checking",
              },
              {
                id: "tx-2",
                date: "2026-03-03",
                amount: -45000,
                deleted: false,
                approved: true,
                cleared: "uncleared",
                category_id: "cat-1",
                category_name: "Dining Out",
                payee_name: "Restaurant",
                account_name: "Checking",
              },
              {
                id: "tx-3",
                date: "2026-03-10",
                amount: -15000,
                deleted: false,
                approved: false,
                cleared: "cleared",
                category_id: "cat-2",
                category_name: "Fuel",
                payee_name: "Gas Station",
                account_name: "Checking",
              },
            ],
          },
        }),
      },
      months: {
        getPlanMonth: vi.fn().mockResolvedValue({
          data: {
            month: {
              month: "2026-03-01",
              deleted: false,
              categories: [
                {
                  id: "cat-1",
                  name: "Dining Out",
                  hidden: false,
                  deleted: false,
                  balance: -12000,
                  goal_under_funded: 0,
                },
                {
                  id: "cat-2",
                  name: "Fuel",
                  hidden: true,
                  deleted: false,
                  balance: -5000,
                  goal_under_funded: 10000,
                },
                {
                  id: "cat-3",
                  name: "Groceries",
                  hidden: false,
                  deleted: false,
                  balance: 20000,
                  goal_under_funded: 0,
                },
              ],
            },
          },
        }),
      },
    };

    const result = await GetBudgetCleanupSummaryTool.execute(
      { planId: "plan-1", month: "2026-03-01", topN: 2 },
      api as any,
    );

    expect(api.transactions.getTransactions).toHaveBeenCalledWith("plan-1", "2026-03-01", undefined, undefined);
    expect(api.months.getPlanMonth).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(parseText(result as any)).toEqual({
      month: "2026-03-01",
      uncategorized_transaction_count: 1,
      unapproved_transaction_count: 2,
      uncleared_transaction_count: 2,
      overspent_category_count: 2,
      hidden_problem_category_count: 1,
      top_uncategorized_transactions: [
        {
          id: "tx-1",
          date: "2026-03-02",
          payee_name: "Unknown Store",
          account_name: "Checking",
          amount: "20.00",
        },
      ],
      top_unapproved_transactions: [
        {
          id: "tx-1",
          date: "2026-03-02",
          payee_name: "Unknown Store",
          amount: "20.00",
        },
        {
          id: "tx-3",
          date: "2026-03-10",
          payee_name: "Gas Station",
          amount: "15.00",
        },
      ],
      top_overspent_categories: [
        {
          id: "cat-1",
          name: "Dining Out",
          amount: "12.00",
        },
        {
          id: "cat-2",
          name: "Fuel",
          amount: "5.00",
        },
      ],
    });
  });

  it("limits budget cleanup transaction counts to the requested month", async () => {
    const api = {
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              {
                id: "tx-1",
                date: "2026-03-02",
                amount: -20000,
                deleted: false,
                approved: false,
                cleared: "uncleared",
                category_id: null,
                payee_name: "Unknown Store",
                account_name: "Checking",
              },
              {
                id: "tx-2",
                date: "2026-04-02",
                amount: -45000,
                deleted: false,
                approved: false,
                cleared: "uncleared",
                category_id: null,
                payee_name: "April Store",
                account_name: "Checking",
              },
            ],
          },
        }),
      },
      months: {
        getPlanMonth: vi.fn().mockResolvedValue({
          data: {
            month: {
              month: "2026-03-01",
              deleted: false,
              categories: [
                {
                  id: "cat-1",
                  name: "Dining Out",
                  hidden: false,
                  deleted: false,
                  balance: -12000,
                  goal_under_funded: 0,
                },
              ],
            },
          },
        }),
      },
    };

    const result = await GetBudgetCleanupSummaryTool.execute(
      { planId: "plan-1", month: "2026-03-01", topN: 5 },
      api as any,
    );

    expect(parseText(result as any)).toEqual({
      month: "2026-03-01",
      uncategorized_transaction_count: 1,
      unapproved_transaction_count: 1,
      uncleared_transaction_count: 1,
      overspent_category_count: 1,
      hidden_problem_category_count: 0,
      top_uncategorized_transactions: [
        {
          id: "tx-1",
          date: "2026-03-02",
          payee_name: "Unknown Store",
          account_name: "Checking",
          amount: "20.00",
        },
      ],
      top_unapproved_transactions: [
        {
          id: "tx-1",
          date: "2026-03-02",
          payee_name: "Unknown Store",
          amount: "20.00",
        },
      ],
      top_overspent_categories: [
        {
          id: "cat-1",
          name: "Dining Out",
          amount: "12.00",
        },
      ],
    });
  });

  it("builds a compact income summary across a month range", async () => {
    const api = {
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              {
                id: "tx-1",
                date: "2026-01-05",
                amount: 300000,
                deleted: false,
                transfer_account_id: null,
                payee_id: "payee-1",
                payee_name: "Employer",
              },
              {
                id: "tx-2",
                date: "2026-02-05",
                amount: 500000,
                deleted: false,
                transfer_account_id: null,
                payee_id: "payee-1",
                payee_name: "Employer",
              },
              {
                id: "tx-3",
                date: "2026-03-03",
                amount: 300000,
                deleted: false,
                transfer_account_id: null,
                payee_id: "payee-1",
                payee_name: "Employer",
              },
              {
                id: "tx-4",
                date: "2026-03-10",
                amount: 100000,
                deleted: false,
                transfer_account_id: null,
                payee_id: "payee-2",
                payee_name: "Freelance Client",
              },
              {
                id: "tx-5",
                date: "2026-03-15",
                amount: -50000,
                deleted: false,
                transfer_account_id: null,
                payee_id: "payee-3",
                payee_name: "Grocer",
              },
            ],
          },
        }),
      },
    };

    const result = await GetIncomeSummaryTool.execute(
      { planId: "plan-1", fromMonth: "2026-01-01", toMonth: "2026-03-01", topN: 2 },
      api as any,
    );

    expect(api.transactions.getTransactions).toHaveBeenCalledWith("plan-1", "2026-01-01", undefined, undefined);
    expect(parseText(result as any)).toEqual({
      from_month: "2026-01-01",
      to_month: "2026-03-01",
      income_total: "1200.00",
      average_monthly_income: "400.00",
      median_monthly_income: "400.00",
      income_month_count: 3,
      volatility_percent: "50.00",
      top_income_sources: [
        {
          id: "payee-1",
          name: "Employer",
          amount: "1100.00",
          transaction_count: 3,
        },
        {
          id: "payee-2",
          name: "Freelance Client",
          amount: "100.00",
          transaction_count: 1,
        },
      ],
      months: [
        {
          month: "2026-01-01",
          income: "300.00",
        },
        {
          month: "2026-02-01",
          income: "500.00",
        },
        {
          month: "2026-03-01",
          income: "400.00",
        },
      ],
    });
  });

  it("builds a compact category group trend summary across months", async () => {
    const api = {
      months: {
        getPlanMonth: vi
          .fn()
          .mockResolvedValueOnce({
            data: {
              month: {
                month: "2026-01-01",
                deleted: false,
                categories: [
                  {
                    id: "cat-1",
                    name: "Groceries",
                    category_group_name: "Living",
                    deleted: false,
                    hidden: false,
                    budgeted: 150000,
                    activity: -140000,
                    balance: 10000,
                  },
                  {
                    id: "cat-2",
                    name: "Rent",
                    category_group_name: "Living",
                    deleted: false,
                    hidden: false,
                    budgeted: 220000,
                    activity: -220000,
                    balance: 0,
                  },
                ],
              },
            },
          })
          .mockResolvedValueOnce({
            data: {
              month: {
                month: "2026-02-01",
                deleted: false,
                categories: [
                  {
                    id: "cat-1",
                    name: "Groceries",
                    category_group_name: "Living",
                    deleted: false,
                    hidden: false,
                    budgeted: 165000,
                    activity: -150000,
                    balance: 15000,
                  },
                  {
                    id: "cat-2",
                    name: "Rent",
                    category_group_name: "Living",
                    deleted: false,
                    hidden: false,
                    budgeted: 220000,
                    activity: -220000,
                    balance: 0,
                  },
                ],
              },
            },
          })
          .mockResolvedValueOnce({
            data: {
              month: {
                month: "2026-03-01",
                deleted: false,
                categories: [
                  {
                    id: "cat-1",
                    name: "Groceries",
                    category_group_name: "Living",
                    deleted: false,
                    hidden: false,
                    budgeted: 140000,
                    activity: -120000,
                    balance: 20000,
                  },
                  {
                    id: "cat-2",
                    name: "Rent",
                    category_group_name: "Living",
                    deleted: false,
                    hidden: false,
                    budgeted: 220000,
                    activity: -220000,
                    balance: 0,
                  },
                ],
              },
            },
          }),
      },
    };

    const result = await GetCategoryTrendSummaryTool.execute(
      {
        planId: "plan-1",
        fromMonth: "2026-01-01",
        toMonth: "2026-03-01",
        categoryGroupName: "Living",
      },
      api as any,
    );

    expect(api.months.getPlanMonth).toHaveBeenNthCalledWith(1, "plan-1", "2026-01-01");
    expect(api.months.getPlanMonth).toHaveBeenNthCalledWith(2, "plan-1", "2026-02-01");
    expect(api.months.getPlanMonth).toHaveBeenNthCalledWith(3, "plan-1", "2026-03-01");
    expect(parseText(result as any)).toEqual({
      from_month: "2026-01-01",
      to_month: "2026-03-01",
      scope: {
        type: "category_group",
        name: "Living",
      },
      average_spent: "356.67",
      peak_month: "2026-02-01",
      spent_change: "-20.00",
      periods: [
        {
          month: "2026-01-01",
          assigned: "370.00",
          spent: "360.00",
          available: "10.00",
        },
        {
          month: "2026-02-01",
          assigned: "385.00",
          spent: "370.00",
          available: "15.00",
        },
        {
          month: "2026-03-01",
          assigned: "360.00",
          spent: "340.00",
          available: "20.00",
        },
      ],
    });
  });

  it("defaults category trend month ranges to the current month before expanding the month list", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-24T12:00:00.000Z"));

    try {
      const api = {
        months: {
          getPlanMonth: vi.fn().mockResolvedValue({
            data: {
              month: {
                month: "2026-03-01",
                deleted: false,
                categories: [
                  {
                    id: "cat-1",
                    name: "Groceries",
                    category_group_name: "Living",
                    deleted: false,
                    hidden: false,
                    budgeted: 165000,
                    activity: -150000,
                    balance: 15000,
                  },
                ],
              },
            },
          }),
        },
      };

      const result = await GetCategoryTrendSummaryTool.execute(
        { planId: "plan-1", categoryGroupName: "Living" },
        api as any,
      );

      expect(api.months.getPlanMonth).toHaveBeenCalledTimes(1);
      expect(api.months.getPlanMonth).toHaveBeenCalledWith("plan-1", "2026-03-01");
      expect(parseText(result as any)).toEqual({
        from_month: "2026-03-01",
        to_month: "2026-03-01",
        scope: {
          type: "category_group",
          name: "Living",
        },
        average_spent: "150.00",
        peak_month: "2026-03-01",
        spent_change: "0.00",
        periods: [
          {
            month: "2026-03-01",
            assigned: "165.00",
            spent: "150.00",
            available: "15.00",
          },
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });

});
