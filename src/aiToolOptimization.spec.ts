import { describe, expect, it, vi } from "vitest";

import * as ListAccountsTool from "./tools/ListAccountsTool.js";
import * as ListTransactionsTool from "./tools/ListTransactionsTool.js";
import * as SearchTransactionsTool from "./tools/SearchTransactionsTool.js";

function parseText(result: Awaited<ReturnType<typeof ListTransactionsTool.execute>>) {
  return JSON.parse(result.content[0].text);
}

describe("AI tool optimization", () => {
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
});
