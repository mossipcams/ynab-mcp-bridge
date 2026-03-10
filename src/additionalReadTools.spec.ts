import { afterEach, describe, expect, it, vi } from "vitest";

import * as GetAccountTool from "./tools/GetAccountTool.js";
import * as GetCategoryTool from "./tools/GetCategoryTool.js";
import * as GetMoneyMovementGroupsByMonthTool from "./tools/GetMoneyMovementGroupsByMonthTool.js";
import * as GetMoneyMovementsByMonthTool from "./tools/GetMoneyMovementsByMonthTool.js";
import * as GetMonthCategoryTool from "./tools/GetMonthCategoryTool.js";
import * as GetPayeeTool from "./tools/GetPayeeTool.js";
import * as GetTransactionsByMonthTool from "./tools/GetTransactionsByMonthTool.js";
import * as ListPlanCategoriesTool from "./tools/ListPlanCategoriesTool.js";

function parseText(result: Awaited<ReturnType<typeof GetAccountTool.execute>>) {
  return JSON.parse(result.content[0].text);
}

describe("additional read-only tools", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("lists category groups for a plan", async () => {
    const api = {
      categories: {
        getCategories: vi.fn().mockResolvedValue({
          data: {
            category_groups: [
              {
                id: "group-1",
                name: "Bills",
                hidden: false,
                deleted: false,
                categories: [
                  { id: "cat-1", name: "Rent", hidden: false, deleted: false },
                ],
              },
            ],
          },
        }),
      },
    };

    const result = await ListPlanCategoriesTool.execute({ planId: "plan-1" }, api as any);

    expect(api.categories.getCategories).toHaveBeenCalledWith("plan-1");
    expect(parseText(result)).toEqual({
      category_groups: [
        {
          id: "group-1",
          name: "Bills",
          categories: [{ id: "cat-1", name: "Rent" }],
        },
      ],
    });
  });

  it("gets a single category", async () => {
    const api = {
      categories: {
        getCategoryById: vi.fn().mockResolvedValue({
          data: {
            category: {
              id: "cat-1",
              name: "Rent",
            },
          },
        }),
      },
    };

    const result = await GetCategoryTool.execute({ planId: "plan-1", categoryId: "cat-1" }, api as any);

    expect(api.categories.getCategoryById).toHaveBeenCalledWith("plan-1", "cat-1");
    expect(parseText(result)).toEqual({
      category: {
        id: "cat-1",
        name: "Rent",
      },
    });
  });

  it("gets a single month category", async () => {
    const api = {
      categories: {
        getMonthCategoryById: vi.fn().mockResolvedValue({
          data: {
            category: {
              id: "cat-1",
              name: "Rent",
              budgeted: 120000,
            },
          },
        }),
      },
    };

    const result = await GetMonthCategoryTool.execute(
      { planId: "plan-1", month: "2026-03-01", categoryId: "cat-1" },
      api as any,
    );

    expect(api.categories.getMonthCategoryById).toHaveBeenCalledWith("plan-1", "2026-03-01", "cat-1");
    expect(parseText(result)).toEqual({
      category: {
        id: "cat-1",
        name: "Rent",
        budgeted: 120000,
      },
    });
  });

  it("gets a single account", async () => {
    const api = {
      accounts: {
        getAccountById: vi.fn().mockResolvedValue({
          data: {
            account: {
              id: "acct-1",
              name: "Checking",
            },
          },
        }),
      },
    };

    const result = await GetAccountTool.execute({ planId: "plan-1", accountId: "acct-1" }, api as any);

    expect(api.accounts.getAccountById).toHaveBeenCalledWith("plan-1", "acct-1");
    expect(parseText(result)).toEqual({
      account: {
        id: "acct-1",
        name: "Checking",
      },
    });
  });

  it("gets a single payee", async () => {
    const api = {
      payees: {
        getPayeeById: vi.fn().mockResolvedValue({
          data: {
            payee: {
              id: "payee-1",
              name: "Landlord",
            },
          },
        }),
      },
    };

    const result = await GetPayeeTool.execute({ planId: "plan-1", payeeId: "payee-1" }, api as any);

    expect(api.payees.getPayeeById).toHaveBeenCalledWith("plan-1", "payee-1");
    expect(parseText(result)).toEqual({
      payee: {
        id: "payee-1",
        name: "Landlord",
      },
    });
  });

  it("gets transactions by month and filters deleted rows", async () => {
    const api = {
      transactions: {
        getTransactionsByMonth: vi.fn().mockResolvedValue({
          data: {
            transactions: [
              {
                id: "txn-1",
                date: "2026-03-01",
                amount: -12500,
                payee_name: "Grocer",
                category_name: "Food",
                account_name: "Checking",
                approved: true,
                cleared: "cleared",
                deleted: false,
              },
              {
                id: "txn-2",
                date: "2026-03-02",
                amount: -5000,
                deleted: true,
              },
            ],
          },
        }),
      },
    };

    const result = await GetTransactionsByMonthTool.execute(
      { planId: "plan-1", month: "2026-03-01" },
      api as any,
    );

    expect(api.transactions.getTransactionsByMonth).toHaveBeenCalledWith(
      "plan-1",
      "2026-03-01",
      undefined,
      undefined,
      undefined,
    );
    expect(parseText(result)).toEqual({
      transactions: [
        {
          id: "txn-1",
          date: "2026-03-01",
          amount: "-12.50",
          payee_name: "Grocer",
          category_name: "Food",
          account_name: "Checking",
          approved: true,
          cleared: "cleared",
        },
      ],
      transaction_count: 1,
    });
  });

  it("gets money movements by month", async () => {
    const api = {
      moneyMovements: {
        getMoneyMovementsByMonth: vi.fn().mockResolvedValue({
          data: {
            money_movements: [
              { id: "move-1", amount: 25000 },
            ],
          },
        }),
      },
    };

    const result = await GetMoneyMovementsByMonthTool.execute(
      { planId: "plan-1", month: "2026-03-01" },
      api as any,
    );

    expect(api.moneyMovements.getMoneyMovementsByMonth).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(parseText(result)).toEqual({
      money_movements: [{ id: "move-1", amount: 25000 }],
      count: 1,
    });
  });

  it("gets money movement groups by month", async () => {
    const api = {
      moneyMovements: {
        getMoneyMovementGroupsByMonth: vi.fn().mockResolvedValue({
          data: {
            money_movement_groups: [
              { id: "group-1", name: "Assigned in March" },
            ],
          },
        }),
      },
    };

    const result = await GetMoneyMovementGroupsByMonthTool.execute(
      { planId: "plan-1", month: "2026-03-01" },
      api as any,
    );

    expect(api.moneyMovements.getMoneyMovementGroupsByMonth).toHaveBeenCalledWith("plan-1", "2026-03-01");
    expect(parseText(result)).toEqual({
      money_movement_groups: [{ id: "group-1", name: "Assigned in March" }],
      count: 1,
    });
  });
});
