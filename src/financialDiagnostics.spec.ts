import { describe, expect, it, vi } from "vitest";

import * as GetCashRunwayTool from "./features/financialHealth/GetCashRunwayTool.js";
import * as GetDebtSummaryTool from "./features/financialHealth/GetDebtSummaryTool.js";
import * as GetEmergencyFundCoverageTool from "./features/financialHealth/GetEmergencyFundCoverageTool.js";
import * as GetFinancialHealthCheckTool from "./features/financialHealth/GetFinancialHealthCheckTool.js";
import * as GetRecurringExpenseSummaryTool from "./features/financialHealth/GetRecurringExpenseSummaryTool.js";
import * as GetSpendingAnomaliesTool from "./features/financialHealth/GetSpendingAnomaliesTool.js";
import * as GetUpdatedAnomaliesTool from "./features/financialHealth/GetUpdatedAnomaliesTool.js";

function parseText(result: Awaited<ReturnType<typeof GetFinancialHealthCheckTool.execute>>) {
  return JSON.parse(result.content[0].text);
}

function readText(result: { content: Array<{ text: string }> }) {
  return result.content[0].text;
}

describe("financial diagnostics tools", () => {
  it("builds a compact financial health check", async () => {
    const api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              { id: "acct-1", name: "Checking", on_budget: true, deleted: false, closed: false, balance: 600000 },
              { id: "acct-2", name: "Visa", on_budget: true, deleted: false, closed: false, balance: -300000 },
              { id: "acct-3", name: "Mortgage", on_budget: false, deleted: false, closed: false, balance: -200000 },
            ],
          },
        }),
      },
      months: {
        getPlanMonth: vi.fn().mockResolvedValue({
          data: {
            month: {
              month: "2026-03-01",
              to_be_budgeted: -20000,
              age_of_money: 10,
              income: 200000,
              budgeted: 250000,
              activity: -270000,
              categories: [
                { id: "cat-1", name: "Rent", deleted: false, hidden: false, balance: -15000, goal_under_funded: 0 },
                { id: "cat-2", name: "Emergency Fund", deleted: false, hidden: false, balance: 50000, goal_under_funded: 5000 },
                { id: "cat-3", name: "Vacation", deleted: false, hidden: false, balance: 10000, goal_under_funded: 10000 },
              ],
            },
          },
        }),
        getPlanMonths: vi.fn().mockResolvedValue({
          data: {
            months: [
              { month: "2026-01-01", income: 500000, deleted: false },
              { month: "2026-02-01", income: 500000, deleted: false },
              { month: "2026-03-01", income: 200000, deleted: false },
            ],
          },
        }),
      },
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              {
                id: "tx-1",
                date: "2026-03-08",
                amount: -45000,
                deleted: false,
                approved: false,
                cleared: "uncleared",
                category_id: null,
                payee_name: "Mystery Charge",
              },
            ],
          },
        }),
      },
      scheduledTransactions: {
        getScheduledTransactions: vi.fn().mockResolvedValue({
          data: {
            scheduled_transactions: [
              { id: "sched-1", deleted: false, date_next: "2026-03-15", amount: -700000 },
            ],
          },
        }),
      },
    };

    const result = await GetFinancialHealthCheckTool.execute(
      { planId: "plan-1", month: "2026-03-01", asOfDate: "2026-03-10" },
      api as any,
    );

    expect(parseText(result)).toEqual({
      as_of_month: "2026-03-01",
      status: "needs_attention",
      score: 20,
      metrics: {
        net_worth: "100.00",
        liquid_cash: "600.00",
        debt: "500.00",
        ready_to_assign: "-20.00",
        age_of_money: 10,
        overspent_category_count: 1,
        underfunded_category_count: 2,
        uncategorized_transaction_count: 1,
        unapproved_transaction_count: 1,
        uncleared_transaction_count: 1,
        upcoming_30d_net: "-700.00",
        income_volatility_percent: "75.00",
      },
      top_risks: [
        { code: "cash_shortfall", severity: "high" },
        { code: "negative_ready_to_assign", severity: "high" },
        { code: "overspent_categories", severity: "high" },
        { code: "goal_underfunding", severity: "medium" },
        { code: "cleanup_backlog", severity: "medium" },
      ],
      top_overspent: [
        { name: "Rent", amount: "15.00" },
      ],
      top_underfunded: [
        { name: "Vacation", amount: "10.00" },
        { name: "Emergency Fund", amount: "5.00" },
      ],
      top_uncategorized: [
        { date: "2026-03-08", payee_name: "Mystery Charge", amount: "45.00" },
      ],
    });
  });

  it("limits financial health cleanup counts to transactions inside the requested month", async () => {
    const api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              { id: "acct-1", name: "Checking", on_budget: true, deleted: false, closed: false, balance: 600000 },
            ],
          },
        }),
      },
      months: {
        getPlanMonth: vi.fn().mockResolvedValue({
          data: {
            month: {
              month: "2026-03-01",
              to_be_budgeted: 50000,
              age_of_money: 30,
              income: 200000,
              budgeted: 150000,
              activity: -100000,
              categories: [],
            },
          },
        }),
        getPlanMonths: vi.fn().mockResolvedValue({
          data: {
            months: [
              { month: "2026-01-01", income: 200000, deleted: false },
              { month: "2026-02-01", income: 200000, deleted: false },
              { month: "2026-03-01", income: 200000, deleted: false },
            ],
          },
        }),
      },
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              {
                id: "tx-1",
                date: "2026-03-03",
                amount: -20000,
                deleted: false,
                approved: false,
                cleared: "uncleared",
                category_id: null,
                payee_name: "Unknown Store",
              },
              {
                id: "tx-2",
                date: "2026-04-03",
                amount: -50000,
                deleted: false,
                approved: false,
                cleared: "uncleared",
                category_id: null,
                payee_name: "April Store",
              },
            ],
          },
        }),
      },
      scheduledTransactions: {
        getScheduledTransactions: vi.fn().mockResolvedValue({
          data: {
            scheduled_transactions: [],
          },
        }),
      },
    };

    const result = await GetFinancialHealthCheckTool.execute(
      { planId: "plan-1", month: "2026-03-01", asOfDate: "2026-03-10" },
      api as any,
    );

    expect(parseText(result as any)).toEqual({
      as_of_month: "2026-03-01",
      status: "healthy",
      score: 90,
      metrics: {
        net_worth: "600.00",
        liquid_cash: "600.00",
        debt: "0.00",
        ready_to_assign: "50.00",
        age_of_money: 30,
        overspent_category_count: 0,
        underfunded_category_count: 0,
        uncategorized_transaction_count: 1,
        unapproved_transaction_count: 1,
        uncleared_transaction_count: 1,
        upcoming_30d_net: "0.00",
        income_volatility_percent: "0.00",
      },
      top_risks: [
        { code: "cleanup_backlog", severity: "medium" },
      ],
      top_overspent: [],
      top_underfunded: [],
      top_uncategorized: [
        { date: "2026-03-03", payee_name: "Unknown Store", amount: "20.00" },
      ],
    });
  });

  it("renders the financial health check as prose when requested", async () => {
    const api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              { id: "acct-1", name: "Checking", on_budget: true, deleted: false, closed: false, balance: 600000 },
              { id: "acct-2", name: "Visa", on_budget: true, deleted: false, closed: false, balance: -300000 },
              { id: "acct-3", name: "Mortgage", on_budget: false, deleted: false, closed: false, balance: -200000 },
            ],
          },
        }),
      },
      months: {
        getPlanMonth: vi.fn().mockResolvedValue({
          data: {
            month: {
              month: "2026-03-01",
              to_be_budgeted: -20000,
              age_of_money: 10,
              income: 200000,
              budgeted: 250000,
              activity: -270000,
              categories: [
                { id: "cat-1", name: "Rent", deleted: false, hidden: false, balance: -15000, goal_under_funded: 0 },
                { id: "cat-2", name: "Emergency Fund", deleted: false, hidden: false, balance: 50000, goal_under_funded: 5000 },
                { id: "cat-3", name: "Vacation", deleted: false, hidden: false, balance: 10000, goal_under_funded: 10000 },
              ],
            },
          },
        }),
        getPlanMonths: vi.fn().mockResolvedValue({
          data: {
            months: [
              { month: "2026-01-01", income: 500000, deleted: false },
              { month: "2026-02-01", income: 500000, deleted: false },
              { month: "2026-03-01", income: 200000, deleted: false },
            ],
          },
        }),
      },
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              {
                id: "tx-1",
                date: "2026-03-08",
                amount: -45000,
                deleted: false,
                approved: false,
                cleared: "uncleared",
                category_id: null,
                payee_name: "Mystery Charge",
              },
            ],
          },
        }),
      },
      scheduledTransactions: {
        getScheduledTransactions: vi.fn().mockResolvedValue({
          data: {
            scheduled_transactions: [
              { id: "sched-1", deleted: false, date_next: "2026-03-15", amount: -700000 },
            ],
          },
        }),
      },
    };

    const result = await GetFinancialHealthCheckTool.execute(
      { planId: "plan-1", month: "2026-03-01", asOfDate: "2026-03-10", format: "prose" } as any,
      api as any,
    );

    expect(readText(result as any)).toBe([
      "Financial Health Check (2026-03-01): status needs_attention | score 20 | net_worth 100.00 | liquid_cash 600.00 | debt 500.00 | ready_to_assign -20.00 | upcoming_30d_net -700.00",
      "Top Risks: cash_shortfall high, negative_ready_to_assign high, overspent_categories high, goal_underfunding medium, cleanup_backlog medium",
      "Overspent: Rent 15.00",
      "Underfunded: Vacation 10.00, Emergency Fund 5.00",
      "Uncategorized: 2026-03-08 Mystery Charge 45.00",
    ].join("\n"));
  });

  it("calculates emergency fund coverage", async () => {
    const api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              { id: "acct-1", name: "Checking", on_budget: true, deleted: false, closed: false, balance: 900000 },
            ],
          },
        }),
      },
      months: {
        getPlanMonths: vi.fn().mockResolvedValue({
          data: {
            months: [
              { month: "2026-01-01", activity: -300000, deleted: false },
              { month: "2026-02-01", activity: -300000, deleted: false },
              { month: "2026-03-01", activity: -300000, deleted: false },
            ],
          },
        }),
      },
      scheduledTransactions: {
        getScheduledTransactions: vi.fn().mockResolvedValue({
          data: {
            scheduled_transactions: [
              { id: "sched-1", deleted: false, date_next: "2026-03-10", amount: -100000, frequency: "monthly", transfer_account_id: null },
              { id: "sched-2", deleted: false, date_next: "2026-03-20", amount: 50000, frequency: "never", transfer_account_id: null },
              { id: "sched-3", deleted: false, date_next: "2026-04-15", amount: -25000, frequency: "never", transfer_account_id: null },
            ],
          },
        }),
      },
    };

    const result = await GetEmergencyFundCoverageTool.execute(
      { planId: "plan-1", asOfMonth: "2026-03-01", monthsBack: 3 },
      api as any,
    );

    expect(parseText(result as any)).toEqual({
      as_of_month: "2026-03-01",
      liquid_cash: "900.00",
      average_monthly_spending: "300.00",
      scheduled_net_next_30d: "-50.00",
      coverage_months: "3.00",
      status: "solid",
      months_considered: 3,
    });
  });

  it("calculates cash runway", async () => {
    const api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              { id: "acct-1", name: "Checking", on_budget: true, deleted: false, closed: false, balance: 900000 },
            ],
          },
        }),
      },
      months: {
        getPlanMonths: vi.fn().mockResolvedValue({
          data: {
            months: [
              { month: "2026-01-01", activity: -300000, deleted: false },
              { month: "2026-02-01", activity: -300000, deleted: false },
              { month: "2026-03-01", activity: -300000, deleted: false },
            ],
          },
        }),
      },
      scheduledTransactions: {
        getScheduledTransactions: vi.fn().mockResolvedValue({
          data: {
            scheduled_transactions: [
              { id: "sched-1", deleted: false, date_next: "2026-03-10", amount: -100000, frequency: "monthly", transfer_account_id: null },
              { id: "sched-2", deleted: false, date_next: "2026-03-20", amount: 50000, frequency: "never", transfer_account_id: null },
              { id: "sched-3", deleted: false, date_next: "2026-04-15", amount: -25000, frequency: "never", transfer_account_id: null },
            ],
          },
        }),
      },
    };

    const result = await GetCashRunwayTool.execute(
      { planId: "plan-1", asOfMonth: "2026-03-01", monthsBack: 3 },
      api as any,
    );

    expect(parseText(result as any)).toEqual({
      as_of_month: "2026-03-01",
      liquid_cash: "900.00",
      average_daily_outflow: "10.00",
      scheduled_net_next_30d: "-50.00",
      runway_days: "90.00",
      status: "stable",
      months_considered: 3,
    });
  });

  it("summarizes debt pressure", async () => {
    const api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              { id: "acct-1", name: "Checking", type: "checking", on_budget: true, deleted: false, closed: false, balance: 600000 },
              { id: "acct-2", name: "Visa", type: "creditCard", on_budget: true, deleted: false, closed: false, balance: -300000 },
              { id: "acct-3", name: "Student Loan", type: "otherDebt", on_budget: false, deleted: false, closed: false, balance: -200000 },
            ],
          },
        }),
      },
    };

    const result = await GetDebtSummaryTool.execute({ planId: "plan-1", topN: 2 }, api as any);

    expect(parseText(result as any)).toEqual({
      total_debt: "500.00",
      liquid_cash: "600.00",
      debt_account_count: 2,
      debt_to_cash_ratio: "0.83",
      status: "manageable",
      top_debt_accounts: [
        { id: "acct-2", name: "Visa", type: "creditCard", balance: "300.00" },
        { id: "acct-3", name: "Student Loan", type: "otherDebt", balance: "200.00" },
      ],
    });
  });

  it("infers recurring expenses from transaction history", async () => {
    const api = {
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              { id: "tx-1", date: "2026-01-03", amount: -45000, deleted: false, transfer_account_id: null, payee_name: "Gym", payee_id: "payee-gym" },
              { id: "tx-2", date: "2026-02-03", amount: -45000, deleted: false, transfer_account_id: null, payee_name: "Gym", payee_id: "payee-gym" },
              { id: "tx-3", date: "2026-03-03", amount: -45000, deleted: false, transfer_account_id: null, payee_name: "Gym", payee_id: "payee-gym" },
              { id: "tx-4", date: "2026-01-05", amount: -15000, deleted: false, transfer_account_id: null, payee_name: "Netflix", payee_id: "payee-netflix" },
              { id: "tx-5", date: "2026-02-05", amount: -15000, deleted: false, transfer_account_id: null, payee_name: "Netflix", payee_id: "payee-netflix" },
              { id: "tx-6", date: "2026-03-05", amount: -15000, deleted: false, transfer_account_id: null, payee_name: "Netflix", payee_id: "payee-netflix" },
              { id: "tx-7", date: "2026-03-09", amount: -8000, deleted: false, transfer_account_id: null, payee_name: "Cafe", payee_id: "payee-cafe" },
            ],
          },
        }),
      },
    };

    const result = await GetRecurringExpenseSummaryTool.execute(
      { planId: "plan-1", fromDate: "2026-01-01", toDate: "2026-03-31", topN: 2 },
      api as any,
    );

    expect(parseText(result as any)).toEqual({
      from_date: "2026-01-01",
      to_date: "2026-03-31",
      recurring_expense_count: 2,
      recurring_expenses: [
        {
          payee_id: "payee-gym",
          payee_name: "Gym",
          cadence: "monthly",
          occurrence_count: 3,
          average_amount: "45.00",
          estimated_monthly_cost: "45.00",
          annualized_cost: "540.00",
        },
        {
          payee_id: "payee-netflix",
          payee_name: "Netflix",
          cadence: "monthly",
          occurrence_count: 3,
          average_amount: "15.00",
          estimated_monthly_cost: "15.00",
          annualized_cost: "180.00",
        },
      ],
    });
  });

  it("flags spending anomalies against trailing category baselines", async () => {
    const api = {
      months: {
        getPlanMonth: vi
          .fn()
          .mockResolvedValueOnce({
            data: {
              month: {
                month: "2026-01-01",
                categories: [
                  { id: "cat-1", name: "Dining Out", deleted: false, hidden: false, activity: -100000 },
                ],
              },
            },
          })
          .mockResolvedValueOnce({
            data: {
              month: {
                month: "2026-02-01",
                categories: [
                  { id: "cat-1", name: "Dining Out", deleted: false, hidden: false, activity: -120000 },
                ],
              },
            },
          })
          .mockResolvedValueOnce({
            data: {
              month: {
                month: "2026-03-01",
                categories: [
                  { id: "cat-1", name: "Dining Out", deleted: false, hidden: false, activity: -260000 },
                ],
              },
            },
          }),
      },
    };

    const result = await GetSpendingAnomaliesTool.execute(
      { planId: "plan-1", latestMonth: "2026-03-01", baselineMonths: 2, topN: 5 },
      api as any,
    );

    expect(parseText(result as any)).toEqual({
      analysis_token: expect.any(String),
      latest_month: "2026-03-01",
      baseline_month_count: 2,
      anomaly_count: 1,
      anomalies: [
        {
          category_id: "cat-1",
          category_name: "Dining Out",
          latest_spent: "260.00",
          baseline_average: "110.00",
          change_percent: "136.36",
        },
      ],
    });
  });

  it("returns only anomaly deltas relative to a prior anomaly analysis token", async () => {
    const api = {
      months: {
        getPlanMonth: vi.fn(async (_planId: string, month: string) => {
          if (month === "2026-01-01") {
            return {
              data: {
                month: {
                  month,
                  categories: [
                    { id: "cat-1", name: "Dining Out", deleted: false, hidden: false, activity: -100000 },
                  ],
                },
              },
            };
          }

          if (month === "2026-02-01") {
            return {
              data: {
                month: {
                  month,
                  categories: [
                    { id: "cat-1", name: "Dining Out", deleted: false, hidden: false, activity: -120000 },
                    { id: "cat-2", name: "Transport", deleted: false, hidden: false, activity: -20000 },
                  ],
                },
              },
            };
          }

          if (month === "2026-03-01") {
            return {
              data: {
                month: {
                  month,
                  categories: [
                    { id: "cat-1", name: "Dining Out", deleted: false, hidden: false, activity: -260000 },
                  ],
                },
              },
            };
          }

          return {
            data: {
              month: {
                month: "2026-04-01",
                categories: [
                  { id: "cat-1", name: "Dining Out", deleted: false, hidden: false, activity: -180000 },
                  { id: "cat-2", name: "Transport", deleted: false, hidden: false, activity: -90000 },
                ],
              },
            },
          };
        }),
      },
    };

    const initial = parseText(await GetSpendingAnomaliesTool.execute(
      { planId: "plan-1", latestMonth: "2026-03-01", baselineMonths: 2, topN: 5 },
      api as any,
    ) as any);

    const updated = parseText(await GetUpdatedAnomaliesTool.execute(
      {
        analysisToken: initial.analysis_token,
        latestMonth: "2026-04-01",
        baselineMonths: 2,
        topN: 5,
      } as any,
      api as any,
    ) as any);

    expect(updated).toEqual({
      previous_analysis_token: initial.analysis_token,
      analysis_token: expect.any(String),
      latest_month: "2026-04-01",
      current_anomaly_count: 1,
      added_anomalies: [
        {
          category_id: "cat-2",
          category_name: "Transport",
          latest_spent: "90.00",
          baseline_average: "10.00",
          change_percent: "800.00",
        },
      ],
      removed_anomaly_ids: [
        "cat-1",
      ],
      changed_anomalies: [],
    });
  });

  it("returns no_outflows status when cash runway has zero outflows", async () => {
    const api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              { id: "acct-1", name: "Checking", on_budget: true, deleted: false, closed: false, balance: 900000 },
            ],
          },
        }),
      },
      months: {
        getPlanMonths: vi.fn().mockResolvedValue({
          data: {
            months: [
              { month: "2026-01-01", activity: 0, deleted: false },
              { month: "2026-02-01", activity: 0, deleted: false },
              { month: "2026-03-01", activity: 0, deleted: false },
            ],
          },
        }),
      },
      scheduledTransactions: {
        getScheduledTransactions: vi.fn().mockResolvedValue({
          data: {
            scheduled_transactions: [],
          },
        }),
      },
    };

    const result = await GetCashRunwayTool.execute(
      { planId: "plan-1", asOfMonth: "2026-03-01", monthsBack: 3 },
      api as any,
    );

    const parsed = parseText(result as any);
    expect(parsed.status).toBe("no_outflows");
    expect(parsed.liquid_cash).toBe("900.00");
    expect(parsed.scheduled_net_next_30d).toBe("0.00");
    expect(parsed.runway_days).toBeUndefined();
  });

  it("returns no_spending status when emergency fund has zero spending", async () => {
    const api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              { id: "acct-1", name: "Checking", on_budget: true, deleted: false, closed: false, balance: 900000 },
            ],
          },
        }),
      },
      months: {
        getPlanMonths: vi.fn().mockResolvedValue({
          data: {
            months: [
              { month: "2026-01-01", activity: 0, deleted: false },
              { month: "2026-02-01", activity: 0, deleted: false },
              { month: "2026-03-01", activity: 0, deleted: false },
            ],
          },
        }),
      },
      scheduledTransactions: {
        getScheduledTransactions: vi.fn().mockResolvedValue({
          data: {
            scheduled_transactions: [],
          },
        }),
      },
    };

    const result = await GetEmergencyFundCoverageTool.execute(
      { planId: "plan-1", asOfMonth: "2026-03-01", monthsBack: 3 },
      api as any,
    );

    const parsed = parseText(result as any);
    expect(parsed.status).toBe("no_spending");
    expect(parsed.liquid_cash).toBe("900.00");
    expect(parsed.scheduled_net_next_30d).toBe("0.00");
    expect(parsed.coverage_months).toBeUndefined();
  });

  it("returns none status when debt summary has zero debt and zero cash", async () => {
    const api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              { id: "acct-1", name: "Checking", type: "checking", on_budget: true, deleted: false, closed: false, balance: 0 },
            ],
          },
        }),
      },
    };

    const result = await GetDebtSummaryTool.execute({ planId: "plan-1" }, api as any);

    const parsed = parseText(result as any);
    expect(parsed.status).toBe("none");
    expect(parsed.total_debt).toBe("0.00");
  });
});
