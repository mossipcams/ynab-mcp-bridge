import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ShapeOutput, ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import * as ynab from "ynab";

import { assertYnabConfig, type YnabConfig } from "./config.js";
import { logAppEvent } from "./logger.js";
import { getPackageInfo } from "./packageInfo.js";
import { getRequestLogFields, markToolCallStarted } from "./requestContext.js";
import { attachYnabApiRuntimeContext, createYnabApi } from "./ynabApi.js";
import * as GetAccountTool from "./tools/GetAccountTool.js";
import * as GetBudgetCleanupSummaryTool from "./tools/GetBudgetCleanupSummaryTool.js";
import * as GetBudgetRatioSummaryTool from "./tools/GetBudgetRatioSummaryTool.js";
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

type ToolRegistrar = Pick<McpServer, "registerTool">;

function registerTool<Input>(
  registrar: ToolRegistrar,
  title: string,
  tool: {
    name: string;
    description: string;
    inputSchema: ZodRawShapeCompat;
    execute: (input: Input, api: ynab.API) => Promise<CallToolResult>;
  },
  api: ynab.API,
): string {
  registrar.registerTool(
    tool.name,
    {
      title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async (input: Input) => {
      markToolCallStarted();
      logAppEvent("mcp", "tool.call.started", {
        ...getRequestLogFields(),
        toolName: tool.name,
      });

      try {
        const result = await tool.execute(input, api);
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

  return tool.name;
}

function registerSchemaTool<Schema extends ZodRawShapeCompat>(
  registrar: ToolRegistrar,
  title: string,
  tool: {
    name: string;
    description: string;
    inputSchema: Schema;
    execute: (input: ShapeOutput<Schema>, api: ynab.API) => Promise<CallToolResult>;
  },
  api: ynab.API,
): string {
  return registerTool(registrar, title, tool, api);
}

export function registerServerTools(registrar: ToolRegistrar, api: ynab.API): string[] {
  const registeredToolNames: string[] = [];

  registeredToolNames.push(registerSchemaTool(registrar, "Get MCP Version", GetMcpVersionTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get User", GetUserTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "List Plans", ListPlansTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Plan", GetPlanDetailsTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Plan Settings", GetPlanSettingsTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Plan Month", GetPlanMonthTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "List Plan Months", ListPlanMonthsTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "List Categories", ListPlanCategoriesTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Category", GetCategoryTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Month Category", GetMonthCategoryTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "List Transactions", ListTransactionsTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Search Transactions", SearchTransactionsTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Transactions By Month", GetTransactionsByMonthTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Transaction", GetTransactionTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Transactions By Account", GetTransactionsByAccountTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Transactions By Category", GetTransactionsByCategoryTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Transactions By Payee", GetTransactionsByPayeeTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "List Scheduled Transactions", ListScheduledTransactionsTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Scheduled Transaction", GetScheduledTransactionTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "List Accounts", ListAccountsTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Account", GetAccountTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "List Payees", ListPayeesTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Payee", GetPayeeTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "List Payee Locations", ListPayeeLocationsTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Payee Location", GetPayeeLocationTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Payee Locations By Payee", GetPayeeLocationsByPayeeTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Money Movements", GetMoneyMovementsTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Money Movements By Month", GetMoneyMovementsByMonthTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Money Movement Groups", GetMoneyMovementGroupsTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Money Movement Groups By Month", GetMoneyMovementGroupsByMonthTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Financial Snapshot", GetFinancialSnapshotTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Financial Health Check", GetFinancialHealthCheckTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Spending Summary", GetSpendingSummaryTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Spending Anomalies", GetSpendingAnomaliesTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Cash Flow Summary", GetCashFlowSummaryTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Cash Runway", GetCashRunwayTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Budget Health Summary", GetBudgetHealthSummaryTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Upcoming Obligations", GetUpcomingObligationsTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Goal Progress Summary", GetGoalProgressSummaryTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Budget Cleanup Summary", GetBudgetCleanupSummaryTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Income Summary", GetIncomeSummaryTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Emergency Fund Coverage", GetEmergencyFundCoverageTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Debt Summary", GetDebtSummaryTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Recurring Expense Summary", GetRecurringExpenseSummaryTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get Category Trend Summary", GetCategoryTrendSummaryTool, api));
  registeredToolNames.push(registerSchemaTool(registrar, "Get 70/20/10 Summary", GetBudgetRatioSummaryTool, api));

  return registeredToolNames;
}

export function createServer(config: YnabConfig, api = createYnabApi(config)): McpServer {
  const normalizedConfig = assertYnabConfig(config);
  const server = new McpServer(SERVER_INFO);
  const configuredApi = attachYnabApiRuntimeContext(api, normalizedConfig);

  registerServerTools(server, configuredApi);

  return server;
}
