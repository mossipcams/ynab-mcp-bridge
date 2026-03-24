import { describe, expect, it, vi } from "vitest";

import { registerServerTools } from "./server.js";
import * as GetBudgetHealthSummaryTool from "./tools/GetBudgetHealthSummaryTool.js";
import * as GetCashFlowSummaryTool from "./tools/GetCashFlowSummaryTool.js";
import * as GetFinancialSnapshotTool from "./tools/GetFinancialSnapshotTool.js";
import * as GetSpendingSummaryTool from "./tools/GetSpendingSummaryTool.js";

function parseText(result: Awaited<ReturnType<typeof GetFinancialSnapshotTool.execute>>) {
  return JSON.parse(result.content[0].text);
}

function registerHandlers(api: unknown) {
  const handlers = new Map<string, (input: Record<string, unknown>) => Promise<unknown>>();

  registerServerTools(
    {
      registerTool: ((name: string, _metadata: unknown, handler: (input: Record<string, unknown>) => Promise<unknown>) => {
        handlers.set(name, handler);
        return {} as any;
      }) as any,
    },
    api as any,
  );

  return handlers;
}

describe("finance summary tools", () => {
  it("builds a compact financial snapshot for the requested month", async () => {
    const api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              {
                id: "acct-1",
                name: "Checking",
                type: "checking",
                on_budget: true,
                closed: false,
                deleted: false,
                balance: 320000,
              },
              {
                id: "acct-2",
                name: "Savings",
                type: "savings",
                on_budget: true,
                closed: false,
                deleted: false,
                balance: 180000,
              },
              {
                id: "acct-3",
                name: "Visa",
                type: "creditCard",
                on_budget: true,
                closed: false,
                deleted: false,
                balance: -90000,
              },
              {
                id: "acct-4",
                name: "Mortgage",
                type: "mortgage",
                on_budget: false,
                closed: false,
                deleted: false,
                balance: -150000,
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
              income: 500000,
              budgeted: 420000,
              activity: -365000,
              to_be_budgeted: 55000,
              age_of_money: 42,
              deleted: false,
              categories: [],
            },
          },
        }),
      },
    };

    const result = await GetFinancialSnapshotTool.execute(
      { planId: "plan-1", month: "2026-03-01" },
      api as any,
    );

    expect(api.accounts.getAccounts).toHaveBeenCalledWith("plan-1");
    expect(api.months.getPlanMonth).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(parseText(result)).toEqual({
      month: "2026-03-01",
      net_worth: "260.00",
      liquid_cash: "500.00",
      debt: "240.00",
      ready_to_assign: "55.00",
      income: "500.00",
      assigned: "420.00",
      spent: "365.00",
      assigned_vs_spent: "55.00",
      age_of_money: 42,
      account_count: 4,
      on_budget_account_count: 3,
      debt_account_count: 2,
      top_asset_accounts: [
        {
          id: "acct-1",
          name: "Checking",
          amount: "320.00",
        },
        {
          id: "acct-2",
          name: "Savings",
          amount: "180.00",
        },
      ],
      top_debt_accounts: [
        {
          id: "acct-4",
          name: "Mortgage",
          amount: "150.00",
        },
        {
          id: "acct-3",
          name: "Visa",
          amount: "90.00",
        },
      ],
    });
  });

  it("builds a compact spending summary across a month range", async () => {
    const api = {
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              {
                id: "tx-1",
                date: "2026-02-02",
                amount: -125000,
                deleted: false,
                transfer_account_id: null,
                category_id: "cat-1",
                category_name: "Groceries",
                payee_id: "payee-1",
                payee_name: "Trader Joe's",
              },
              {
                id: "tx-2",
                date: "2026-02-10",
                amount: -220000,
                deleted: false,
                transfer_account_id: null,
                category_id: "cat-2",
                category_name: "Rent",
                payee_id: "payee-2",
                payee_name: "Landlord",
              },
              {
                id: "tx-3",
                date: "2026-03-05",
                amount: -45000,
                deleted: false,
                transfer_account_id: null,
                category_id: "cat-1",
                category_name: "Groceries",
                payee_id: "payee-3",
                payee_name: "Costco",
              },
              {
                id: "tx-4",
                date: "2026-03-08",
                amount: 300000,
                deleted: false,
                transfer_account_id: null,
                category_id: "cat-income",
                category_name: "Inflow: Ready to Assign",
                payee_id: "payee-4",
                payee_name: "Employer",
              },
              {
                id: "tx-5",
                date: "2026-03-12",
                amount: -50000,
                deleted: false,
                transfer_account_id: "acct-2",
                category_id: null,
                category_name: null,
                payee_id: null,
                payee_name: "Transfer : Savings",
              },
              {
                id: "tx-6",
                date: "2026-03-15",
                amount: -10000,
                deleted: true,
                transfer_account_id: null,
                category_id: "cat-3",
                category_name: "Coffee",
                payee_id: "payee-5",
                payee_name: "Cafe",
              },
            ],
          },
        }),
      },
      months: {
        getPlanMonths: vi.fn().mockResolvedValue({
          data: {
            months: [
              {
                month: "2026-02-01",
                budgeted: 250000,
                activity: -345000,
                deleted: false,
              },
              {
                month: "2026-03-01",
                budgeted: 275000,
                activity: -95000,
                deleted: false,
              },
            ],
          },
        }),
      },
      categories: {
        getCategories: vi.fn().mockResolvedValue({
          data: {
            category_groups: [
              {
                id: "group-1",
                name: "Living",
                deleted: false,
                hidden: false,
                categories: [
                  { id: "cat-1", name: "Groceries", deleted: false, hidden: false },
                  { id: "cat-2", name: "Rent", deleted: false, hidden: false },
                ],
              },
              {
                id: "group-2",
                name: "Fun",
                deleted: false,
                hidden: false,
                categories: [
                  { id: "cat-3", name: "Coffee", deleted: false, hidden: false },
                ],
              },
            ],
          },
        }),
      },
    };

    const result = await GetSpendingSummaryTool.execute(
      { planId: "plan-1", fromMonth: "2026-02-01", toMonth: "2026-03-01", topN: 2 },
      api as any,
    );

    expect(api.transactions.getTransactions).toHaveBeenCalledWith("plan-1", "2026-02-01", undefined, undefined);
    expect(api.months.getPlanMonths).toHaveBeenCalledWith("plan-1");
    expect(api.categories.getCategories).toHaveBeenCalledWith("plan-1");
    expect(parseText(result as any)).toEqual({
      from_month: "2026-02-01",
      to_month: "2026-03-01",
      assigned: "525.00",
      spent: "390.00",
      assigned_vs_spent: "135.00",
      transaction_count: 3,
      average_transaction: "130.00",
      top_categories: [
        {
          id: "cat-2",
          name: "Rent",
          amount: "220.00",
          transaction_count: 1,
        },
        {
          id: "cat-1",
          name: "Groceries",
          amount: "170.00",
          transaction_count: 2,
        },
      ],
      top_category_groups: [
        {
          name: "Living",
          amount: "390.00",
          transaction_count: 3,
        },
      ],
      top_payees: [
        {
          id: "payee-2",
          name: "Landlord",
          amount: "220.00",
          transaction_count: 1,
        },
        {
          id: "payee-1",
          name: "Trader Joe's",
          amount: "125.00",
          transaction_count: 1,
        },
      ],
    });
  });

  it("builds a compact cash flow summary with monthly trend buckets", async () => {
    const api = {
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              {
                id: "tx-1",
                date: "2026-02-03",
                amount: 400000,
                deleted: false,
                transfer_account_id: null,
              },
              {
                id: "tx-2",
                date: "2026-02-05",
                amount: -150000,
                deleted: false,
                transfer_account_id: null,
              },
              {
                id: "tx-3",
                date: "2026-03-01",
                amount: 25000,
                deleted: false,
                transfer_account_id: null,
              },
              {
                id: "tx-4",
                date: "2026-03-07",
                amount: -80000,
                deleted: false,
                transfer_account_id: null,
              },
              {
                id: "tx-5",
                date: "2026-03-11",
                amount: -20000,
                deleted: false,
                transfer_account_id: "acct-2",
              },
            ],
          },
        }),
      },
      months: {
        getPlanMonths: vi.fn().mockResolvedValue({
          data: {
            months: [
              {
                month: "2026-02-01",
                budgeted: 200000,
                activity: -150000,
                deleted: false,
              },
              {
                month: "2026-03-01",
                budgeted: 100000,
                activity: -80000,
                deleted: false,
              },
            ],
          },
        }),
      },
    };

    const result = await GetCashFlowSummaryTool.execute(
      { planId: "plan-1", fromMonth: "2026-02-01", toMonth: "2026-03-01" },
      api as any,
    );

    expect(api.transactions.getTransactions).toHaveBeenCalledWith("plan-1", "2026-02-01", undefined, undefined);
    expect(api.months.getPlanMonths).toHaveBeenCalledWith("plan-1");
    expect(parseText(result as any)).toEqual({
      from_month: "2026-02-01",
      to_month: "2026-03-01",
      inflow: "425.00",
      outflow: "230.00",
      net_flow: "195.00",
      assigned: "300.00",
      spent: "230.00",
      assigned_vs_spent: "70.00",
      periods: [
        {
          month: "2026-02-01",
          inflow: "400.00",
          outflow: "150.00",
          net_flow: "250.00",
          assigned: "200.00",
          spent: "150.00",
          assigned_vs_spent: "50.00",
        },
        {
          month: "2026-03-01",
          inflow: "25.00",
          outflow: "80.00",
          net_flow: "-55.00",
          assigned: "100.00",
          spent: "80.00",
          assigned_vs_spent: "20.00",
        },
      ],
    });
  });

  it("builds a compact budget health summary for a month", async () => {
    const api = {
      months: {
        getPlanMonth: vi.fn().mockResolvedValue({
          data: {
            month: {
              month: "2026-03-01",
              income: 500000,
              budgeted: 355000,
              activity: -318000,
              to_be_budgeted: 25000,
              age_of_money: 38,
              deleted: false,
              categories: [
                {
                  id: "cat-1",
                  name: "Dining Out",
                  category_group_name: "Lifestyle",
                  hidden: false,
                  deleted: false,
                  budgeted: 50000,
                  activity: -70000,
                  balance: -20000,
                  goal_under_funded: 0,
                },
                {
                  id: "cat-2",
                  name: "Emergency Fund",
                  category_group_name: "Savings",
                  hidden: false,
                  deleted: false,
                  budgeted: 30000,
                  activity: 0,
                  balance: 30000,
                  goal_under_funded: 120000,
                },
                {
                  id: "cat-3",
                  name: "Travel",
                  category_group_name: "Savings",
                  hidden: false,
                  deleted: false,
                  budgeted: 40000,
                  activity: -10000,
                  balance: 30000,
                  goal_under_funded: 60000,
                },
                {
                  id: "cat-4",
                  name: "Coffee",
                  category_group_name: "Lifestyle",
                  hidden: false,
                  deleted: false,
                  budgeted: 15000,
                  activity: -18000,
                  balance: -3000,
                  goal_under_funded: 0,
                },
              ],
            },
          },
        }),
      },
    };

    const result = await GetBudgetHealthSummaryTool.execute(
      { planId: "plan-1", month: "2026-03-01", topN: 2 },
      api as any,
    );

    expect(api.months.getPlanMonth).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(parseText(result as any)).toEqual({
      month: "2026-03-01",
      ready_to_assign: "25.00",
      available_total: "60.00",
      overspent_total: "23.00",
      underfunded_total: "180.00",
      age_of_money: 38,
      assigned: "355.00",
      spent: "318.00",
      assigned_vs_spent: "37.00",
      overspent_category_count: 2,
      underfunded_category_count: 2,
      top_overspent_categories: [
        {
          id: "cat-1",
          name: "Dining Out",
          category_group_name: "Lifestyle",
          amount: "20.00",
        },
        {
          id: "cat-4",
          name: "Coffee",
          category_group_name: "Lifestyle",
          amount: "3.00",
        },
      ],
      top_underfunded_categories: [
        {
          id: "cat-2",
          name: "Emergency Fund",
          category_group_name: "Savings",
          amount: "120.00",
        },
        {
          id: "cat-3",
          name: "Travel",
          category_group_name: "Savings",
          amount: "60.00",
        },
      ],
    });
  });

  it("builds a month-by-month net worth trajectory across a range", async () => {
    const api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              {
                id: "acct-checking",
                name: "Checking",
                type: "checking",
                on_budget: true,
                closed: false,
                deleted: false,
                balance: 400000,
              },
              {
                id: "acct-savings",
                name: "Savings",
                type: "savings",
                on_budget: true,
                closed: false,
                deleted: false,
                balance: 150000,
              },
              {
                id: "acct-visa",
                name: "Visa",
                type: "creditCard",
                on_budget: true,
                closed: false,
                deleted: false,
                balance: -50000,
              },
              {
                id: "acct-mortgage",
                name: "Mortgage",
                type: "mortgage",
                on_budget: false,
                closed: false,
                deleted: false,
                balance: -200000,
              },
              {
                id: "acct-old-checking",
                name: "Old Checking",
                type: "checking",
                on_budget: true,
                closed: true,
                deleted: false,
                balance: 0,
              },
            ],
          },
        }),
      },
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              {
                id: "tx-old-out",
                date: "2026-02-05",
                amount: -40000,
                deleted: false,
                approved: true,
                cleared: "cleared",
                account_id: "acct-old-checking",
                account_name: "Old Checking",
                transfer_account_id: "acct-checking",
                transfer_transaction_id: "tx-old-in",
                subtransactions: [],
              },
              {
                id: "tx-old-in",
                date: "2026-02-05",
                amount: 40000,
                deleted: false,
                approved: true,
                cleared: "cleared",
                account_id: "acct-checking",
                account_name: "Checking",
                transfer_account_id: "acct-old-checking",
                transfer_transaction_id: "tx-old-out",
                subtransactions: [],
              },
              {
                id: "tx-feb-spend",
                date: "2026-02-14",
                amount: -20000,
                deleted: false,
                approved: true,
                cleared: "cleared",
                account_id: "acct-checking",
                account_name: "Checking",
                transfer_account_id: null,
                transfer_transaction_id: null,
                subtransactions: [],
              },
              {
                id: "tx-feb-card-charge",
                date: "2026-02-22",
                amount: -10000,
                deleted: false,
                approved: true,
                cleared: "cleared",
                account_id: "acct-visa",
                account_name: "Visa",
                transfer_account_id: null,
                transfer_transaction_id: null,
                subtransactions: [],
              },
              {
                id: "tx-paycheck",
                date: "2026-03-02",
                amount: 300000,
                deleted: false,
                approved: true,
                cleared: "cleared",
                account_id: "acct-checking",
                account_name: "Checking",
                transfer_account_id: null,
                transfer_transaction_id: null,
                subtransactions: [],
              },
              {
                id: "tx-march-spend",
                date: "2026-03-08",
                amount: -100000,
                deleted: false,
                approved: true,
                cleared: "cleared",
                account_id: "acct-checking",
                account_name: "Checking",
                transfer_account_id: null,
                transfer_transaction_id: null,
                subtransactions: [],
              },
              {
                id: "tx-savings-out",
                date: "2026-03-15",
                amount: -50000,
                deleted: false,
                approved: true,
                cleared: "cleared",
                account_id: "acct-checking",
                account_name: "Checking",
                transfer_account_id: "acct-savings",
                transfer_transaction_id: "tx-savings-in",
                subtransactions: [],
              },
              {
                id: "tx-savings-in",
                date: "2026-03-15",
                amount: 50000,
                deleted: false,
                approved: true,
                cleared: "cleared",
                account_id: "acct-savings",
                account_name: "Savings",
                transfer_account_id: "acct-checking",
                transfer_transaction_id: "tx-savings-out",
                subtransactions: [],
              },
              {
                id: "tx-card-payment-out",
                date: "2026-03-20",
                amount: -20000,
                deleted: false,
                approved: true,
                cleared: "cleared",
                account_id: "acct-checking",
                account_name: "Checking",
                transfer_account_id: "acct-visa",
                transfer_transaction_id: "tx-card-payment-in",
                subtransactions: [],
              },
              {
                id: "tx-card-payment-in",
                date: "2026-03-20",
                amount: 20000,
                deleted: false,
                approved: true,
                cleared: "cleared",
                account_id: "acct-visa",
                account_name: "Visa",
                transfer_account_id: "acct-checking",
                transfer_transaction_id: "tx-card-payment-out",
                subtransactions: [],
              },
            ],
          },
        }),
      },
      plans: {
        getPlans: vi.fn().mockResolvedValue({
          data: {
            plans: [{ id: "plan-1" }],
            default_plan: { id: "plan-1" },
          },
        }),
      },
    };

    const handlers = registerHandlers(api);
    const handler = handlers.get("ynab_get_net_worth_trajectory");

    expect(handler).toBeDefined();
    if (!handler) {
      return;
    }

    const result = await handler({
      planId: "plan-1",
      fromMonth: "2026-01-01",
      toMonth: "2026-03-01",
    });

    expect(api.accounts.getAccounts).toHaveBeenCalledWith("plan-1");
    expect(api.transactions.getTransactions).toHaveBeenCalledWith("plan-1", "2026-01-01", undefined, undefined);
    expect(parseText(result as any)).toEqual({
      from_month: "2026-01-01",
      to_month: "2026-03-01",
      start_net_worth: "130.00",
      end_net_worth: "300.00",
      change_net_worth: "170.00",
      months: [
        {
          month: "2026-01-01",
          net_worth: "130.00",
          liquid_cash: "390.00",
          debt: "260.00",
        },
        {
          month: "2026-02-01",
          net_worth: "100.00",
          liquid_cash: "370.00",
          debt: "270.00",
        },
        {
          month: "2026-03-01",
          net_worth: "300.00",
          liquid_cash: "550.00",
          debt: "250.00",
        },
      ],
    });
  });
});
