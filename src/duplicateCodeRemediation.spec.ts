import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const collectionToolUtilsPath = path.join(projectRoot, "src", "tools", "collectionToolUtils.ts");
const sharedCollectionTools = [
  "ListAccountsTool.ts",
  "ListPayeesTool.ts",
  "ListPlanMonthsTool.ts",
  "ListScheduledTransactionsTool.ts",
] as const;
const transactionCollectionUtilsPath = path.join(projectRoot, "src", "tools", "transactionCollectionToolUtils.ts");
const transactionLookupUtilsPath = path.join(projectRoot, "src", "tools", "transactionToolUtils.ts");
const sharedTransactionLookupTools = [
  "GetTransactionsByAccountTool.ts",
  "GetTransactionsByCategoryTool.ts",
  "GetTransactionsByMonthTool.ts",
  "GetTransactionsByPayeeTool.ts",
] as const;
const sharedBudgetHealthTools = [
  "GetBudgetHealthSummaryTool.ts",
  "GetMonthlyReviewTool.ts",
] as const;
const sharedTransactionBrowseTools = [
  "SearchTransactionsTool.ts",
] as const;
const supersededHttpModules = [
  "httpServerIngress.ts",
  "httpServerShared.ts",
  "httpServerTransportRoutes.ts",
];
const supersededOAuthModules = [
  "oauthCompatibilityGrants.ts",
  "oauthGrantViews.ts",
  "oauthStoreMigration.ts",
];
const supersededServerModules = [
  "toolDefinition.ts",
] as const;

describe("duplicate code remediation", () => {
  it("centralizes list-tool pagination and projection primitives behind shared helpers", () => {
    const helperSource = readFileSync(collectionToolUtilsPath, "utf8");

    expect(helperSource).toContain("export function hasPaginationControls");
    expect(helperSource).toContain("export function hasProjectionControls");
    expect(helperSource).toContain("export function paginateEntries");
    expect(helperSource).toContain("export function projectRecord");

    for (const toolFile of sharedCollectionTools) {
      const toolSource = readFileSync(path.join(projectRoot, "src", "tools", toolFile), "utf8");

      expect(toolSource).toContain("collectionToolUtils");
      expect(toolSource).toContain("hasPaginationControls(");
      expect(toolSource).toContain("hasProjectionControls(");
      expect(toolSource).toContain("paginateEntries(");
      expect(toolSource).toContain("projectRecord(");
      expect(toolSource).not.toContain("function normalizePaginationNumber(");
      expect(toolSource).not.toContain("const DEFAULT_LIMIT =");
    }
  });

  it("centralizes transaction collection tools behind a shared helper", () => {
    const helperSource = readFileSync(transactionCollectionUtilsPath, "utf8");

    expect(helperSource).toContain("export const monthTransactionCollectionExecutor");
    expect(helperSource).toContain("export function createIdFilteredTransactionCollectionExecutor");

    for (const toolFile of sharedTransactionLookupTools) {
      const toolSource = readFileSync(path.join(projectRoot, "src", "tools", toolFile), "utf8");

      expect(toolSource).toContain("transactionCollectionToolUtils");
      expect(toolSource).not.toContain("executeTransactionLookup(");
      expect(toolSource).not.toContain("renderCollectionResult(");
      expect(toolSource).not.toContain("toDisplayTransactions(");
    }
  });

  it("centralizes month budget-health shaping behind a shared helper", () => {
    const helperSource = readFileSync(path.join(projectRoot, "src", "tools", "financeToolUtils.ts"), "utf8");

    expect(helperSource).toContain("export function buildBudgetHealthMonthSummary");

    for (const toolFile of sharedBudgetHealthTools) {
      const toolSource = readFileSync(path.join(projectRoot, "src", "tools", toolFile), "utf8");

      expect(toolSource).toContain("buildBudgetHealthMonthSummary(");
      expect(toolSource).not.toContain("categories.filter((category) => category.balance < 0)");
      expect(toolSource).not.toContain("categories.filter((category) => (category.goal_under_funded ?? 0) > 0)");
      expect(toolSource).not.toContain("categories\n            .filter((category) => category.balance > 0)");
    }
  });

  it("centralizes transaction browse rendering behind shared transaction helpers", () => {
    const helperSource = readFileSync(transactionLookupUtilsPath, "utf8");

    expect(helperSource).toContain('export { transactionFields, toDisplayTransactions } from "../transactionQueryEngine.js";');

    for (const toolFile of sharedTransactionBrowseTools) {
      const toolSource = readFileSync(path.join(projectRoot, "src", "tools", toolFile), "utf8");

      expect(toolSource).toContain("transactionFields");
      expect(toolSource).toContain("buildTransactionCollectionResult(");
      expect(toolSource).not.toContain("const transactionFields = [");
    }
  });

  it("routes active transaction browse filtering and ordering through transactionQueryEngine", () => {
    const queryEngineSource = readFileSync(path.join(projectRoot, "src", "transactionQueryEngine.ts"), "utf8");
    const searchToolSource = readFileSync(path.join(projectRoot, "src", "tools", "SearchTransactionsTool.ts"), "utf8");
    const transactionToolUtilsSource = readFileSync(transactionLookupUtilsPath, "utf8");

    expect(queryEngineSource).toContain("export function compareTransactions(");
    expect(queryEngineSource).toContain("export function matchesTransactionFilters(");
    expect(searchToolSource).toContain('from "../transactionQueryEngine.js"');
    expect(searchToolSource).toContain("matchesTransactionFilters(");
    expect(searchToolSource).toContain("compareTransactions(");
    expect(searchToolSource).not.toContain("function matchesFilters(");
    expect(searchToolSource).not.toContain("function compareTransactions(");
    expect(transactionToolUtilsSource).toContain('export { transactionFields, toDisplayTransactions } from "../transactionQueryEngine.js";');
    expect(transactionToolUtilsSource).not.toContain("formatAmountMilliunits(");
  });

  it("centralizes reliability summary shaping behind a shared helper", () => {
    const helperPath = path.join(projectRoot, "src", "reliabilitySummaryUtils.ts");
    const helperSource = readFileSync(helperPath, "utf8");

    expect(helperSource).toContain("export function summarizeReliabilityResults");

    for (const fileName of ["reliabilityRunner.ts", "reliabilityArtifact.ts"] as const) {
      const source = readFileSync(path.join(projectRoot, "src", fileName), "utf8");

      expect(source).toContain("summarizeReliabilityResults(");
      expect(source).not.toContain("function percentile(");
      expect(source).not.toContain("function createFailureGroups(");
    }
  });

  it("routes runtime entrypoints through the modular-monolith owner files", () => {
    const indexSource = readFileSync(path.join(projectRoot, "src", "index.ts"), "utf8");
    const stdioSource = readFileSync(path.join(projectRoot, "src", "stdioServer.ts"), "utf8");
    const httpTransportSource = readFileSync(path.join(projectRoot, "src", "httpTransport.ts"), "utf8");

    expect(indexSource).toContain('from "./httpTransport.js"');
    expect(indexSource).not.toContain('from "./httpServer.js"');
    expect(stdioSource).toContain('from "./serverRuntime.js"');
    expect(stdioSource).not.toContain('from "./server.js"');
    expect(httpTransportSource).toContain('from "./auth2/http/routes.js"');
    expect(httpTransportSource).not.toContain('from "./oauthRuntime.js"');
    expect(httpTransportSource).toContain('from "./serverRuntime.js"');
  });

  it("targets the superseded HTTP spread-out runtime helpers for deletion", () => {
    const httpTransportSource = readFileSync(path.join(projectRoot, "src", "httpTransport.ts"), "utf8");

    expect(httpTransportSource).not.toContain('from "./httpServerIngress.js"');
    expect(httpTransportSource).not.toContain('from "./httpServerShared.js"');
    expect(httpTransportSource).not.toContain('from "./httpServerTransportRoutes.js"');

    for (const fileName of supersededHttpModules) {
      expect(existsSync(path.join(projectRoot, "src", fileName))).toBe(false);
    }
  });

  it("targets the superseded OAuth helper modules for deletion", () => {
    for (const fileName of supersededOAuthModules) {
      expect(existsSync(path.join(projectRoot, "src", fileName))).toBe(false);
    }
  });

  it("removes retired oauth module paths from lint and typed-eslint config", () => {
    const packageSource = readFileSync(path.join(projectRoot, "package.json"), "utf8");
    const eslintConfigSource = readFileSync(path.join(projectRoot, "eslint.config.mjs"), "utf8");
    const eslintTsconfigSource = readFileSync(path.join(projectRoot, "tsconfig.eslint.json"), "utf8");

    for (const retiredPath of [
      "src/oauthRuntime.ts",
      "src/grantPersistence.ts",
      "src/grantLifecycle.ts",
    ] as const) {
      expect(packageSource).not.toContain(retiredPath);
      expect(eslintConfigSource).not.toContain(retiredPath);
      expect(eslintTsconfigSource).not.toContain(retiredPath);
    }
  });

  it("targets superseded server tool-definition scaffolding for deletion", () => {
    const serverRuntimeSource = readFileSync(path.join(projectRoot, "src", "serverRuntime.ts"), "utf8");

    expect(serverRuntimeSource).not.toContain('from "./toolDefinition.js"');

    for (const fileName of supersededServerModules) {
      expect(existsSync(path.join(projectRoot, "src", fileName))).toBe(false);
    }
  });

});
