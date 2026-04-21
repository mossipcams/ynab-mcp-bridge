import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as GetTransactionsByAccountTool from "./features/transactions/GetTransactionsByAccountTool.js";
import * as GetTransactionsByCategoryTool from "./features/transactions/GetTransactionsByCategoryTool.js";
import * as GetTransactionsByMonthTool from "./features/transactions/GetTransactionsByMonthTool.js";
import * as GetTransactionsByPayeeTool from "./features/transactions/GetTransactionsByPayeeTool.js";
import * as ListTransactionsTool from "./features/transactions/ListTransactionsTool.js";
import * as SearchTransactionsTool from "./features/transactions/SearchTransactionsTool.js";

type ToolResult = {
  content: Array<{
    text: string;
  }>;
};

const sharedTransactions = [
  {
    id: "txn-older",
    date: "2024-02-10",
    amount: 1000,
    payee_name: "Older",
    category_name: "Groceries",
    account_name: "Checking",
    approved: true,
    cleared: "cleared",
    deleted: false,
  },
  {
    id: "txn-newest",
    date: "2024-04-01",
    amount: 4000,
    payee_name: "Newest",
    category_name: "Dining",
    account_name: "Checking",
    approved: false,
    cleared: "uncleared",
    deleted: false,
  },
  {
    id: "txn-middle",
    date: "2024-03-05",
    amount: 3000,
    payee_name: "Middle",
    category_name: "Fuel",
    account_name: "Savings",
    approved: true,
    cleared: "cleared",
    deleted: false,
  },
  {
    id: "txn-deleted",
    date: "2024-05-15",
    amount: 9000,
    payee_name: "Deleted",
    category_name: "Ignore",
    account_name: "Checking",
    approved: true,
    cleared: "cleared",
    deleted: true,
  },
] as const;

function readResult(result: ToolResult) {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe("transaction tool family", () => {
  it("keeps list and search transaction pagination and projection aligned", async () => {
    const api = {
      transactions: {
        async getTransactions() {
          return {
            data: {
              transactions: sharedTransactions,
            },
          };
        },
      },
    };

    const listResult = readResult(await ListTransactionsTool.execute({
      planId: "plan-1",
      fields: ["date", "amount"],
      includeIds: false,
      limit: 2,
      offset: 1,
    }, api as never) as ToolResult);
    const searchResult = readResult(await SearchTransactionsTool.execute({
      planId: "plan-1",
      fields: ["date", "amount"],
      includeIds: false,
      includeTransfers: true,
      limit: 2,
      offset: 1,
    }, api as never) as ToolResult);

    expect(listResult).toMatchObject({
      transactions: [
        {
          date: "2024-03-05",
          amount: "3.00",
        },
        {
          date: "2024-02-10",
          amount: "1.00",
        },
      ],
      transaction_count: 3,
      returned_count: 2,
      offset: 1,
      limit: 2,
      has_more: false,
    });
    expect(searchResult).toMatchObject({
      transactions: [
        {
          date: "2024-03-05",
          amount: "3.00",
        },
        {
          date: "2024-02-10",
          amount: "1.00",
        },
      ],
      match_count: 3,
      returned_count: 2,
      offset: 1,
      limit: 2,
      has_more: false,
    });
  });

  it("keeps the by-month, by-account, by-category, and by-payee transaction views on the same row contract", async () => {
    const api = {
      transactions: {
        async getTransactionsByAccount() {
          return {
            data: {
              transactions: sharedTransactions,
            },
          };
        },
        async getTransactionsByCategory() {
          return {
            data: {
              transactions: sharedTransactions,
            },
          };
        },
        async getTransactionsByMonth() {
          return {
            data: {
              transactions: sharedTransactions,
            },
          };
        },
        async getTransactionsByPayee() {
          return {
            data: {
              transactions: sharedTransactions,
            },
          };
        },
      },
    };

    const expectedTransactions = [
      {
        date: "2024-04-01",
        amount: "4.00",
        payee_name: "Newest",
        category_name: "Dining",
      },
      {
        date: "2024-03-05",
        amount: "3.00",
        payee_name: "Middle",
        category_name: "Fuel",
      },
      {
        date: "2024-02-10",
        amount: "1.00",
        payee_name: "Older",
        category_name: "Groceries",
      },
    ];

    const byMonthResult = readResult(await GetTransactionsByMonthTool.execute({
      month: "2024-04-01",
      planId: "plan-1",
    }, api as never) as ToolResult);
    const byAccountResult = readResult(await GetTransactionsByAccountTool.execute({
      accountId: "account-1",
      planId: "plan-1",
    }, api as never) as ToolResult);
    const byCategoryResult = readResult(await GetTransactionsByCategoryTool.execute({
      categoryId: "category-1",
      planId: "plan-1",
    }, api as never) as ToolResult);
    const byPayeeResult = readResult(await GetTransactionsByPayeeTool.execute({
      payeeId: "payee-1",
      planId: "plan-1",
    }, api as never) as ToolResult);

    for (const result of [byMonthResult, byAccountResult, byCategoryResult, byPayeeResult]) {
      expect(result).toEqual({
        transactions: expectedTransactions,
        transaction_count: 3,
        returned_count: 3,
        offset: 0,
        limit: 20,
        has_more: false,
      });
    }
  });

  it("does not eagerly format every listed transaction before pagination trims the result", async () => {
    let formattedAmounts = 0;
    const api = {
      transactions: {
        async getTransactions() {
          return {
            data: {
              transactions: [
                {
                  id: "txn-1",
                  date: "2024-04-03",
                  get amount() {
                    formattedAmounts += 1;
                    return 1000;
                  },
                  payee_name: "One",
                  category_name: "Groceries",
                  account_name: "Checking",
                  approved: true,
                  cleared: "cleared",
                  deleted: false,
                },
                {
                  id: "txn-2",
                  date: "2024-04-02",
                  get amount() {
                    formattedAmounts += 1;
                    return 2000;
                  },
                  payee_name: "Two",
                  category_name: "Dining",
                  account_name: "Checking",
                  approved: true,
                  cleared: "cleared",
                  deleted: false,
                },
                {
                  id: "txn-3",
                  date: "2024-04-01",
                  get amount() {
                    formattedAmounts += 1;
                    return 3000;
                  },
                  payee_name: "Three",
                  category_name: "Fuel",
                  account_name: "Checking",
                  approved: true,
                  cleared: "cleared",
                  deleted: false,
                },
              ],
            },
          };
        },
      },
    };

    const result = readResult(await ListTransactionsTool.execute({
      planId: "plan-1",
      limit: 1,
      offset: 0,
    }, api as never) as ToolResult);

    expect(result).toMatchObject({
      transactions: [
        expect.objectContaining({
          date: "2024-04-03",
          amount: "1.00",
        }),
      ],
      transaction_count: 3,
      returned_count: 1,
    });
    expect(formattedAmounts).toBe(1);
  });

  it("does not eagerly format every searched transaction before pagination trims the result", async () => {
    let formattedAmounts = 0;
    const api = {
      transactions: {
        async getTransactions() {
          return {
            data: {
              transactions: [
                {
                  id: "txn-1",
                  date: "2024-04-03",
                  get amount() {
                    formattedAmounts += 1;
                    return -1000;
                  },
                  payee_id: "payee-1",
                  payee_name: "One",
                  category_name: "Groceries",
                  account_name: "Checking",
                  approved: true,
                  cleared: "cleared",
                  deleted: false,
                },
                {
                  id: "txn-2",
                  date: "2024-04-02",
                  get amount() {
                    formattedAmounts += 1;
                    return -2000;
                  },
                  payee_id: "payee-1",
                  payee_name: "Two",
                  category_name: "Dining",
                  account_name: "Checking",
                  approved: true,
                  cleared: "cleared",
                  deleted: false,
                },
                {
                  id: "txn-3",
                  date: "2024-04-01",
                  get amount() {
                    formattedAmounts += 1;
                    return -3000;
                  },
                  payee_id: "payee-1",
                  payee_name: "Three",
                  category_name: "Fuel",
                  account_name: "Checking",
                  approved: true,
                  cleared: "cleared",
                  deleted: false,
                },
              ],
            },
          };
        },
      },
    };

    const result = readResult(await SearchTransactionsTool.execute({
      planId: "plan-1",
      payeeId: "payee-1",
      includeTransfers: true,
      limit: 1,
      offset: 0,
    }, api as never) as ToolResult);

    expect(result).toMatchObject({
      transactions: [
        expect.objectContaining({
          id: "txn-1",
          amount: "-1.00",
        }),
      ],
      match_count: 3,
      returned_count: 1,
    });
    expect(formattedAmounts).toBe(1);
  });

  it("keeps the transaction query helper surface slim inside the transactions slice", () => {
    const searchToolSource = readFileSync(new URL("./features/transactions/SearchTransactionsTool.ts", import.meta.url), "utf8");
    const transactionToolUtilsSource = readFileSync(new URL("./features/transactions/transactionToolUtils.ts", import.meta.url), "utf8");
    const transactionQueryUtilsPath = new URL("./tools/transactionQueryUtils.ts", import.meta.url);

    expect(searchToolSource).toContain('from "./transactionQueryEngine.js"');
    expect(searchToolSource).not.toContain("function matchesFilters(");
    expect(searchToolSource).not.toContain("function compareTransactions(");
    expect(transactionToolUtilsSource).toContain('export { transactionFields, toDisplayTransactions } from "./transactionQueryEngine.js";');
    expect(() => readFileSync(transactionQueryUtilsPath, "utf8")).toThrow();
  });
});
