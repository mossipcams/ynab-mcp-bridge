import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const toolsDir = path.join(projectRoot, "src", "tools");

describe("pure v4 refactor", () => {
  it("keeps only the final read-only tool modules in src/tools", () => {
    expect(readdirSync(toolsDir).sort()).toEqual([
      "GetAccountTool.ts",
      "GetCategoryTool.ts",
      "GetMcpVersionTool.ts",
      "GetMoneyMovementGroupsByMonthTool.ts",
      "GetMoneyMovementGroupsTool.ts",
      "GetMoneyMovementsByMonthTool.ts",
      "GetMoneyMovementsTool.ts",
      "GetMonthCategoryTool.ts",
      "GetPayeeLocationTool.ts",
      "GetPayeeLocationsByPayeeTool.ts",
      "GetPayeeTool.ts",
      "GetPlanDetailsTool.ts",
      "GetPlanMonthTool.ts",
      "GetPlanSettingsTool.ts",
      "GetScheduledTransactionTool.ts",
      "GetTransactionTool.ts",
      "GetTransactionsByAccountTool.ts",
      "GetTransactionsByCategoryTool.ts",
      "GetTransactionsByMonthTool.ts",
      "GetTransactionsByPayeeTool.ts",
      "GetUserTool.ts",
      "ListAccountsTool.ts",
      "ListPayeeLocationsTool.ts",
      "ListPayeesTool.ts",
      "ListPlanCategoriesTool.ts",
      "ListPlanMonthsTool.ts",
      "ListPlansTool.ts",
      "ListScheduledTransactionsTool.ts",
      "ListTransactionsTool.ts",
      "errorUtils.ts",
      "planToolUtils.ts",
    ]);
  });

  it("removes the legacy src/tests compatibility suite", () => {
    expect(existsSync(path.join(projectRoot, "src", "tests"))).toBe(false);
  });

  it("documents plan terminology for the default YNAB plan env var", () => {
    const readme = readFileSync(path.join(projectRoot, "README.md"), "utf8");

    expect(readme).toContain("YNAB_PLAN_ID");
    expect(readme).not.toContain("YNAB_BUDGET_ID");
    expect(readme).not.toContain("GET /health");
  });

  it("documents that PRs should default to the fork instead of upstream", () => {
    const claudeMd = readFileSync(path.join(projectRoot, "CLAUDE.md"), "utf8");

    expect(claudeMd).toContain("Default all PR creation to `mossipcams/ynab-mcp-bridge`.");
    expect(claudeMd).toContain(
      "Do not open PRs, create commits for, push to, or take any other action against Caleb's repo (`calebl/ynab-mcp-server`) unless the user explicitly asks for that target repo.",
    );
  });
});
