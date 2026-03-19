import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assertYnabConfig } from "./config.js";
import { getPackageInfo } from "./packageInfo.js";
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
};
const toolRegistrations = [
    { title: "Get MCP Version", name: GetMcpVersionTool.name, description: GetMcpVersionTool.description, inputSchema: GetMcpVersionTool.inputSchema, execute: (input, api) => GetMcpVersionTool.execute(input, api) },
    { title: "Get User", name: GetUserTool.name, description: GetUserTool.description, inputSchema: GetUserTool.inputSchema, execute: (input, api) => GetUserTool.execute(input, api) },
    { title: "List Plans", name: ListPlansTool.name, description: ListPlansTool.description, inputSchema: ListPlansTool.inputSchema, execute: (input, api) => ListPlansTool.execute(input, api) },
    { title: "Get Plan", name: GetPlanDetailsTool.name, description: GetPlanDetailsTool.description, inputSchema: GetPlanDetailsTool.inputSchema, execute: (input, api) => GetPlanDetailsTool.execute(input, api) },
    { title: "Get Plan Settings", name: GetPlanSettingsTool.name, description: GetPlanSettingsTool.description, inputSchema: GetPlanSettingsTool.inputSchema, execute: (input, api) => GetPlanSettingsTool.execute(input, api) },
    { title: "Get Plan Month", name: GetPlanMonthTool.name, description: GetPlanMonthTool.description, inputSchema: GetPlanMonthTool.inputSchema, execute: (input, api) => GetPlanMonthTool.execute(input, api) },
    { title: "List Plan Months", name: ListPlanMonthsTool.name, description: ListPlanMonthsTool.description, inputSchema: ListPlanMonthsTool.inputSchema, execute: (input, api) => ListPlanMonthsTool.execute(input, api) },
    { title: "List Categories", name: ListPlanCategoriesTool.name, description: ListPlanCategoriesTool.description, inputSchema: ListPlanCategoriesTool.inputSchema, execute: (input, api) => ListPlanCategoriesTool.execute(input, api) },
    { title: "Get Category", name: GetCategoryTool.name, description: GetCategoryTool.description, inputSchema: GetCategoryTool.inputSchema, execute: (input, api) => GetCategoryTool.execute(input, api) },
    { title: "Get Month Category", name: GetMonthCategoryTool.name, description: GetMonthCategoryTool.description, inputSchema: GetMonthCategoryTool.inputSchema, execute: (input, api) => GetMonthCategoryTool.execute(input, api) },
    { title: "List Transactions", name: ListTransactionsTool.name, description: ListTransactionsTool.description, inputSchema: ListTransactionsTool.inputSchema, execute: (input, api) => ListTransactionsTool.execute(input, api) },
    { title: "Search Transactions", name: SearchTransactionsTool.name, description: SearchTransactionsTool.description, inputSchema: SearchTransactionsTool.inputSchema, execute: (input, api) => SearchTransactionsTool.execute(input, api) },
    { title: "Get Transactions By Month", name: GetTransactionsByMonthTool.name, description: GetTransactionsByMonthTool.description, inputSchema: GetTransactionsByMonthTool.inputSchema, execute: (input, api) => GetTransactionsByMonthTool.execute(input, api) },
    { title: "Get Transaction", name: GetTransactionTool.name, description: GetTransactionTool.description, inputSchema: GetTransactionTool.inputSchema, execute: (input, api) => GetTransactionTool.execute(input, api) },
    { title: "Get Transactions By Account", name: GetTransactionsByAccountTool.name, description: GetTransactionsByAccountTool.description, inputSchema: GetTransactionsByAccountTool.inputSchema, execute: (input, api) => GetTransactionsByAccountTool.execute(input, api) },
    { title: "Get Transactions By Category", name: GetTransactionsByCategoryTool.name, description: GetTransactionsByCategoryTool.description, inputSchema: GetTransactionsByCategoryTool.inputSchema, execute: (input, api) => GetTransactionsByCategoryTool.execute(input, api) },
    { title: "Get Transactions By Payee", name: GetTransactionsByPayeeTool.name, description: GetTransactionsByPayeeTool.description, inputSchema: GetTransactionsByPayeeTool.inputSchema, execute: (input, api) => GetTransactionsByPayeeTool.execute(input, api) },
    { title: "List Scheduled Transactions", name: ListScheduledTransactionsTool.name, description: ListScheduledTransactionsTool.description, inputSchema: ListScheduledTransactionsTool.inputSchema, execute: (input, api) => ListScheduledTransactionsTool.execute(input, api) },
    { title: "Get Scheduled Transaction", name: GetScheduledTransactionTool.name, description: GetScheduledTransactionTool.description, inputSchema: GetScheduledTransactionTool.inputSchema, execute: (input, api) => GetScheduledTransactionTool.execute(input, api) },
    { title: "List Accounts", name: ListAccountsTool.name, description: ListAccountsTool.description, inputSchema: ListAccountsTool.inputSchema, execute: (input, api) => ListAccountsTool.execute(input, api) },
    { title: "Get Account", name: GetAccountTool.name, description: GetAccountTool.description, inputSchema: GetAccountTool.inputSchema, execute: (input, api) => GetAccountTool.execute(input, api) },
    { title: "List Payees", name: ListPayeesTool.name, description: ListPayeesTool.description, inputSchema: ListPayeesTool.inputSchema, execute: (input, api) => ListPayeesTool.execute(input, api) },
    { title: "Get Payee", name: GetPayeeTool.name, description: GetPayeeTool.description, inputSchema: GetPayeeTool.inputSchema, execute: (input, api) => GetPayeeTool.execute(input, api) },
    { title: "List Payee Locations", name: ListPayeeLocationsTool.name, description: ListPayeeLocationsTool.description, inputSchema: ListPayeeLocationsTool.inputSchema, execute: (input, api) => ListPayeeLocationsTool.execute(input, api) },
    { title: "Get Payee Location", name: GetPayeeLocationTool.name, description: GetPayeeLocationTool.description, inputSchema: GetPayeeLocationTool.inputSchema, execute: (input, api) => GetPayeeLocationTool.execute(input, api) },
    { title: "Get Payee Locations By Payee", name: GetPayeeLocationsByPayeeTool.name, description: GetPayeeLocationsByPayeeTool.description, inputSchema: GetPayeeLocationsByPayeeTool.inputSchema, execute: (input, api) => GetPayeeLocationsByPayeeTool.execute(input, api) },
    { title: "Get Money Movements", name: GetMoneyMovementsTool.name, description: GetMoneyMovementsTool.description, inputSchema: GetMoneyMovementsTool.inputSchema, execute: (input, api) => GetMoneyMovementsTool.execute(input, api) },
    { title: "Get Money Movements By Month", name: GetMoneyMovementsByMonthTool.name, description: GetMoneyMovementsByMonthTool.description, inputSchema: GetMoneyMovementsByMonthTool.inputSchema, execute: (input, api) => GetMoneyMovementsByMonthTool.execute(input, api) },
    { title: "Get Money Movement Groups", name: GetMoneyMovementGroupsTool.name, description: GetMoneyMovementGroupsTool.description, inputSchema: GetMoneyMovementGroupsTool.inputSchema, execute: (input, api) => GetMoneyMovementGroupsTool.execute(input, api) },
    { title: "Get Money Movement Groups By Month", name: GetMoneyMovementGroupsByMonthTool.name, description: GetMoneyMovementGroupsByMonthTool.description, inputSchema: GetMoneyMovementGroupsByMonthTool.inputSchema, execute: (input, api) => GetMoneyMovementGroupsByMonthTool.execute(input, api) },
    { title: "Get Financial Snapshot", name: GetFinancialSnapshotTool.name, description: GetFinancialSnapshotTool.description, inputSchema: GetFinancialSnapshotTool.inputSchema, execute: (input, api) => GetFinancialSnapshotTool.execute(input, api) },
    { title: "Get Financial Health Check", name: GetFinancialHealthCheckTool.name, description: GetFinancialHealthCheckTool.description, inputSchema: GetFinancialHealthCheckTool.inputSchema, execute: (input, api) => GetFinancialHealthCheckTool.execute(input, api) },
    { title: "Get Spending Summary", name: GetSpendingSummaryTool.name, description: GetSpendingSummaryTool.description, inputSchema: GetSpendingSummaryTool.inputSchema, execute: (input, api) => GetSpendingSummaryTool.execute(input, api) },
    { title: "Get Spending Anomalies", name: GetSpendingAnomaliesTool.name, description: GetSpendingAnomaliesTool.description, inputSchema: GetSpendingAnomaliesTool.inputSchema, execute: (input, api) => GetSpendingAnomaliesTool.execute(input, api) },
    { title: "Get Cash Flow Summary", name: GetCashFlowSummaryTool.name, description: GetCashFlowSummaryTool.description, inputSchema: GetCashFlowSummaryTool.inputSchema, execute: (input, api) => GetCashFlowSummaryTool.execute(input, api) },
    { title: "Get Cash Runway", name: GetCashRunwayTool.name, description: GetCashRunwayTool.description, inputSchema: GetCashRunwayTool.inputSchema, execute: (input, api) => GetCashRunwayTool.execute(input, api) },
    { title: "Get Budget Health Summary", name: GetBudgetHealthSummaryTool.name, description: GetBudgetHealthSummaryTool.description, inputSchema: GetBudgetHealthSummaryTool.inputSchema, execute: (input, api) => GetBudgetHealthSummaryTool.execute(input, api) },
    { title: "Get Upcoming Obligations", name: GetUpcomingObligationsTool.name, description: GetUpcomingObligationsTool.description, inputSchema: GetUpcomingObligationsTool.inputSchema, execute: (input, api) => GetUpcomingObligationsTool.execute(input, api) },
    { title: "Get Goal Progress Summary", name: GetGoalProgressSummaryTool.name, description: GetGoalProgressSummaryTool.description, inputSchema: GetGoalProgressSummaryTool.inputSchema, execute: (input, api) => GetGoalProgressSummaryTool.execute(input, api) },
    { title: "Get Budget Cleanup Summary", name: GetBudgetCleanupSummaryTool.name, description: GetBudgetCleanupSummaryTool.description, inputSchema: GetBudgetCleanupSummaryTool.inputSchema, execute: (input, api) => GetBudgetCleanupSummaryTool.execute(input, api) },
    { title: "Get Income Summary", name: GetIncomeSummaryTool.name, description: GetIncomeSummaryTool.description, inputSchema: GetIncomeSummaryTool.inputSchema, execute: (input, api) => GetIncomeSummaryTool.execute(input, api) },
    { title: "Get Emergency Fund Coverage", name: GetEmergencyFundCoverageTool.name, description: GetEmergencyFundCoverageTool.description, inputSchema: GetEmergencyFundCoverageTool.inputSchema, execute: (input, api) => GetEmergencyFundCoverageTool.execute(input, api) },
    { title: "Get Debt Summary", name: GetDebtSummaryTool.name, description: GetDebtSummaryTool.description, inputSchema: GetDebtSummaryTool.inputSchema, execute: (input, api) => GetDebtSummaryTool.execute(input, api) },
    { title: "Get Recurring Expense Summary", name: GetRecurringExpenseSummaryTool.name, description: GetRecurringExpenseSummaryTool.description, inputSchema: GetRecurringExpenseSummaryTool.inputSchema, execute: (input, api) => GetRecurringExpenseSummaryTool.execute(input, api) },
    { title: "Get Category Trend Summary", name: GetCategoryTrendSummaryTool.name, description: GetCategoryTrendSummaryTool.description, inputSchema: GetCategoryTrendSummaryTool.inputSchema, execute: (input, api) => GetCategoryTrendSummaryTool.execute(input, api) },
    { title: "Get 70/20/10 Summary", name: GetBudgetRatioSummaryTool.name, description: GetBudgetRatioSummaryTool.description, inputSchema: GetBudgetRatioSummaryTool.inputSchema, execute: (input, api) => GetBudgetRatioSummaryTool.execute(input, api) },
];
function registerTool(registrar, tool, api) {
    registrar.registerTool(tool.name, {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
    }, (input) => tool.execute(input, api));
}
export function registerServerTools(registrar, api) {
    const registeredToolNames = [];
    for (const tool of toolRegistrations) {
        registerTool(registrar, tool, api);
        registeredToolNames.push(tool.name);
    }
    return registeredToolNames;
}
export function createServer(config, api = createYnabApi(config)) {
    const normalizedConfig = assertYnabConfig(config);
    const server = new McpServer(SERVER_INFO);
    const configuredApi = attachYnabApiRuntimeContext(api, normalizedConfig);
    registerServerTools(server, configuredApi);
    return server;
}
