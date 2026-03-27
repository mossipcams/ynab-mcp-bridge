import { describe, expect, it, vi } from "vitest";

import { getToolCatalogMetrics, getToolsListResult } from "./serverRuntime.js";
import * as GetFinancialHealthCheckTool from "./tools/GetFinancialHealthCheckTool.js";
import * as GetFinancialSnapshotTool from "./tools/GetFinancialSnapshotTool.js";
import * as GetTransactionsByAccountTool from "./tools/GetTransactionsByAccountTool.js";
import * as ListAccountsTool from "./tools/ListAccountsTool.js";
import * as ListTransactionsTool from "./tools/ListTransactionsTool.js";
import * as SearchTransactionsTool from "./tools/SearchTransactionsTool.js";

function parseText(result: Awaited<ReturnType<typeof ListTransactionsTool.execute>>) {
  return JSON.parse(result.content[0].text);
}

function measureTextPayload(text: string) {
  return {
    bytes: Buffer.byteLength(text, "utf8"),
    chars: text.length,
  };
}

describe("AI tool optimization", () => {
  it("records baseline catalog and summary payload sizes for latency work", async () => {
    const catalogMetrics = getToolCatalogMetrics();
    const api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              { id: "acct-1", name: "Checking", on_budget: true, deleted: false, closed: false, balance: 600000 },
              { id: "acct-2", name: "Visa", on_budget: true, deleted: false, closed: false, balance: -300000 },
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
              ],
            },
          },
        }),
        getPlanMonths: vi.fn().mockResolvedValue({
          data: {
            months: [
              { month: "2026-01-01", income: 500000, budgeted: 100000, deleted: false },
              { month: "2026-02-01", income: 500000, budgeted: 100000, deleted: false },
              { month: "2026-03-01", income: 200000, budgeted: 250000, deleted: false },
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
                date: "2026-03-10",
                amount: -15000,
                deleted: false,
                approved: false,
                cleared: "uncleared",
                category_id: null,
                transfer_account_id: null,
                payee_id: "payee-1",
                payee_name: "Landlord",
                category_name: null,
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
      plans: {
        getPlans: vi.fn().mockResolvedValue({
          data: {
            plans: [{ id: "plan-1" }],
            default_plan: { id: "plan-1" },
          },
        }),
      },
    };

    const [healthCheckResult, snapshotResult] = await Promise.all([
      GetFinancialHealthCheckTool.execute(
        { planId: "plan-1", month: "2026-03-01", asOfDate: "2026-03-10" },
        api as any,
      ),
      GetFinancialSnapshotTool.execute(
        { planId: "plan-1", month: "2026-03-01" },
        api as any,
      ),
    ]);

    const baseline = {
      tool_catalog: catalogMetrics,
      summary_payloads: {
        financial_health_check: measureTextPayload(healthCheckResult.content[0].text),
        financial_snapshot: measureTextPayload(snapshotResult.content[0].text),
      },
    };

    expect(baseline).toEqual({
      tool_catalog: {
        tool_count: 47,
        tools_list_bytes: expect.any(Number),
        tools_list_chars: expect.any(Number),
      },
      summary_payloads: {
        financial_health_check: {
          bytes: expect.any(Number),
          chars: expect.any(Number),
        },
        financial_snapshot: {
          bytes: expect.any(Number),
          chars: expect.any(Number),
        },
      },
    });
    expect(baseline.tool_catalog.tools_list_bytes).toBeGreaterThan(1000);
    expect(baseline.summary_payloads.financial_health_check.bytes).toBeGreaterThan(
      baseline.summary_payloads.financial_snapshot.bytes,
    );
  });

  it("trims repetitive schema and description text for high-value tools", () => {
    const toolsList = getToolsListResult();
    const searchTransactions = toolsList.tools.find((tool) => tool.name === "ynab_search_transactions");
    const financialHealthCheck = toolsList.tools.find((tool) => tool.name === "ynab_get_financial_health_check");
    const budgetHealth = toolsList.tools.find((tool) => tool.name === "ynab_get_budget_health_summary");
    const cashFlow = toolsList.tools.find((tool) => tool.name === "ynab_get_cash_flow_summary");
    const monthlyReview = toolsList.tools.find((tool) => tool.name === "ynab_get_monthly_review");
    const upcomingObligations = toolsList.tools.find((tool) => tool.name === "ynab_get_upcoming_obligations");

    expect(searchTransactions?.inputSchema).toMatchObject({
      properties: {
        planId: { description: "Plan ID (uses env default)" },
        fromDate: { description: "Start date (ISO)" },
        toDate: { description: "End date (ISO)" },
        limit: { description: "Max results" },
        offset: { description: "Skip N results" },
      },
    });
    expect(financialHealthCheck?.inputSchema).toMatchObject({
      properties: {
        planId: { description: "Plan ID (uses env default)" },
        month: { description: "Month (ISO or 'current')" },
      },
    });
    expect(budgetHealth?.description).toBe("Budget health summary with funds available, overspending, underfunding, and assigned vs spent.");
    expect(cashFlow?.description).toBe("Cash flow summary with inflow, outflow, net flow, and assigned vs spent.");
    expect(monthlyReview?.description).toBe("Monthly review with income, cash flow, budget health, top spending, and notable changes.");
    expect(upcomingObligations?.description).toBe("Upcoming scheduled inflows and outflows across 7, 14, and 30 day windows.");
  });

  it("supports bounded projected transaction listings", async () => {
    const api = {
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              {
                id: "tx-1",
                date: "2026-03-01",
                amount: -1000,
                deleted: false,
                payee_name: "Coffee Shop",
                category_name: "Coffee",
                account_name: "Checking",
                approved: true,
                cleared: "cleared",
              },
              {
                id: "tx-2",
                date: "2026-03-02",
                amount: -2500,
                deleted: false,
                payee_name: "Grocer",
                category_name: "Groceries",
                account_name: "Checking",
                approved: false,
                cleared: "uncleared",
              },
              {
                id: "tx-3",
                date: "2026-03-03",
                amount: -4000,
                deleted: false,
                payee_name: "Utility Co",
                category_name: "Utilities",
                account_name: "Checking",
                approved: true,
                cleared: "cleared",
              },
            ],
          },
        }),
      },
    };

    const result = await ListTransactionsTool.execute({
      planId: "plan-1",
      limit: 1,
      offset: 1,
      includeIds: false,
      fields: ["date", "amount", "payee_name"],
    }, api as any);

    expect(api.transactions.getTransactions).toHaveBeenCalledWith("plan-1", undefined, undefined, undefined);
    expect(parseText(result)).toEqual({
      transactions: [
        {
          date: "2026-03-02",
          amount: "-2.50",
          payee_name: "Grocer",
        },
      ],
      transaction_count: 3,
      returned_count: 1,
      offset: 1,
      limit: 1,
      has_more: true,
      next_offset: 2,
    });
  });

  it("supports bounded projected account listings", async () => {
    const api = {
      accounts: {
        getAccounts: vi.fn().mockResolvedValue({
          data: {
            accounts: [
              {
                id: "acct-1",
                name: "Checking",
                type: "checking",
                deleted: false,
                closed: false,
                balance: 125000,
              },
              {
                id: "acct-2",
                name: "Savings",
                type: "savings",
                deleted: false,
                closed: false,
                balance: 500000,
              },
            ],
          },
        }),
      },
    };

    const result = await ListAccountsTool.execute({
      planId: "plan-1",
      limit: 1,
      includeIds: false,
      fields: ["name", "balance"],
    }, api as any);

    expect(api.accounts.getAccounts).toHaveBeenCalledWith("plan-1");
    expect(parseText(result as any)).toEqual({
      accounts: [
        {
          name: "Checking",
          balance: "125.00",
        },
      ],
      account_count: 2,
      returned_count: 1,
      offset: 0,
      limit: 1,
      has_more: true,
      next_offset: 1,
    });
  });

  it("searches transactions with filters and compact projections", async () => {
    const api = {
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              {
                id: "tx-1",
                date: "2026-02-20",
                amount: -180000,
                deleted: false,
                transfer_account_id: null,
                payee_id: "payee-rent",
                payee_name: "Landlord",
                category_id: "cat-rent",
                category_name: "Rent",
                account_id: "acct-checking",
                account_name: "Checking",
                approved: true,
                cleared: "cleared",
              },
              {
                id: "tx-2",
                date: "2026-03-05",
                amount: -22000,
                deleted: false,
                transfer_account_id: null,
                payee_id: "payee-food",
                payee_name: "Grocer",
                category_id: "cat-food",
                category_name: "Groceries",
                account_id: "acct-checking",
                account_name: "Checking",
                approved: false,
                cleared: "uncleared",
              },
              {
                id: "tx-3",
                date: "2026-03-06",
                amount: -4500,
                deleted: false,
                transfer_account_id: null,
                payee_id: "payee-food",
                payee_name: "Grocer",
                category_id: "cat-food",
                category_name: "Groceries",
                account_id: "acct-credit",
                account_name: "Credit Card",
                approved: false,
                cleared: "uncleared",
              },
              {
                id: "tx-4",
                date: "2026-03-07",
                amount: 500000,
                deleted: false,
                transfer_account_id: null,
                payee_id: "payee-job",
                payee_name: "Employer",
                category_id: "cat-income",
                category_name: "Inflow: Ready to Assign",
                account_id: "acct-checking",
                account_name: "Checking",
                approved: true,
                cleared: "cleared",
              },
              {
                id: "tx-5",
                date: "2026-03-08",
                amount: -25000,
                deleted: false,
                transfer_account_id: "acct-savings",
                payee_id: null,
                payee_name: "Transfer : Savings",
                category_id: null,
                category_name: null,
                account_id: "acct-checking",
                account_name: "Checking",
                approved: true,
                cleared: "cleared",
              },
            ],
          },
        }),
      },
    };

    const result = await SearchTransactionsTool.execute({
      planId: "plan-1",
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      payeeId: "payee-food",
      approved: false,
      cleared: "uncleared",
      minAmount: -30000,
      maxAmount: -1000,
      includeTransfers: false,
      limit: 1,
      fields: ["date", "amount", "account_name"],
      includeIds: false,
      sort: "date_desc",
    }, api as any);

    expect(api.transactions.getTransactions).toHaveBeenCalledWith("plan-1", "2026-03-01", undefined, undefined);
    expect(parseText(result as any)).toEqual({
      transactions: [
        {
          date: "2026-03-06",
          amount: "-4.50",
          account_name: "Credit Card",
        },
      ],
      match_count: 2,
      returned_count: 1,
      offset: 0,
      limit: 1,
      has_more: true,
      next_offset: 1,
      filters: {
        from_date: "2026-03-01",
        to_date: "2026-03-31",
        payee_id: "payee-food",
        approved: false,
        cleared: "uncleared",
        min_amount: "-30.00",
        max_amount: "-1.00",
        include_transfers: false,
        sort: "date_desc",
      },
    });
  });

  it("supports bounded projected account transaction listings", async () => {
    const api = {
      transactions: {
        getTransactionsByAccount: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              {
                id: "tx-1",
                date: "2026-03-01",
                amount: -1000,
                deleted: false,
                payee_name: "Coffee Shop",
                category_name: "Coffee",
                account_name: "Checking",
                approved: true,
                cleared: "cleared",
              },
              {
                id: "tx-2",
                date: "2026-03-02",
                amount: -2500,
                deleted: false,
                payee_name: "Grocer",
                category_name: "Groceries",
                account_name: "Checking",
                approved: false,
                cleared: "uncleared",
              },
              {
                id: "tx-3",
                date: "2026-03-03",
                amount: -4000,
                deleted: false,
                payee_name: "Utility Co",
                category_name: "Utilities",
                account_name: "Checking",
                approved: true,
                cleared: "cleared",
              },
            ],
          },
        }),
      },
    };

    const result = await GetTransactionsByAccountTool.execute({
      planId: "plan-1",
      accountId: "acct-1",
      limit: 1,
      offset: 1,
      includeIds: false,
      fields: ["date", "amount", "payee_name"],
    }, api as any);

    expect(api.transactions.getTransactionsByAccount).toHaveBeenCalledWith(
      "plan-1",
      "acct-1",
      undefined,
      undefined,
      undefined,
    );
    expect(parseText(result as any)).toEqual({
      transactions: [
        {
          date: "2026-03-02",
          amount: "-2.50",
          payee_name: "Grocer",
        },
      ],
      transaction_count: 3,
      returned_count: 1,
      offset: 1,
      limit: 1,
      has_more: true,
      next_offset: 2,
    });
  });
});
