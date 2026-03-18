import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createServer, registerServerTools } from "./server.js";

describe("createServer", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("registers the rebuilt read-only YNAB toolset", () => {
    const server = createServer({
      apiToken: "test-token",
    });
    const registeredTools = Object.keys((server as any)._registeredTools);

    expect(registeredTools).toHaveLength(39);
    expect(registeredTools).toEqual(
      expect.arrayContaining([
        "ynab_get_mcp_version",
        "ynab_get_user",
        "ynab_list_plans",
        "ynab_get_plan",
        "ynab_get_plan_settings",
        "ynab_get_plan_month",
        "ynab_list_plan_months",
        "ynab_list_categories",
        "ynab_get_category",
        "ynab_get_month_category",
        "ynab_list_transactions",
        "ynab_get_transactions_by_month",
        "ynab_get_transaction",
        "ynab_get_transactions_by_account",
        "ynab_get_transactions_by_category",
        "ynab_get_transactions_by_payee",
        "ynab_list_scheduled_transactions",
        "ynab_get_scheduled_transaction",
        "ynab_list_accounts",
        "ynab_get_account",
        "ynab_list_payees",
        "ynab_get_payee",
        "ynab_list_payee_locations",
        "ynab_get_payee_location",
        "ynab_get_payee_locations_by_payee",
        "ynab_get_money_movements",
        "ynab_get_money_movements_by_month",
        "ynab_get_money_movement_groups",
        "ynab_get_money_movement_groups_by_month",
        "ynab_get_financial_snapshot",
        "ynab_get_spending_summary",
        "ynab_get_cash_flow_summary",
        "ynab_get_budget_health_summary",
        "ynab_get_upcoming_obligations",
        "ynab_get_goal_progress_summary",
        "ynab_get_budget_cleanup_summary",
        "ynab_get_income_summary",
        "ynab_get_category_trend_summary",
        "ynab_get_70_20_10_summary",
      ]),
    );
  });

  it("registers the toolset through a reusable SDK-native registrar", () => {
    const registerTool = vi.fn();

    const registeredToolNames = registerServerTools(
      {
        registerTool,
      },
      {} as any,
    );

    expect(registeredToolNames).toHaveLength(39);
    expect(registeredToolNames).toEqual([
      "ynab_get_mcp_version",
      "ynab_get_user",
      "ynab_list_plans",
      "ynab_get_plan",
      "ynab_get_plan_settings",
      "ynab_get_plan_month",
      "ynab_list_plan_months",
      "ynab_list_categories",
      "ynab_get_category",
      "ynab_get_month_category",
      "ynab_list_transactions",
      "ynab_get_transactions_by_month",
      "ynab_get_transaction",
      "ynab_get_transactions_by_account",
      "ynab_get_transactions_by_category",
      "ynab_get_transactions_by_payee",
      "ynab_list_scheduled_transactions",
      "ynab_get_scheduled_transaction",
      "ynab_list_accounts",
      "ynab_get_account",
      "ynab_list_payees",
      "ynab_get_payee",
      "ynab_list_payee_locations",
      "ynab_get_payee_location",
      "ynab_get_payee_locations_by_payee",
      "ynab_get_money_movements",
      "ynab_get_money_movements_by_month",
      "ynab_get_money_movement_groups",
      "ynab_get_money_movement_groups_by_month",
      "ynab_get_financial_snapshot",
      "ynab_get_spending_summary",
      "ynab_get_cash_flow_summary",
      "ynab_get_budget_health_summary",
      "ynab_get_upcoming_obligations",
      "ynab_get_goal_progress_summary",
      "ynab_get_budget_cleanup_summary",
      "ynab_get_income_summary",
      "ynab_get_category_trend_summary",
      "ynab_get_70_20_10_summary",
    ]);
    expect(registerTool).toHaveBeenCalledTimes(39);
    expect(registerTool).toHaveBeenCalledWith(
      "ynab_get_mcp_version",
      expect.objectContaining({
        title: "Get MCP Version",
        description: expect.any(String),
        inputSchema: expect.any(Object),
      }),
      expect.any(Function),
    );
    expect(registerTool).toHaveBeenCalledWith(
      "ynab_get_70_20_10_summary",
      expect.objectContaining({
        title: "Get 70/20/10 Summary",
      }),
      expect.any(Function),
    );
  });

  it("defines an explicit tool registry instead of passing whole tool modules around", () => {
    const source = readFileSync(new URL("./server.ts", import.meta.url), "utf8");

    expect(source).toContain("name: GetMcpVersionTool.name");
    expect(source).toContain("GetAccountTool.execute(");
    expect(source).not.toContain("module: GetAccountTool");
    expect(source).not.toContain("module.execute");
  });

  it("requires explicit config instead of reading the API token from environment", () => {
    process.env = { ...originalEnv, YNAB_API_TOKEN: "env-token" };

    expect(() => (createServer as any)()).toThrow("YNAB config is required.");
  });

  it("applies explicit plan config even when a custom API client is injected", async () => {
    const calls: Array<[string, ...string[]]> = [];
    const api = {
      plans: {
        getPlanById: async (planId: string) => {
          calls.push(["getPlanById", planId]);
          return {
            data: {
              plan: {
                id: planId,
              },
            },
          };
        },
        getPlans: async () => {
          calls.push(["getPlans"]);
          return {
            data: {
              plans: [
                { id: "plan-1" },
                { id: "plan-2" },
              ],
              default_plan: null,
            },
          };
        },
      },
    };

    const server = createServer({
      apiToken: "test-token",
      planId: "plan-1",
    }, api as any);

    const result = await (server as any)._registeredTools.ynab_get_plan.handler({});

    expect(JSON.parse(result.content[0].text)).toEqual({
      plan: {
        id: "plan-1",
      },
    });
    expect(calls).toEqual([
      ["getPlanById", "plan-1"],
    ]);
  });
});
