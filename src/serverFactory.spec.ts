import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";

describe("createServer", () => {
  it("registers the rebuilt read-only YNAB toolset", () => {
    const server = createServer();
    const registeredTools = Object.keys((server as any)._registeredTools);

    expect(registeredTools).toHaveLength(13);
    expect(registeredTools).toEqual(
      expect.arrayContaining([
        "ynab_get_mcp_version",
        "ynab_list_plans",
        "ynab_get_plan",
        "ynab_get_plan_settings",
        "ynab_get_plan_month",
        "ynab_list_categories",
        "ynab_get_category",
        "ynab_get_month_category",
        "ynab_get_transactions_by_month",
        "ynab_get_account",
        "ynab_get_payee",
        "ynab_get_money_movements_by_month",
        "ynab_get_money_movement_groups_by_month",
      ]),
    );
  });
});
