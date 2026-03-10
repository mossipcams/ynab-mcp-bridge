import { describe, expect, it } from "vitest";
import { createYnabApi } from "./ynabApi.js";

describe("YNAB SDK v4 contract", () => {
  it("exposes the plan-aligned API surface used by the rebuilt MCP", () => {
    const api = createYnabApi("test-token") as any;

    expect(api.plans).toBeDefined();
    expect(typeof api.plans.getPlans).toBe("function");
    expect(typeof api.plans.getPlanById).toBe("function");
    expect(typeof api.plans.getPlanSettingsById).toBe("function");
    expect(api.budgets).toBeUndefined();

    expect(api.user).toBeDefined();
    expect(typeof api.user.getUser).toBe("function");

    expect(api.months).toBeDefined();
    expect(typeof api.months.getPlanMonth).toBe("function");
    expect(api.months.getBudgetMonth).toBeUndefined();
    expect(api.months.getBudgetMonths).toBeUndefined();

    expect(api.payeeLocations).toBeDefined();
    expect(typeof api.payeeLocations.getPayeeLocations).toBe("function");
    expect(typeof api.payeeLocations.getPayeeLocationById).toBe("function");
    expect(typeof api.payeeLocations.getPayeeLocationsByPayee).toBe("function");

    expect(api.transactions).toBeDefined();
    expect(typeof api.transactions.getTransactionsByMonth).toBe("function");

    expect(api.scheduledTransactions).toBeDefined();
    expect(typeof api.scheduledTransactions.getScheduledTransactions).toBe("function");
    expect(typeof api.scheduledTransactions.getScheduledTransactionById).toBe("function");

    expect(api.moneyMovements).toBeDefined();
    expect(typeof api.moneyMovements.getMoneyMovements).toBe("function");
    expect(typeof api.moneyMovements.getMoneyMovementsByMonth).toBe("function");
    expect(typeof api.moneyMovements.getMoneyMovementGroups).toBe("function");
    expect(typeof api.moneyMovements.getMoneyMovementGroupsByMonth).toBe("function");
  });
});
