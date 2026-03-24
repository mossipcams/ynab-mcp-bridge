import { afterEach, describe, expect, it, vi } from "vitest";

import * as GetAccountTool from "./tools/GetAccountTool.js";
import * as GetCategoryTool from "./tools/GetCategoryTool.js";
import * as GetMoneyMovementGroupsTool from "./tools/GetMoneyMovementGroupsTool.js";
import * as GetMoneyMovementGroupsByMonthTool from "./tools/GetMoneyMovementGroupsByMonthTool.js";
import * as GetMoneyMovementsTool from "./tools/GetMoneyMovementsTool.js";
import * as GetMoneyMovementsByMonthTool from "./tools/GetMoneyMovementsByMonthTool.js";
import * as GetMonthCategoryTool from "./tools/GetMonthCategoryTool.js";
import * as GetPayeeLocationTool from "./tools/GetPayeeLocationTool.js";
import * as GetPayeeLocationsByPayeeTool from "./tools/GetPayeeLocationsByPayeeTool.js";
import * as GetPayeeTool from "./tools/GetPayeeTool.js";
import * as GetScheduledTransactionTool from "./tools/GetScheduledTransactionTool.js";
import * as GetTransactionTool from "./tools/GetTransactionTool.js";
import * as GetTransactionsByAccountTool from "./tools/GetTransactionsByAccountTool.js";
import * as GetTransactionsByCategoryTool from "./tools/GetTransactionsByCategoryTool.js";
import * as GetTransactionsByPayeeTool from "./tools/GetTransactionsByPayeeTool.js";
import * as GetTransactionsByMonthTool from "./tools/GetTransactionsByMonthTool.js";
import * as ListTransactionsTool from "./tools/ListTransactionsTool.js";
import * as ListAccountsTool from "./tools/ListAccountsTool.js";
import * as ListPayeeLocationsTool from "./tools/ListPayeeLocationsTool.js";
import * as ListPayeesTool from "./tools/ListPayeesTool.js";
import * as ListPlanCategoriesTool from "./tools/ListPlanCategoriesTool.js";
import * as ListScheduledTransactionsTool from "./tools/ListScheduledTransactionsTool.js";

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
              balance: 225000,
              goal_target: 900000,
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
        balance: "225.00",
        goal_target: "900.00",
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
              activity: -45000,
              balance: 75000,
              goal_under_funded: 15000,
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
        budgeted: "120.00",
        activity: "-45.00",
        balance: "75.00",
        goal_under_funded: "15.00",
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
              balance: 125000,
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
        balance: "125.00",
      },
    });
  });

  it("can still return the full account payload when explicitly requested", async () => {
    const api = {
      accounts: {
        getAccountById: vi.fn().mockResolvedValue({
          data: {
            account: {
              id: "acct-1",
              name: "Checking",
              note: "Primary account",
            },
          },
        }),
      },
    };

    const result = await GetAccountTool.execute({ planId: "plan-1", accountId: "acct-1", view: "full" }, api as any);

    expect(api.accounts.getAccountById).toHaveBeenCalledWith("plan-1", "acct-1");
    expect(parseText(result)).toEqual({
      account: {
        id: "acct-1",
        name: "Checking",
        note: "Primary account",
      },
    });
  });

  it("lists accounts for a plan", async () => {
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
                name: "Old Savings",
                type: "savings",
                deleted: true,
                closed: true,
                balance: 0,
              },
            ],
          },
        }),
      },
    };

    const result = await ListAccountsTool.execute({ planId: "plan-1" }, api as any);

    expect(api.accounts.getAccounts).toHaveBeenCalledWith("plan-1");
    expect(parseText(result)).toEqual({
      accounts: [
        {
          id: "acct-1",
          name: "Checking",
          type: "checking",
          closed: false,
          balance: "125.00",
        },
      ],
      account_count: 1,
    });
  });

  it("projects account fields without paginating when no limit or offset is provided", async () => {
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

    const result = await ListAccountsTool.execute(
      { planId: "plan-1", includeIds: false, fields: ["name", "balance"] },
      api as any,
    );

    expect(parseText(result as any)).toEqual({
      accounts: [
        {
          name: "Checking",
          balance: "125.00",
        },
        {
          name: "Savings",
          balance: "500.00",
        },
      ],
      account_count: 2,
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

  it("lists payees for a plan", async () => {
    const api = {
      payees: {
        getPayees: vi.fn().mockResolvedValue({
          data: {
            payees: [
              {
                id: "payee-1",
                name: "Landlord",
                deleted: false,
                transfer_account_id: null,
              },
              {
                id: "payee-2",
                name: "Deleted Payee",
                deleted: true,
                transfer_account_id: null,
              },
            ],
          },
        }),
      },
    };

    const result = await ListPayeesTool.execute({ planId: "plan-1" }, api as any);

    expect(api.payees.getPayees).toHaveBeenCalledWith("plan-1");
    expect(parseText(result)).toEqual({
      payees: [
        {
          id: "payee-1",
          name: "Landlord",
          transfer_account_id: null,
        },
      ],
      payee_count: 1,
    });
  });

  it("lists payee locations for a plan", async () => {
    const api = {
      payeeLocations: {
        getPayeeLocations: vi.fn().mockResolvedValue({
          data: {
            payee_locations: [
              {
                id: "location-1",
                payee_id: "payee-1",
                latitude: "41.8781",
                longitude: "-87.6298",
                deleted: false,
              },
              {
                id: "location-2",
                payee_id: "payee-1",
                latitude: "40.7128",
                longitude: "-74.0060",
                deleted: true,
              },
            ],
          },
        }),
      },
    };

    const result = await ListPayeeLocationsTool.execute({ planId: "plan-1" }, api as any);

    expect(api.payeeLocations.getPayeeLocations).toHaveBeenCalledWith("plan-1");
    expect(parseText(result)).toEqual({
      payee_locations: [
        {
          id: "location-1",
          payee_id: "payee-1",
          latitude: "41.8781",
          longitude: "-87.6298",
        },
      ],
      payee_location_count: 1,
    });
  });

  it("gets a single payee location", async () => {
    const api = {
      payeeLocations: {
        getPayeeLocationById: vi.fn().mockResolvedValue({
          data: {
            payee_location: {
              id: "location-1",
              payee_id: "payee-1",
              latitude: "41.8781",
              longitude: "-87.6298",
            },
          },
        }),
      },
    };

    const result = await GetPayeeLocationTool.execute(
      { planId: "plan-1", payeeLocationId: "location-1" },
      api as any,
    );

    expect(api.payeeLocations.getPayeeLocationById).toHaveBeenCalledWith("plan-1", "location-1");
    expect(parseText(result)).toEqual({
      payee_location: {
        id: "location-1",
        payee_id: "payee-1",
        latitude: "41.8781",
        longitude: "-87.6298",
      },
    });
  });

  it("gets payee locations for a specific payee", async () => {
    const api = {
      payeeLocations: {
        getPayeeLocationsByPayee: vi.fn().mockResolvedValue({
          data: {
            payee_locations: [
              {
                id: "location-1",
                payee_id: "payee-1",
                latitude: "41.8781",
                longitude: "-87.6298",
                deleted: false,
              },
              {
                id: "location-2",
                payee_id: "payee-1",
                latitude: "40.7128",
                longitude: "-74.0060",
                deleted: true,
              },
            ],
          },
        }),
      },
    };

    const result = await GetPayeeLocationsByPayeeTool.execute(
      { planId: "plan-1", payeeId: "payee-1" },
      api as any,
    );

    expect(api.payeeLocations.getPayeeLocationsByPayee).toHaveBeenCalledWith("plan-1", "payee-1");
    expect(parseText(result)).toEqual({
      payee_locations: [
        {
          id: "location-1",
          payee_id: "payee-1",
          latitude: "41.8781",
          longitude: "-87.6298",
        },
      ],
      payee_location_count: 1,
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

  it("gets all transactions and filters deleted rows", async () => {
    const api = {
      transactions: {
        getTransactions: vi.fn().mockResolvedValue({
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

    const result = await ListTransactionsTool.execute({ planId: "plan-1" }, api as any);

    expect(api.transactions.getTransactions).toHaveBeenCalledWith(
      "plan-1",
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

  it("gets a single transaction by id", async () => {
    const api = {
      transactions: {
        getTransactionById: vi.fn().mockResolvedValue({
          data: {
            transaction: {
              id: "txn-1",
              date: "2026-03-01",
              amount: -12500,
              payee_name: "Grocer",
              category_name: "Food",
              account_name: "Checking",
              approved: true,
              cleared: "cleared",
            },
          },
        }),
      },
    };

    const result = await GetTransactionTool.execute(
      { planId: "plan-1", transactionId: "txn-1" },
      api as any,
    );

    expect(api.transactions.getTransactionById).toHaveBeenCalledWith("plan-1", "txn-1");
    expect(parseText(result)).toEqual({
      transaction: {
        id: "txn-1",
        date: "2026-03-01",
        amount: "-12.50",
        payee_name: "Grocer",
        category_name: "Food",
        account_name: "Checking",
        approved: true,
        cleared: "cleared",
      },
    });
  });

  it("gets transactions by account and filters deleted rows", async () => {
    const api = {
      transactions: {
        getTransactionsByAccount: vi.fn().mockResolvedValue({
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
                deleted: true,
              },
            ],
          },
        }),
      },
    };

    const result = await GetTransactionsByAccountTool.execute(
      { planId: "plan-1", accountId: "acct-1" },
      api as any,
    );

    expect(api.transactions.getTransactionsByAccount).toHaveBeenCalledWith(
      "plan-1",
      "acct-1",
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

  it("gets transactions by category and filters deleted rows", async () => {
    const api = {
      transactions: {
        getTransactionsByCategory: vi.fn().mockResolvedValue({
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
                deleted: true,
              },
            ],
          },
        }),
      },
    };

    const result = await GetTransactionsByCategoryTool.execute(
      { planId: "plan-1", categoryId: "cat-1" },
      api as any,
    );

    expect(api.transactions.getTransactionsByCategory).toHaveBeenCalledWith(
      "plan-1",
      "cat-1",
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

  it("gets transactions by payee and filters deleted rows", async () => {
    const api = {
      transactions: {
        getTransactionsByPayee: vi.fn().mockResolvedValue({
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
                deleted: true,
              },
            ],
          },
        }),
      },
    };

    const result = await GetTransactionsByPayeeTool.execute(
      { planId: "plan-1", payeeId: "payee-1" },
      api as any,
    );

    expect(api.transactions.getTransactionsByPayee).toHaveBeenCalledWith(
      "plan-1",
      "payee-1",
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

  it("gets all money movements for a plan", async () => {
    const api = {
      moneyMovements: {
        getMoneyMovements: vi.fn().mockResolvedValue({
          data: {
            money_movements: [
              { id: "move-1", amount: 25000 },
            ],
          },
        }),
      },
    };

    const result = await GetMoneyMovementsTool.execute({ planId: "plan-1" }, api as any);

    expect(api.moneyMovements.getMoneyMovements).toHaveBeenCalledWith("plan-1");
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

  it("gets all money movement groups for a plan", async () => {
    const api = {
      moneyMovements: {
        getMoneyMovementGroups: vi.fn().mockResolvedValue({
          data: {
            money_movement_groups: [
              { id: "group-1", name: "Assigned in March" },
            ],
          },
        }),
      },
    };

    const result = await GetMoneyMovementGroupsTool.execute({ planId: "plan-1" }, api as any);

    expect(api.moneyMovements.getMoneyMovementGroups).toHaveBeenCalledWith("plan-1");
    expect(parseText(result)).toEqual({
      money_movement_groups: [{ id: "group-1", name: "Assigned in March" }],
      count: 1,
    });
  });

  it("lists scheduled transactions for a plan", async () => {
    const api = {
      scheduledTransactions: {
        getScheduledTransactions: vi.fn().mockResolvedValue({
          data: {
            scheduled_transactions: [
              {
                id: "sched-1",
                date_first: "2026-03-15",
                date_next: "2026-03-15",
                amount: -50000,
                payee_name: "Landlord",
                category_name: "Rent",
                account_name: "Checking",
                deleted: false,
              },
              {
                id: "sched-2",
                deleted: true,
              },
            ],
          },
        }),
      },
    };

    const result = await ListScheduledTransactionsTool.execute({ planId: "plan-1" }, api as any);

    expect(api.scheduledTransactions.getScheduledTransactions).toHaveBeenCalledWith("plan-1", undefined);
    expect(parseText(result)).toEqual({
      scheduled_transactions: [
        {
          id: "sched-1",
          date_first: "2026-03-15",
          date_next: "2026-03-15",
          amount: "-50.00",
          payee_name: "Landlord",
          category_name: "Rent",
          account_name: "Checking",
        },
      ],
      scheduled_transaction_count: 1,
    });
  });

  it("gets a single scheduled transaction by id", async () => {
    const api = {
      scheduledTransactions: {
        getScheduledTransactionById: vi.fn().mockResolvedValue({
          data: {
            scheduled_transaction: {
              id: "sched-1",
              date_first: "2026-03-15",
              date_next: "2026-03-15",
              amount: -50000,
              payee_name: "Landlord",
              category_name: "Rent",
              account_name: "Checking",
            },
          },
        }),
      },
    };

    const result = await GetScheduledTransactionTool.execute(
      { planId: "plan-1", scheduledTransactionId: "sched-1" },
      api as any,
    );

    expect(api.scheduledTransactions.getScheduledTransactionById).toHaveBeenCalledWith("plan-1", "sched-1");
    expect(parseText(result)).toEqual({
      scheduled_transaction: {
        id: "sched-1",
        date_first: "2026-03-15",
        date_next: "2026-03-15",
        amount: "-50.00",
        payee_name: "Landlord",
        category_name: "Rent",
        account_name: "Checking",
      },
    });
  });
});
