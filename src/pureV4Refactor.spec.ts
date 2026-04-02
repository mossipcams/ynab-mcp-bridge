import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const featuresDir = path.join(projectRoot, "src", "features");
const toolsDir = path.join(projectRoot, "src", "tools");

function isTracked(relativePath: string) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", relativePath], {
      cwd: projectRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function hasTrackedFiles(relativePath: string) {
  const output = execFileSync("git", ["ls-files", "--", relativePath], {
    cwd: projectRoot,
    encoding: "utf8",
  });

  return output.trim().length > 0;
}

describe("pure v4 refactor", () => {
  it("keeps the MCP domain organized around feature slices while preserving shared tool helpers", () => {
    expect(readdirSync(featuresDir).sort()).toEqual([
      "accounts",
      "financialHealth",
      "index.ts",
      "meta",
      "moneyMovements",
      "payees",
      "plans",
      "transactions",
    ]);

    const toolFiles = readdirSync(toolsDir).sort();

    expect(toolFiles).toEqual(expect.arrayContaining([
      "cachedYnabReads.ts",
      "collectionToolUtils.ts",
      "errorUtils.ts",
      "financeToolUtils.ts",
      "financialDiagnosticsUtils.ts",
      "planToolUtils.ts",
      "proseFormatUtils.ts",
      "transactionCollectionToolUtils.ts",
      "transactionToolUtils.ts",
    ]));
    expect(toolFiles).toEqual(expect.arrayContaining([
      "GetAccountTool.ts",
      "GetPlanDetailsTool.ts",
      "ListTransactionsTool.ts",
      "GetMcpVersionTool.ts",
    ]));
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
    expect(isTracked("CLAUDE.md")).toBe(false);
    expect(isTracked("AGENTS.md")).toBe(false);
    expect(hasTrackedFiles("skills")).toBe(false);
    expect(hasTrackedFiles("tasks")).toBe(false);
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
