import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const toolsDir = path.join(projectRoot, "src", "tools");

describe("pure v4 refactor", () => {
  it("keeps only the final read-only tool modules in src/tools", () => {
    expect(readdirSync(toolsDir).sort()).toEqual([
      "GetAccountTool.ts",
      "GetBudgetCleanupSummaryTool.ts",
      "GetBudgetHealthSummaryTool.ts",
      "GetCashFlowSummaryTool.ts",
      "GetCashRunwayTool.ts",
      "GetCategoryTool.ts",
      "GetCategoryTrendSummaryTool.ts",
      "GetDebtSummaryTool.ts",
      "GetEmergencyFundCoverageTool.ts",
      "GetFinancialHealthCheckTool.ts",
      "GetFinancialSnapshotTool.ts",
      "GetGoalProgressSummaryTool.ts",
      "GetIncomeSummaryTool.ts",
      "GetMcpVersionTool.ts",
      "GetMoneyMovementGroupsByMonthTool.ts",
      "GetMoneyMovementGroupsTool.ts",
      "GetMoneyMovementsByMonthTool.ts",
      "GetMoneyMovementsTool.ts",
      "GetMonthCategoryTool.ts",
      "GetMonthlyReviewTool.ts",
      "GetNetWorthTrajectoryTool.ts",
      "GetPayeeLocationTool.ts",
      "GetPayeeLocationsByPayeeTool.ts",
      "GetPayeeTool.ts",
      "GetPlanDetailsTool.ts",
      "GetPlanMonthTool.ts",
      "GetPlanSettingsTool.ts",
      "GetRecurringExpenseSummaryTool.ts",
      "GetScheduledTransactionTool.ts",
      "GetSpendingAnomaliesTool.ts",
      "GetSpendingSummaryTool.ts",
      "GetTransactionTool.ts",
      "GetTransactionsByAccountTool.ts",
      "GetTransactionsByCategoryTool.ts",
      "GetTransactionsByMonthTool.ts",
      "GetTransactionsByPayeeTool.ts",
      "GetUpcomingObligationsTool.ts",
      "GetUserTool.ts",
      "ListAccountsTool.ts",
      "ListPayeeLocationsTool.ts",
      "ListPayeesTool.ts",
      "ListPlanCategoriesTool.ts",
      "ListPlanMonthsTool.ts",
      "ListPlansTool.ts",
      "ListScheduledTransactionsTool.ts",
      "ListTransactionsTool.ts",
      "SearchTransactionsTool.ts",
      "cachedYnabReads.ts",
      "collectionToolUtils.ts",
      "errorUtils.ts",
      "financeToolUtils.ts",
      "financialDiagnosticsUtils.ts",
      "planToolUtils.ts",
      "proseFormatUtils.ts",
      "transactionCollectionToolUtils.ts",
      "transactionToolUtils.ts",
    ]);
  });

  it("removes the legacy src/tests compatibility suite", () => {
    expect(existsSync(path.join(projectRoot, "src", "tests"))).toBe(false);
  });

  it("removes unused Smithery packaging metadata", () => {
    expect(existsSync(path.join(projectRoot, "smithery.yaml"))).toBe(false);
  });

  it("documents plan terminology for the default YNAB plan env var", () => {
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");

    expect(readme).toContain("YNAB_PLAN_ID");
    expect(readme).not.toContain("YNAB_BUDGET_ID");
    expect(readme).not.toContain("GET /health");
  });

  it("keeps housekeeping instruction files out of the tracked repository root", () => {
    expect(existsSync(path.join(projectRoot, "CLAUDE.md"))).toBe(false);
    expect(existsSync(path.join(projectRoot, "AGENTS.md"))).toBe(false);
    expect(existsSync(path.join(projectRoot, "skills"))).toBe(false);
    expect(existsSync(path.join(projectRoot, "tasks"))).toBe(false);
  });

  it("ignores removed housekeeping docs and folders while keeping core markdown tracked", () => {
    const gitignore = readFileSync(path.join(projectRoot, ".gitignore"), "utf8");

    expect(gitignore).toContain("skills/");
    expect(gitignore).toContain("tasks/");
    expect(gitignore).toContain("*.md");
    expect(gitignore).toContain("!README.md");
    expect(gitignore).toContain("!CHANGELOG.md");
  });

  it("keeps root runtime artifacts aligned with plan-based configuration", () => {
    const dockerfile = readFileSync(path.join(projectRoot, "Dockerfile"), "utf8");

    expect(dockerfile).not.toContain("smithery.ai");
    expect(dockerfile).not.toContain("YNAB_BUDGET_ID");
  });

  it("keeps debugging helpers aligned with plan terminology", () => {
    const debuggingDir = path.join(projectRoot, "debugging");
    const getPlanMonthPath = path.join(debuggingDir, "getPlanMonth.js");
    const getCategoryScript = readFileSync(path.join(debuggingDir, "getCategory.js"), "utf8");

    expect(existsSync(path.join(debuggingDir, "getBudgetMonth.js"))).toBe(false);
    expect(existsSync(getPlanMonthPath)).toBe(true);
    expect(readFileSync(getPlanMonthPath, "utf8")).toContain("/v1/plans/");
    expect(getCategoryScript).toContain("/v1/plans/");
    expect(getCategoryScript).toContain("<planId>");
    expect(getCategoryScript).not.toContain("<budgetId>");
  });
});
