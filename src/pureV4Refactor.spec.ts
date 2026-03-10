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
      "GetMoneyMovementsByMonthTool.ts",
      "GetMonthCategoryTool.ts",
      "GetPayeeTool.ts",
      "GetPlanDetailsTool.ts",
      "GetPlanMonthTool.ts",
      "GetPlanSettingsTool.ts",
      "GetTransactionsByMonthTool.ts",
      "ListPlanCategoriesTool.ts",
      "ListPlansTool.ts",
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
  });
});
