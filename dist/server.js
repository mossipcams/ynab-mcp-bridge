import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { assertYnabConfig } from "./config.js";
import { getPackageInfo } from "./packageInfo.js";
import { defineReadOnlyTool, registerDefinedTools, } from "./toolDefinition.js";
import { attachYnabApiRuntimeContext, createYnabApi } from "./ynabApi.js";
import * as GetAccountTool from "./tools/GetAccountTool.js";
import * as GetBudgetCleanupSummaryTool from "./tools/GetBudgetCleanupSummaryTool.js";
import * as GetBudgetHealthSummaryTool from "./tools/GetBudgetHealthSummaryTool.js";
import * as GetCashFlowSummaryTool from "./tools/GetCashFlowSummaryTool.js";
import * as GetCashRunwayTool from "./tools/GetCashRunwayTool.js";
import * as GetCategoryTool from "./tools/GetCategoryTool.js";
import * as GetCategoryTrendSummaryTool from "./tools/GetCategoryTrendSummaryTool.js";
import * as GetDebtSummaryTool from "./tools/GetDebtSummaryTool.js";
import * as GetEmergencyFundCoverageTool from "./tools/GetEmergencyFundCoverageTool.js";
import * as GetFinancialHealthCheckTool from "./tools/GetFinancialHealthCheckTool.js";
import * as GetFinancialSnapshotTool from "./tools/GetFinancialSnapshotTool.js";
import * as GetGoalProgressSummaryTool from "./tools/GetGoalProgressSummaryTool.js";
import * as GetIncomeSummaryTool from "./tools/GetIncomeSummaryTool.js";
import * as GetMcpVersionTool from "./tools/GetMcpVersionTool.js";
import * as GetMoneyMovementGroupsByMonthTool from "./tools/GetMoneyMovementGroupsByMonthTool.js";
import * as GetMoneyMovementGroupsTool from "./tools/GetMoneyMovementGroupsTool.js";
import * as GetMoneyMovementsByMonthTool from "./tools/GetMoneyMovementsByMonthTool.js";
import * as GetMoneyMovementsTool from "./tools/GetMoneyMovementsTool.js";
import * as GetMonthCategoryTool from "./tools/GetMonthCategoryTool.js";
import * as GetMonthlyReviewTool from "./tools/GetMonthlyReviewTool.js";
import * as GetNetWorthTrajectoryTool from "./tools/GetNetWorthTrajectoryTool.js";
import * as GetPayeeLocationTool from "./tools/GetPayeeLocationTool.js";
import * as GetPayeeLocationsByPayeeTool from "./tools/GetPayeeLocationsByPayeeTool.js";
import * as GetPayeeTool from "./tools/GetPayeeTool.js";
import * as GetPlanDetailsTool from "./tools/GetPlanDetailsTool.js";
import * as GetPlanMonthTool from "./tools/GetPlanMonthTool.js";
import * as GetPlanSettingsTool from "./tools/GetPlanSettingsTool.js";
import * as GetRecurringExpenseSummaryTool from "./tools/GetRecurringExpenseSummaryTool.js";
import * as GetScheduledTransactionTool from "./tools/GetScheduledTransactionTool.js";
import * as GetSpendingAnomaliesTool from "./tools/GetSpendingAnomaliesTool.js";
import * as GetSpendingSummaryTool from "./tools/GetSpendingSummaryTool.js";
import * as GetTransactionTool from "./tools/GetTransactionTool.js";
import * as GetTransactionsByAccountTool from "./tools/GetTransactionsByAccountTool.js";
import * as GetTransactionsByCategoryTool from "./tools/GetTransactionsByCategoryTool.js";
import * as GetTransactionsByMonthTool from "./tools/GetTransactionsByMonthTool.js";
import * as GetTransactionsByPayeeTool from "./tools/GetTransactionsByPayeeTool.js";
import * as GetUpcomingObligationsTool from "./tools/GetUpcomingObligationsTool.js";
import * as GetUserTool from "./tools/GetUserTool.js";
import * as ListAccountsTool from "./tools/ListAccountsTool.js";
import * as ListPayeeLocationsTool from "./tools/ListPayeeLocationsTool.js";
import * as ListPayeesTool from "./tools/ListPayeesTool.js";
import * as ListPlanCategoriesTool from "./tools/ListPlanCategoriesTool.js";
import * as ListPlanMonthsTool from "./tools/ListPlanMonthsTool.js";
import * as ListPlansTool from "./tools/ListPlansTool.js";
import * as ListScheduledTransactionsTool from "./tools/ListScheduledTransactionsTool.js";
import * as ListTransactionsTool from "./tools/ListTransactionsTool.js";
import * as SearchTransactionsTool from "./tools/SearchTransactionsTool.js";
const packageInfo = getPackageInfo();
const SERVER_INFO = {
    name: packageInfo.name,
    version: packageInfo.version,
};
const toolDefinitions = [
    defineReadOnlyTool("Get MCP Version", GetMcpVersionTool),
    defineReadOnlyTool("Get User", GetUserTool),
    defineReadOnlyTool("List Plans", ListPlansTool),
    defineReadOnlyTool("Get Plan", GetPlanDetailsTool),
    defineReadOnlyTool("Get Plan Settings", GetPlanSettingsTool),
    defineReadOnlyTool("Get Plan Month", GetPlanMonthTool),
    defineReadOnlyTool("List Plan Months", ListPlanMonthsTool),
    defineReadOnlyTool("List Categories", ListPlanCategoriesTool),
    defineReadOnlyTool("Get Category", GetCategoryTool),
    defineReadOnlyTool("Get Month Category", GetMonthCategoryTool),
    defineReadOnlyTool("List Transactions", ListTransactionsTool),
    defineReadOnlyTool("Search Transactions", SearchTransactionsTool),
    defineReadOnlyTool("Get Transactions By Month", GetTransactionsByMonthTool),
    defineReadOnlyTool("Get Transaction", GetTransactionTool),
    defineReadOnlyTool("Get Transactions By Account", GetTransactionsByAccountTool),
    defineReadOnlyTool("Get Transactions By Category", GetTransactionsByCategoryTool),
    defineReadOnlyTool("Get Transactions By Payee", GetTransactionsByPayeeTool),
    defineReadOnlyTool("List Scheduled Transactions", ListScheduledTransactionsTool),
    defineReadOnlyTool("Get Scheduled Transaction", GetScheduledTransactionTool),
    defineReadOnlyTool("List Accounts", ListAccountsTool),
    defineReadOnlyTool("Get Account", GetAccountTool),
    defineReadOnlyTool("List Payees", ListPayeesTool),
    defineReadOnlyTool("Get Payee", GetPayeeTool),
    defineReadOnlyTool("List Payee Locations", ListPayeeLocationsTool),
    defineReadOnlyTool("Get Payee Location", GetPayeeLocationTool),
    defineReadOnlyTool("Get Payee Locations By Payee", GetPayeeLocationsByPayeeTool),
    defineReadOnlyTool("Get Money Movements", GetMoneyMovementsTool),
    defineReadOnlyTool("Get Money Movements By Month", GetMoneyMovementsByMonthTool),
    defineReadOnlyTool("Get Money Movement Groups", GetMoneyMovementGroupsTool),
    defineReadOnlyTool("Get Money Movement Groups By Month", GetMoneyMovementGroupsByMonthTool),
    defineReadOnlyTool("Get Financial Snapshot", GetFinancialSnapshotTool),
    defineReadOnlyTool("Get Net Worth Trajectory", GetNetWorthTrajectoryTool),
    defineReadOnlyTool("Get Monthly Review", GetMonthlyReviewTool),
    defineReadOnlyTool("Get Financial Health Check", GetFinancialHealthCheckTool),
    defineReadOnlyTool("Get Spending Summary", GetSpendingSummaryTool),
    defineReadOnlyTool("Get Spending Anomalies", GetSpendingAnomaliesTool),
    defineReadOnlyTool("Get Cash Flow Summary", GetCashFlowSummaryTool),
    defineReadOnlyTool("Get Cash Runway", GetCashRunwayTool),
    defineReadOnlyTool("Get Budget Health Summary", GetBudgetHealthSummaryTool),
    defineReadOnlyTool("Get Upcoming Obligations", GetUpcomingObligationsTool),
    defineReadOnlyTool("Get Goal Progress Summary", GetGoalProgressSummaryTool),
    defineReadOnlyTool("Get Budget Cleanup Summary", GetBudgetCleanupSummaryTool),
    defineReadOnlyTool("Get Income Summary", GetIncomeSummaryTool),
    defineReadOnlyTool("Get Emergency Fund Coverage", GetEmergencyFundCoverageTool),
    defineReadOnlyTool("Get Debt Summary", GetDebtSummaryTool),
    defineReadOnlyTool("Get Recurring Expense Summary", GetRecurringExpenseSummaryTool),
    defineReadOnlyTool("Get Category Trend Summary", GetCategoryTrendSummaryTool),
];
export function registerServerTools(registrar, api) {
    return registerDefinedTools(registrar, api, toolDefinitions);
}
export function createServer(config, api = createYnabApi(config)) {
    const normalizedConfig = assertYnabConfig(config);
    const server = new McpServer(SERVER_INFO);
    const configuredApi = attachYnabApiRuntimeContext(api, normalizedConfig);
    const registrar = {
        registerTool: (name, toolConfig, cb) => {
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- This adapter intentionally erases MCP's heavy generic types.
            return server.registerTool(name, toolConfig, cb);
        },
    };
    registerServerTools(registrar, configuredApi);
    return server;
}
