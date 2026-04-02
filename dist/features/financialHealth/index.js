import * as GetBudgetCleanupSummaryTool from "./GetBudgetCleanupSummaryTool.js";
import * as GetBudgetHealthSummaryTool from "./GetBudgetHealthSummaryTool.js";
import * as GetCashFlowSummaryTool from "./GetCashFlowSummaryTool.js";
import * as GetCashRunwayTool from "./GetCashRunwayTool.js";
import * as GetCategoryTrendSummaryTool from "./GetCategoryTrendSummaryTool.js";
import * as GetDebtSummaryTool from "./GetDebtSummaryTool.js";
import * as GetEmergencyFundCoverageTool from "./GetEmergencyFundCoverageTool.js";
import * as GetFinancialHealthCheckTool from "./GetFinancialHealthCheckTool.js";
import * as GetFinancialSnapshotTool from "./GetFinancialSnapshotTool.js";
import * as GetGoalProgressSummaryTool from "./GetGoalProgressSummaryTool.js";
import * as GetIncomeSummaryTool from "./GetIncomeSummaryTool.js";
import * as GetMonthlyReviewTool from "./GetMonthlyReviewTool.js";
import * as GetNetWorthTrajectoryTool from "./GetNetWorthTrajectoryTool.js";
import * as GetRecurringExpenseSummaryTool from "./GetRecurringExpenseSummaryTool.js";
import * as GetSpendingAnomaliesTool from "./GetSpendingAnomaliesTool.js";
import * as GetSpendingSummaryTool from "./GetSpendingSummaryTool.js";
import * as GetUpcomingObligationsTool from "./GetUpcomingObligationsTool.js";
export const financialHealthToolCatalog = [
    { title: "Get Monthly Review", tool: GetMonthlyReviewTool },
    { title: "Get Net Worth Trajectory", tool: GetNetWorthTrajectoryTool },
    { title: "Get Financial Snapshot", tool: GetFinancialSnapshotTool },
    { title: "Get Financial Health Check", tool: GetFinancialHealthCheckTool },
    { title: "Get Spending Summary", tool: GetSpendingSummaryTool },
    { title: "Get Spending Anomalies", tool: GetSpendingAnomaliesTool },
    { title: "Get Cash Flow Summary", tool: GetCashFlowSummaryTool },
    { title: "Get Cash Runway", tool: GetCashRunwayTool },
    { title: "Get Budget Health Summary", tool: GetBudgetHealthSummaryTool },
    { title: "Get Upcoming Obligations", tool: GetUpcomingObligationsTool },
    { title: "Get Goal Progress Summary", tool: GetGoalProgressSummaryTool },
    { title: "Get Budget Cleanup Summary", tool: GetBudgetCleanupSummaryTool },
    { title: "Get Income Summary", tool: GetIncomeSummaryTool },
    { title: "Get Emergency Fund Coverage", tool: GetEmergencyFundCoverageTool },
    { title: "Get Debt Summary", tool: GetDebtSummaryTool },
    { title: "Get Recurring Expense Summary", tool: GetRecurringExpenseSummaryTool },
    { title: "Get Category Trend Summary", tool: GetCategoryTrendSummaryTool },
];
