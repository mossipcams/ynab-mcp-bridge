/**
 * Owns: top-level MCP server creation, tool metadata definitions, ordered tool registration, and the logging-wrapped registrar loop.
 * Inputs/dependencies: validated YNAB config, YNAB API factory/runtime attachment, tool modules, request-context logging helpers, MCP registrar.
 * Outputs/contracts: defineTool(...), registerServerTools(...), and createServer(...).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { API } from "ynab";

import { assertYnabConfig, type YnabConfig } from "./config.js";
import { logAppEvent } from "./logger.js";
import { getPackageInfo } from "./packageInfo.js";
import { getRequestLogFields, markToolCallStarted } from "./requestContext.js";
import { attachYnabApiRuntimeContext, createYnabApi } from "./ynabApi.js";
import * as GetAccountTool from "./tools/GetAccountTool.js";
import * as GetBudgetCleanupSummaryTool from "./tools/GetBudgetCleanupSummaryTool.js";
import * as GetBudgetHealthSummaryTool from "./tools/GetBudgetHealthSummaryTool.js";
import * as GetCashRunwayTool from "./tools/GetCashRunwayTool.js";
import * as GetCashFlowSummaryTool from "./tools/GetCashFlowSummaryTool.js";
import * as GetCategoryTool from "./tools/GetCategoryTool.js";
import * as GetCategoryTrendSummaryTool from "./tools/GetCategoryTrendSummaryTool.js";
import * as GetDebtSummaryTool from "./tools/GetDebtSummaryTool.js";
import * as GetEmergencyFundCoverageTool from "./tools/GetEmergencyFundCoverageTool.js";
import * as GetFinancialHealthCheckTool from "./tools/GetFinancialHealthCheckTool.js";
import * as GetFinancialSnapshotTool from "./tools/GetFinancialSnapshotTool.js";
import * as GetGoalProgressSummaryTool from "./tools/GetGoalProgressSummaryTool.js";
import * as GetIncomeSummaryTool from "./tools/GetIncomeSummaryTool.js";
import * as GetMcpVersionTool from "./tools/GetMcpVersionTool.js";
import * as GetMoneyMovementGroupsTool from "./tools/GetMoneyMovementGroupsTool.js";
import * as GetMoneyMovementGroupsByMonthTool from "./tools/GetMoneyMovementGroupsByMonthTool.js";
import * as GetMoneyMovementsTool from "./tools/GetMoneyMovementsTool.js";
import * as GetMoneyMovementsByMonthTool from "./tools/GetMoneyMovementsByMonthTool.js";
import * as GetMonthCategoryTool from "./tools/GetMonthCategoryTool.js";
import * as GetMonthlyReviewTool from "./tools/GetMonthlyReviewTool.js";
import * as GetNetWorthTrajectoryTool from "./tools/GetNetWorthTrajectoryTool.js";
import * as GetPayeeLocationTool from "./tools/GetPayeeLocationTool.js";
import * as GetPayeeLocationsByPayeeTool from "./tools/GetPayeeLocationsByPayeeTool.js";
import * as GetPayeeTool from "./tools/GetPayeeTool.js";
import * as GetScheduledTransactionTool from "./tools/GetScheduledTransactionTool.js";
import * as SearchTransactionsTool from "./tools/SearchTransactionsTool.js";
import * as GetSpendingSummaryTool from "./tools/GetSpendingSummaryTool.js";
import * as GetSpendingAnomaliesTool from "./tools/GetSpendingAnomaliesTool.js";
import * as GetPlanDetailsTool from "./tools/GetPlanDetailsTool.js";
import * as GetPlanMonthTool from "./tools/GetPlanMonthTool.js";
import * as GetPlanSettingsTool from "./tools/GetPlanSettingsTool.js";
import * as GetTransactionTool from "./tools/GetTransactionTool.js";
import * as GetTransactionsByAccountTool from "./tools/GetTransactionsByAccountTool.js";
import * as GetTransactionsByCategoryTool from "./tools/GetTransactionsByCategoryTool.js";
import * as GetTransactionsByMonthTool from "./tools/GetTransactionsByMonthTool.js";
import * as GetTransactionsByPayeeTool from "./tools/GetTransactionsByPayeeTool.js";
import * as GetUpcomingObligationsTool from "./tools/GetUpcomingObligationsTool.js";
import * as GetUserTool from "./tools/GetUserTool.js";
import * as GetRecurringExpenseSummaryTool from "./tools/GetRecurringExpenseSummaryTool.js";
import * as ListAccountsTool from "./tools/ListAccountsTool.js";
import * as ListPayeeLocationsTool from "./tools/ListPayeeLocationsTool.js";
import * as ListPlanMonthsTool from "./tools/ListPlanMonthsTool.js";
import * as ListPayeesTool from "./tools/ListPayeesTool.js";
import * as ListPlanCategoriesTool from "./tools/ListPlanCategoriesTool.js";
import * as ListPlansTool from "./tools/ListPlansTool.js";
import * as ListScheduledTransactionsTool from "./tools/ListScheduledTransactionsTool.js";
import * as ListTransactionsTool from "./tools/ListTransactionsTool.js";

const packageInfo = getPackageInfo();

const SERVER_INFO = {
  name: packageInfo.name,
  version: packageInfo.version,
} as const;

const READ_ONLY_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

type ToolModule = {
  title: string;
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (input: never, api: API) => Promise<CallToolResult> | CallToolResult;
};

type ToolSource = Omit<ToolModule, "title">;
type ToolRegistrar = {
  registerTool: (
    name: string,
    config: {
      annotations?: unknown;
      description?: string;
      inputSchema?: unknown;
      title?: string;
    },
    cb: (input: Record<string, unknown>) => unknown,
  ) => unknown;
};

type ServerRuntimeOptions = {
  discoveryResourceBaseUrl?: string;
};

type DiscoveryResourceSummary = {
  description: string;
  name: string;
  title: string;
  uri: string;
};

type DiscoveryInvocationGuidance = {
  argumentExamples: Record<string, string | number>;
  invocationExample: Record<string, string | number>;
  requiredArguments: string[];
};

const discoveryInvocationGuidanceByToolName: Partial<Record<string, DiscoveryInvocationGuidance>> = {
  ynab_get_month_category: {
    requiredArguments: ["month", "categoryId"],
    argumentExamples: {
      month: "2026-03-01",
      categoryId: "category-123",
    },
    invocationExample: {
      month: "2026-03-01",
      categoryId: "category-123",
      view: "compact",
    },
  },
  ynab_get_net_worth_trajectory: {
    requiredArguments: [],
    argumentExamples: {
      fromMonth: "2026-01-01",
      toMonth: "2026-03-01",
    },
    invocationExample: {},
  },
  ynab_get_spending_anomalies: {
    requiredArguments: ["latestMonth"],
    argumentExamples: {
      latestMonth: "2026-03-01",
      baselineMonths: 3,
      topN: 5,
    },
    invocationExample: {
      latestMonth: "2026-03-01",
      baselineMonths: 3,
      thresholdMultiplier: 1.5,
      minimumDifference: 50000,
      topN: 5,
    },
  },
  ynab_get_payee_location: {
    requiredArguments: ["payeeLocationId"],
    argumentExamples: {
      payeeLocationId: "payee-location-123",
    },
    invocationExample: {
      payeeLocationId: "payee-location-123",
    },
  },
};

function getToolDiscoveryUri(toolName: string): string {
  return `ynab-tool://${toolName}`;
}

function getDiscoveryResourceBaseUrl(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) {
    return undefined;
  }

  return baseUrl.endsWith("/")
    ? baseUrl
    : `${baseUrl}/`;
}

function getToolDiscoveryUris(toolName: string, options: ServerRuntimeOptions = {}): string[] {
  const uris = [getToolDiscoveryUri(toolName)];
  const discoveryResourceBaseUrl = getDiscoveryResourceBaseUrl(options.discoveryResourceBaseUrl);

  if (discoveryResourceBaseUrl) {
    uris.push(new URL(encodeURIComponent(toolName), discoveryResourceBaseUrl).toString());
  }

  return uris;
}

function getToolRegistration(toolName: string): ToolModule {
  const tool = toolRegistrations.find((candidate) => candidate.name === toolName);

  if (!tool) {
    throw new Error(`Unknown discovery resource tool: ${toolName}`);
  }

  return tool;
}

function buildDiscoveryResourceDocument(
  tool: ToolModule,
  uri: string,
): {
  argumentExamples?: Record<string, string | number>;
  annotations: typeof READ_ONLY_TOOL_ANNOTATIONS;
  description: string;
  inputSchema: unknown;
  invocationExample?: Record<string, string | number>;
  requiredArguments?: string[];
  title: string;
  toolName: string;
  uri: string;
} {
  const invocationGuidance = discoveryInvocationGuidanceByToolName[tool.name];

  return {
    annotations: READ_ONLY_TOOL_ANNOTATIONS,
    description: tool.description,
    inputSchema: tool.inputSchema,
    title: tool.title,
    toolName: tool.name,
    uri,
    ...(invocationGuidance ? {
      argumentExamples: invocationGuidance.argumentExamples,
      invocationExample: invocationGuidance.invocationExample,
      requiredArguments: invocationGuidance.requiredArguments,
    } : {}),
  };
}

export function getDiscoveryResourceSummaries(options: ServerRuntimeOptions = {}): DiscoveryResourceSummary[] {
  return toolRegistrations.flatMap((tool) => (
    getToolDiscoveryUris(tool.name, options).map((uri) => ({
      description: tool.description,
      name: tool.name,
      title: tool.title,
      uri,
    }))
  ));
}

export function getDiscoveryResourceDocument(
  toolName: string,
  uri: string,
  options: ServerRuntimeOptions = {},
): {
  argumentExamples?: Record<string, string | number>;
  annotations: typeof READ_ONLY_TOOL_ANNOTATIONS;
  description: string;
  inputSchema: unknown;
  invocationExample?: Record<string, string | number>;
  requiredArguments?: string[];
  title: string;
  toolName: string;
  uri: string;
} {
  const tool = getToolRegistration(toolName);
  const validUris = getToolDiscoveryUris(toolName, options);

  if (!validUris.includes(uri)) {
    throw new Error(`Discovery resource URI does not match tool ${toolName}: ${uri}`);
  }

  return buildDiscoveryResourceDocument(tool, uri);
}

export function defineTool(title: string, tool: ToolSource): ToolModule {
  return {
    title,
    ...tool,
  };
}

const toolRegistrations: ToolModule[] = [
  defineTool("Get MCP Version", GetMcpVersionTool),
  defineTool("Get User", GetUserTool),
  defineTool("List Plans", ListPlansTool),
  defineTool("Get Plan", GetPlanDetailsTool),
  defineTool("Get Plan Settings", GetPlanSettingsTool),
  defineTool("Get Plan Month", GetPlanMonthTool),
  defineTool("List Plan Months", ListPlanMonthsTool),
  defineTool("List Categories", ListPlanCategoriesTool),
  defineTool("Get Category", GetCategoryTool),
  defineTool("Get Month Category", GetMonthCategoryTool),
  defineTool("List Transactions", ListTransactionsTool),
  defineTool("Search Transactions", SearchTransactionsTool),
  defineTool("Get Transactions By Month", GetTransactionsByMonthTool),
  defineTool("Get Transaction", GetTransactionTool),
  defineTool("Get Transactions By Account", GetTransactionsByAccountTool),
  defineTool("Get Transactions By Category", GetTransactionsByCategoryTool),
  defineTool("Get Transactions By Payee", GetTransactionsByPayeeTool),
  defineTool("List Scheduled Transactions", ListScheduledTransactionsTool),
  defineTool("Get Scheduled Transaction", GetScheduledTransactionTool),
  defineTool("List Accounts", ListAccountsTool),
  defineTool("Get Account", GetAccountTool),
  defineTool("List Payees", ListPayeesTool),
  defineTool("Get Payee", GetPayeeTool),
  defineTool("List Payee Locations", ListPayeeLocationsTool),
  defineTool("Get Payee Location", GetPayeeLocationTool),
  defineTool("Get Payee Locations By Payee", GetPayeeLocationsByPayeeTool),
  defineTool("Get Money Movements", GetMoneyMovementsTool),
  defineTool("Get Money Movements By Month", GetMoneyMovementsByMonthTool),
  defineTool("Get Money Movement Groups", GetMoneyMovementGroupsTool),
  defineTool("Get Money Movement Groups By Month", GetMoneyMovementGroupsByMonthTool),
  defineTool("Get Monthly Review", GetMonthlyReviewTool),
  defineTool("Get Net Worth Trajectory", GetNetWorthTrajectoryTool),
  defineTool("Get Financial Snapshot", GetFinancialSnapshotTool),
  defineTool("Get Financial Health Check", GetFinancialHealthCheckTool),
  defineTool("Get Spending Summary", GetSpendingSummaryTool),
  defineTool("Get Spending Anomalies", GetSpendingAnomaliesTool),
  defineTool("Get Cash Flow Summary", GetCashFlowSummaryTool),
  defineTool("Get Cash Runway", GetCashRunwayTool),
  defineTool("Get Budget Health Summary", GetBudgetHealthSummaryTool),
  defineTool("Get Upcoming Obligations", GetUpcomingObligationsTool),
  defineTool("Get Goal Progress Summary", GetGoalProgressSummaryTool),
  defineTool("Get Budget Cleanup Summary", GetBudgetCleanupSummaryTool),
  defineTool("Get Income Summary", GetIncomeSummaryTool),
  defineTool("Get Emergency Fund Coverage", GetEmergencyFundCoverageTool),
  defineTool("Get Debt Summary", GetDebtSummaryTool),
  defineTool("Get Recurring Expense Summary", GetRecurringExpenseSummaryTool),
  defineTool("Get Category Trend Summary", GetCategoryTrendSummaryTool),
];

function registerTool(registrar: ToolRegistrar, tool: ToolModule, api: API): void {
  registrar.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async (input: Record<string, unknown>) => {
      markToolCallStarted();
      logAppEvent("mcp", "tool.call.started", {
        ...getRequestLogFields(),
        toolName: tool.name,
      });

      try {
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- MCP validates tool input before invocation.
        const result = await tool.execute(input as never, api);
        const failed = "isError" in result && result.isError === true;

        logAppEvent("mcp", failed ? "tool.call.failed" : "tool.call.succeeded", {
          ...getRequestLogFields(),
          toolName: tool.name,
        });

        return result;
      } catch (error) {
        logAppEvent("mcp", "tool.call.failed", {
          ...getRequestLogFields(),
          error,
          toolName: tool.name,
        });
        throw error;
      }
    },
  );
}

export function registerServerTools(registrar: ToolRegistrar, api: API): string[] {
  const registeredToolNames: string[] = [];

  for (const tool of toolRegistrations) {
    registerTool(registrar, tool, api);
    registeredToolNames.push(tool.name);
  }

  return registeredToolNames;
}

function registerServerResources(server: McpServer, options: ServerRuntimeOptions = {}): string[] {
  const registeredResourceUris: string[] = [];

  for (const { name, uri } of getDiscoveryResourceSummaries(options)) {
    server.registerResource(
      name,
      uri,
      {
        title: getToolRegistration(name).title,
        description: getToolRegistration(name).description,
        mimeType: "application/json",
      },
      async () => {
        logAppEvent("mcp", "resource.read.started", {
          ...getRequestLogFields(),
          resourceName: name,
          resourceUri: uri,
        });

        try {
          const document = getDiscoveryResourceDocument(name, uri, options);

          logAppEvent("mcp", "resource.read.succeeded", {
            ...getRequestLogFields(),
            resourceName: name,
            resourceUri: uri,
          });

          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(document),
              },
            ],
          };
        } catch (error) {
          logAppEvent("mcp", "resource.read.failed", {
            ...getRequestLogFields(),
            error,
            resourceName: name,
            resourceUri: uri,
          });
          throw error;
        }
      },
    );

    registeredResourceUris.push(uri);
  }

  return registeredResourceUris;
}

export function createServer(
  config: YnabConfig,
  api = createYnabApi(config),
  options: ServerRuntimeOptions = {},
): McpServer {
  const normalizedConfig = assertYnabConfig(config);
  const server = new McpServer(SERVER_INFO);
  const configuredApi = attachYnabApiRuntimeContext(api, normalizedConfig);

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- McpServer structurally satisfies the runtime registrar contract.
  registerServerTools(server as unknown as ToolRegistrar, configuredApi);
  registerServerResources(server, options);

  return server;
}
