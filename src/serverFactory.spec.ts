import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";

import { setLoggerDestinationForTests } from "./logger.js";
import { runWithRequestContext } from "./requestContext.js";
import { createServer, defineTool, registerServerTools } from "./serverRuntime.js";
import { attachYnabApiRuntimeContext } from "./ynabApi.js";
import * as GetMcpVersionTool from "./tools/GetMcpVersionTool.js";

describe("createServer", () => {
  const originalEnv = process.env;

  function createBufferedDestination() {
    const destination = new PassThrough();
    const chunks: string[] = [];

    destination.on("data", (chunk) => {
      chunks.push(chunk.toString("utf8"));
    });

    return {
      destination,
      readEntries() {
        return chunks
          .join("")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Record<string, unknown>);
      },
    };
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setLoggerDestinationForTests();
  });

  it("registers the rebuilt read-only YNAB toolset", () => {
    const server = createServer({
      apiToken: "test-token",
    });
    const registeredTools = Object.keys((server as any)._registeredTools);

    expect(registeredTools).toHaveLength(47);
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
        "ynab_search_transactions",
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
        "ynab_get_monthly_review",
        "ynab_get_net_worth_trajectory",
        "ynab_get_financial_snapshot",
        "ynab_get_financial_health_check",
        "ynab_get_spending_summary",
        "ynab_get_spending_anomalies",
        "ynab_get_cash_flow_summary",
        "ynab_get_cash_runway",
        "ynab_get_budget_health_summary",
        "ynab_get_upcoming_obligations",
        "ynab_get_goal_progress_summary",
        "ynab_get_budget_cleanup_summary",
        "ynab_get_income_summary",
        "ynab_get_emergency_fund_coverage",
        "ynab_get_debt_summary",
        "ynab_get_recurring_expense_summary",
        "ynab_get_category_trend_summary",
      ]),
    );
  });

  it("advertises discovery resources for callable YNAB tools", () => {
    const server = createServer({
      apiToken: "test-token",
    });

    expect(server.server.getCapabilities()).toEqual(expect.objectContaining({
      resources: {
        listChanged: true,
      },
    }));

    const registeredResources = Object.values((server as any)._registeredResources) as Array<{ name: string }>;

    expect(registeredResources.length).toBeGreaterThan(0);
    expect(registeredResources.map((resource) => resource.name)).toEqual(expect.arrayContaining([
      "ynab_list_categories",
      "ynab_list_accounts",
    ]));
  });

  it("serializes readable discovery metadata for affected YNAB tools", async () => {
    const server = createServer({
      apiToken: "test-token",
    });
    const registeredResources = (server as any)._registeredResources as Record<string, {
      metadata: { mimeType?: string };
      name: string;
      readCallback: (uri: URL, extra: unknown) => Promise<{ contents: Array<{ text: string }> }>;
    }>;

    const categoryEntry = Object.entries(registeredResources).find(([, resource]) => resource.name === "ynab_list_categories");
    const accountEntry = Object.entries(registeredResources).find(([, resource]) => resource.name === "ynab_list_accounts");

    expect(categoryEntry).toBeDefined();
    expect(accountEntry).toBeDefined();

    const [categoryUri, categoryResource] = categoryEntry!;
    const [accountUri, accountResource] = accountEntry!;
    const categoryPayload = JSON.parse((await categoryResource.readCallback(new URL(categoryUri), {})).contents[0].text);
    const accountPayload = JSON.parse((await accountResource.readCallback(new URL(accountUri), {})).contents[0].text);

    expect(categoryResource.metadata.mimeType).toBe("application/json");
    expect(accountResource.metadata.mimeType).toBe("application/json");
    expect(categoryPayload).toEqual(expect.objectContaining({
      annotations: expect.objectContaining({
        readOnlyHint: true,
      }),
      inputSchema: expect.anything(),
      title: "List Categories",
      toolName: "ynab_list_categories",
    }));
    expect(accountPayload).toEqual(expect.objectContaining({
      annotations: expect.objectContaining({
        readOnlyHint: true,
      }),
      inputSchema: expect.anything(),
      title: "List Accounts",
      toolName: "ynab_list_accounts",
    }));
  });

  it("registers a compatibility URI alias for each discovery resource without changing its metadata contract", async () => {
    const server = createServer(
      {
        apiToken: "test-token",
      },
      undefined,
      {
        discoveryResourceBaseUrl: "https://mcp.example.com/mcp/resources/",
      },
    );
    const registeredResources = (server as any)._registeredResources as Record<string, {
      name: string;
      readCallback: (uri: URL, extra: unknown) => Promise<{ contents: Array<{ text: string }> }>;
    }>;

    const categoryEntries = Object.entries(registeredResources)
      .filter(([, resource]) => resource.name === "ynab_list_categories");

    expect(categoryEntries.map(([uri]) => uri)).toEqual(expect.arrayContaining([
      "ynab-tool://ynab_list_categories",
      "https://mcp.example.com/mcp/resources/ynab_list_categories",
    ]));

    const payloads = await Promise.all(categoryEntries.map(async ([uri, resource]) => (
      JSON.parse((await resource.readCallback(new URL(uri), {})).contents[0].text) as Record<string, unknown>
    )));

    expect(payloads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "List Categories",
        toolName: "ynab_list_categories",
      }),
    ]));
    expect(new Set(payloads.map((payload) => JSON.stringify({
      annotations: payload.annotations,
      argumentExamples: payload.argumentExamples,
      description: payload.description,
      inputSchema: payload.inputSchema,
      invocationExample: payload.invocationExample,
      requiredArguments: payload.requiredArguments,
      title: payload.title,
      toolName: payload.toolName,
    })))).toHaveLength(1);
  });

  it("adds explicit required-argument guidance for strict-input discovery tools", async () => {
    const server = createServer(
      {
        apiToken: "test-token",
      },
      undefined,
      {
        discoveryResourceBaseUrl: "https://mcp.example.com/mcp/resources/",
      },
    );
    const registeredResources = (server as any)._registeredResources as Record<string, {
      name: string;
      readCallback: (uri: URL, extra: unknown) => Promise<{ contents: Array<{ text: string }> }>;
    }>;

    const strictToolNames = [
      "ynab_get_month_category",
      "ynab_get_net_worth_trajectory",
      "ynab_get_spending_anomalies",
    ] as const;

    for (const toolName of strictToolNames) {
      const entry = Object.entries(registeredResources)
        .find(([, resource]) => resource.name === toolName);

      expect(entry).toBeDefined();

      const [uri, resource] = entry!;
      const payload = JSON.parse((await resource.readCallback(new URL(uri), {})).contents[0].text) as Record<string, unknown>;

      expect(payload).toEqual(expect.objectContaining({
        toolName,
        requiredArguments: expect.any(Array),
        argumentExamples: expect.any(Object),
        invocationExample: expect.any(Object),
      }));
    }

    const monthCategoryEntry = Object.entries(registeredResources)
      .find(([, resource]) => resource.name === "ynab_get_month_category");
    const [monthCategoryUri, monthCategoryResource] = monthCategoryEntry!;
    const monthCategoryPayload = JSON.parse(
      (await monthCategoryResource.readCallback(new URL(monthCategoryUri), {})).contents[0].text,
    ) as Record<string, unknown>;

    expect(monthCategoryPayload.requiredArguments).toEqual(["month", "categoryId"]);
    expect(monthCategoryPayload.argumentExamples).toEqual(expect.objectContaining({
      month: "2026-03-01",
      categoryId: "category-123",
    }));
  });

  it("uses concrete date and id examples for the remaining flaky discovery tools", async () => {
    const server = createServer(
      {
        apiToken: "test-token",
      },
      undefined,
      {
        discoveryResourceBaseUrl: "https://mcp.example.com/mcp/resources/",
      },
    );
    const registeredResources = (server as any)._registeredResources as Record<string, {
      name: string;
      readCallback: (uri: URL, extra: unknown) => Promise<{ contents: Array<{ text: string }> }>;
    }>;

    async function readResourcePayload(toolName: string) {
      const entry = Object.entries(registeredResources)
        .find(([, resource]) => resource.name === toolName);

      expect(entry).toBeDefined();

      const [uri, resource] = entry!;
      return JSON.parse((await resource.readCallback(new URL(uri), {})).contents[0].text) as Record<string, unknown>;
    }

    const monthCategoryPayload = await readResourcePayload("ynab_get_month_category");
    const netWorthPayload = await readResourcePayload("ynab_get_net_worth_trajectory");
    const payeeLocationPayload = await readResourcePayload("ynab_get_payee_location");

    expect(monthCategoryPayload.invocationExample).toEqual({
      month: "2026-03-01",
      categoryId: "category-123",
      view: "compact",
    });
    expect(netWorthPayload.argumentExamples).toEqual({
      fromMonth: "2026-01-01",
      toMonth: "2026-03-01",
    });
    expect(netWorthPayload.invocationExample).toEqual({});
    expect(payeeLocationPayload).toEqual(expect.objectContaining({
      toolName: "ynab_get_payee_location",
      requiredArguments: ["payeeLocationId"],
      argumentExamples: {
        payeeLocationId: "payee-location-123",
      },
      invocationExample: {
        payeeLocationId: "payee-location-123",
      },
    }));
  });

  it("aligns net-worth trajectory discovery guidance with the tool schema", async () => {
    const server = createServer(
      {
        apiToken: "test-token",
      },
      undefined,
      {
        discoveryResourceBaseUrl: "https://mcp.example.com/mcp/resources/",
      },
    );
    const registeredResources = (server as any)._registeredResources as Record<string, {
      name: string;
      readCallback: (uri: URL, extra: unknown) => Promise<{ contents: Array<{ text: string }> }>;
    }>;

    const netWorthEntry = Object.entries(registeredResources)
      .find(([, resource]) => resource.name === "ynab_get_net_worth_trajectory");

    expect(netWorthEntry).toBeDefined();

    const [netWorthUri, netWorthResource] = netWorthEntry!;
    const netWorthPayload = JSON.parse(
      (await netWorthResource.readCallback(new URL(netWorthUri), {})).contents[0].text,
    ) as Record<string, unknown>;

    expect(netWorthPayload).toEqual(expect.objectContaining({
      toolName: "ynab_get_net_worth_trajectory",
      requiredArguments: [],
      argumentExamples: {
        fromMonth: "2026-01-01",
        toMonth: "2026-03-01",
      },
      invocationExample: {},
    }));
  });

  it("registers the toolset through a reusable SDK-native registrar", () => {
    const registerTool = vi.fn();

    const registeredToolNames = registerServerTools(
      {
        registerTool,
      },
      {} as any,
    );

    expect(registeredToolNames).toHaveLength(47);
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
      "ynab_search_transactions",
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
      "ynab_get_monthly_review",
      "ynab_get_net_worth_trajectory",
      "ynab_get_financial_snapshot",
      "ynab_get_financial_health_check",
      "ynab_get_spending_summary",
      "ynab_get_spending_anomalies",
      "ynab_get_cash_flow_summary",
      "ynab_get_cash_runway",
      "ynab_get_budget_health_summary",
      "ynab_get_upcoming_obligations",
      "ynab_get_goal_progress_summary",
      "ynab_get_budget_cleanup_summary",
      "ynab_get_income_summary",
      "ynab_get_emergency_fund_coverage",
      "ynab_get_debt_summary",
      "ynab_get_recurring_expense_summary",
      "ynab_get_category_trend_summary",
    ]);
    expect(registerTool).toHaveBeenCalledTimes(47);
    expect(registerTool).toHaveBeenCalledWith(
      "ynab_get_mcp_version",
      expect.objectContaining({
        title: "Get MCP Version",
        description: expect.any(String),
        inputSchema: expect.any(Object),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      }),
      expect.any(Function),
    );
  });

  it("logs tool lifecycle events with request correlation for success and failure", async () => {
    const sink = createBufferedDestination();
    setLoggerDestinationForTests(sink.destination);

    const registeredHandlers = new Map<string, (input: unknown) => Promise<unknown>>();

    registerServerTools(
      {
        registerTool: ((name: string, _metadata: unknown, handler: (input: unknown) => Promise<unknown>) => {
          registeredHandlers.set(name, handler as (input: unknown) => Promise<unknown>);
          return {} as any;
        }) as any,
      },
      {} as any,
    );

    await runWithRequestContext({
      correlationId: "corr-tool-success-123",
      requestId: "req-tool-success-123",
    }, async () => {
      await registeredHandlers.get("ynab_get_mcp_version")?.({});
    });

    const failedResult = await runWithRequestContext({
      correlationId: "corr-tool-failure-123",
      requestId: "req-tool-failure-123",
    }, async () => {
      return await registeredHandlers.get("ynab_get_user")?.({});
    });

    expect(failedResult).toMatchObject({
      isError: true,
    });

    expect(sink.readEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        correlationId: "corr-tool-success-123",
        event: "tool.call.started",
        requestId: "req-tool-success-123",
        scope: "mcp",
        toolName: "ynab_get_mcp_version",
      }),
      expect.objectContaining({
        correlationId: "corr-tool-success-123",
        event: "tool.call.succeeded",
        requestId: "req-tool-success-123",
        scope: "mcp",
        toolName: "ynab_get_mcp_version",
      }),
      expect.objectContaining({
        correlationId: "corr-tool-failure-123",
        event: "tool.call.failed",
        requestId: "req-tool-failure-123",
        scope: "mcp",
        toolName: "ynab_get_user",
      }),
    ]));
  });

  it("does not let one tool call's dynamic plan resolution bleed into the next call", async () => {
    const registeredHandlers = new Map<string, (input: unknown) => Promise<unknown>>();
    let availablePlanIds = ["plan-a"];
    const api = attachYnabApiRuntimeContext({
      plans: {
        async getPlanById(planId: string) {
          return {
            data: {
              plan: {
                id: planId,
                name: `Plan ${planId}`,
                last_modified_on: "2026-03-25T00:00:00.000Z",
              },
            },
          };
        },
        async getPlans() {
          return {
            data: {
              plans: availablePlanIds.map((id) => ({ id })),
              default_plan: { id: availablePlanIds[0] },
            },
          };
        },
      },
    }, {
      apiToken: "test-token",
    });

    registerServerTools(
      {
        registerTool: ((name: string, _metadata: unknown, handler: (input: unknown) => Promise<unknown>) => {
          registeredHandlers.set(name, handler as (input: unknown) => Promise<unknown>);
          return {} as any;
        }) as any,
      },
      api as any,
    );

    const firstResult = await registeredHandlers.get("ynab_get_plan")?.({});
    availablePlanIds = ["plan-b"];
    const secondResult = await registeredHandlers.get("ynab_get_plan")?.({});

    expect(JSON.parse((firstResult as { content: Array<{ text: string }> }).content[0].text)).toEqual({
      plan: {
        id: "plan-a",
        last_modified_on: "2026-03-25T00:00:00.000Z",
        name: "Plan plan-a",
      },
    });
    expect(JSON.parse((secondResult as { content: Array<{ text: string }> }).content[0].text)).toEqual({
      plan: {
        id: "plan-b",
        last_modified_on: "2026-03-25T00:00:00.000Z",
        name: "Plan plan-b",
      },
    });
  });

  it("builds reusable tool definitions from tool modules", () => {
    expect(defineTool("Get MCP Version", GetMcpVersionTool)).toEqual({
      description: GetMcpVersionTool.description,
      execute: GetMcpVersionTool.execute,
      inputSchema: GetMcpVersionTool.inputSchema,
      name: GetMcpVersionTool.name,
      title: "Get MCP Version",
    });
  });

  it("keeps the tool registry owned by serverRuntime while preserving the shared builder shape", () => {
    const serverRuntimeSource = readFileSync(new URL("./serverRuntime.ts", import.meta.url), "utf8");

    expect(serverRuntimeSource).toContain("function defineTool");
    expect(serverRuntimeSource).toContain('defineTool("Get MCP Version", GetMcpVersionTool)');
    expect(serverRuntimeSource).toContain('defineTool("Get Account", GetAccountTool)');
    expect(serverRuntimeSource).not.toContain("name: GetMcpVersionTool.name");
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
