import { readFileSync } from "node:fs";
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

describe("duplicate code remediation", () => {
  it("centralizes list-tool collection rendering behind a shared helper", () => {
    const helperSource = readFileSync(collectionToolUtilsPath, "utf8");

    expect(helperSource).toContain("export function renderCollectionResult");

    for (const toolFile of sharedCollectionTools) {
      const toolSource = readFileSync(path.join(projectRoot, "src", "tools", toolFile), "utf8");

      expect(toolSource).toContain("renderCollectionResult(");
      expect(toolSource).not.toContain("hasPaginationControls(");
      expect(toolSource).not.toContain("hasProjectionControls(");
      expect(toolSource).not.toContain("paginateEntries(");
      expect(toolSource).not.toContain("projectRecord(");
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

    expect(helperSource).toContain("export const transactionFields");

    for (const toolFile of sharedTransactionBrowseTools) {
      const toolSource = readFileSync(path.join(projectRoot, "src", "tools", toolFile), "utf8");

      expect(toolSource).toContain("transactionFields");
      expect(toolSource).toContain("toDisplayTransactions(");
      expect(toolSource).not.toContain("const transactionFields = [");
      expect(toolSource).not.toContain("amount: formatAmountMilliunits(transaction.amount)");
    }
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

  it("centralizes oauth grant record views behind a shared helper", () => {
    const helperPath = path.join(projectRoot, "src", "oauthGrantViews.ts");
    const helperSource = readFileSync(helperPath, "utf8");

    expect(helperSource).toContain("export function toPendingConsentRecord");
    expect(helperSource).toContain("export function toPendingAuthorizationRecord");
    expect(helperSource).toContain("export function toAuthorizationCodeRecord");
    expect(helperSource).toContain("export function toRefreshTokenRecord");

    const oauthStoreSource = readFileSync(path.join(projectRoot, "src", "oauthStore.ts"), "utf8");
    const oauthCoreSource = readFileSync(path.join(projectRoot, "src", "oauthCore.ts"), "utf8");

    expect(oauthStoreSource).toContain("toPendingConsentRecord(");
    expect(oauthStoreSource).toContain("toPendingAuthorizationRecord(");
    expect(oauthStoreSource).toContain("toAuthorizationCodeRecord(");
    expect(oauthStoreSource).toContain("toRefreshTokenRecord(");
    expect(oauthStoreSource).not.toContain("function toPendingConsentRecord(");
    expect(oauthStoreSource).not.toContain("function toPendingAuthorizationRecord(");
    expect(oauthStoreSource).not.toContain("function toAuthorizationCodeRecord(");
    expect(oauthStoreSource).not.toContain("function toRefreshTokenRecord(");

    expect(oauthCoreSource).toContain("toPendingConsentRecord(");
    expect(oauthCoreSource).not.toContain("function toPendingConsent(");
  });

  it("centralizes authorization-code grant validation behind one oauth core helper", () => {
    const oauthCoreSource = readFileSync(path.join(projectRoot, "src", "oauthCore.ts"), "utf8");

    expect(oauthCoreSource).toContain("function requireAuthorizationCodeGrant(");
    expect(oauthCoreSource.match(/Unknown authorization code\./g)?.length ?? 0).toBe(1);
    expect(oauthCoreSource.match(/Authorization code has expired\./g)?.length ?? 0).toBe(1);
  });

  it("centralizes oauth compatibility grant persistence behind shared builders", () => {
    const helperPath = path.join(projectRoot, "src", "oauthCompatibilityGrants.ts");
    const helperSource = readFileSync(helperPath, "utf8");
    const oauthStoreSource = readFileSync(path.join(projectRoot, "src", "oauthStore.ts"), "utf8");

    expect(helperSource).toContain("export function createAuthorizationCodeCompatibilityGrant");
    expect(helperSource).toContain("export function createPendingAuthorizationCompatibilityGrant");
    expect(helperSource).toContain("export function createPendingConsentCompatibilityGrant");
    expect(helperSource).toContain("export function createRefreshTokenCompatibilityGrant");

    expect(oauthStoreSource).toContain("createAuthorizationCodeCompatibilityGrant(");
    expect(oauthStoreSource).toContain("createPendingAuthorizationCompatibilityGrant(");
    expect(oauthStoreSource).toContain("createPendingConsentCompatibilityGrant(");
    expect(oauthStoreSource).toContain("createRefreshTokenCompatibilityGrant(");
    expect(oauthStoreSource).not.toContain("[`compat-code:${code}`]: normalizeGrant({");
    expect(oauthStoreSource).not.toContain("[`compat-authorization:${stateId}`]: normalizeGrant({");
    expect(oauthStoreSource).not.toContain("[`compat-consent:${consentId}`]: normalizeGrant({");
    expect(oauthStoreSource).not.toContain("[`compat-refresh:${refreshToken}`]: normalizeGrant({");
  });

  it("keeps compatibility persistence local to oauthStore behind one narrow save helper", () => {
    const helperSource = readFileSync(path.join(projectRoot, "src", "oauthCompatibilityGrants.ts"), "utf8");
    const oauthStoreSource = readFileSync(path.join(projectRoot, "src", "oauthStore.ts"), "utf8");

    expect(helperSource).not.toContain("persist(");
    expect(helperSource).not.toContain("state =");

    expect(oauthStoreSource).toContain("function saveCompatibilityGrant(");
    expect(oauthStoreSource.match(/saveCompatibilityGrant\(/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(oauthStoreSource.match(/persist\(\);/g)?.length ?? 0).toBeLessThan(8);
  });

  it("delegates oauth store migration and persisted-state parsing to a dedicated module", () => {
    const migrationSource = readFileSync(path.join(projectRoot, "src", "oauthStoreMigration.ts"), "utf8");
    const oauthStoreSource = readFileSync(path.join(projectRoot, "src", "oauthStore.ts"), "utf8");

    expect(migrationSource).toContain("export function loadPersistedOAuthState(");
    expect(oauthStoreSource).toContain("loadPersistedOAuthState(");
    expect(migrationSource).not.toContain("type LegacyPersistedOAuthState");
    expect(migrationSource).not.toContain("function migrateLegacyState(");
    expect(migrationSource).not.toContain("function toLegacyPendingConsentGrant(");
    expect(migrationSource).not.toContain("function toLegacyPendingAuthorizationGrant(");
    expect(migrationSource).not.toContain("function toLegacyAuthorizationCodeGrant(");
    expect(migrationSource).not.toContain("function toLegacyRefreshTokenGrant(");
    expect(oauthStoreSource).not.toContain("function parseGrantRecord(");
    expect(oauthStoreSource).not.toContain("function migrateLegacyState(");
  });

  it("keeps persisted-state deserialization in the migration module and live file I/O in oauthStore", () => {
    const migrationSource = readFileSync(path.join(projectRoot, "src", "oauthStoreMigration.ts"), "utf8");
    const oauthStoreSource = readFileSync(path.join(projectRoot, "src", "oauthStore.ts"), "utf8");

    expect(migrationSource).toContain("export function deserializePersistedOAuthState(");
    expect(migrationSource).not.toContain("readFileSync(");
    expect(migrationSource).not.toContain("writeFileSync(");
    expect(migrationSource).not.toContain("renameSync(");
    expect(oauthStoreSource).toContain("deserializePersistedOAuthState(");
    expect(oauthStoreSource).not.toContain("JSON.parse(");
    expect(oauthStoreSource).toContain("readFileSync(");
    expect(oauthStoreSource).toContain("writeFileSync(");
  });

  it("centralizes oauth grant rotation behind one narrow core helper", () => {
    const oauthCoreSource = readFileSync(path.join(projectRoot, "src", "oauthCore.ts"), "utf8");

    expect(oauthCoreSource).toContain("function replaceGrant(");
    expect(oauthCoreSource.match(/replaceGrant\(/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(oauthCoreSource.match(/store\.saveGrant\(\{/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("centralizes pending oauth grant validation behind narrow core helpers", () => {
    const oauthCoreSource = readFileSync(path.join(projectRoot, "src", "oauthCore.ts"), "utf8");

    expect(oauthCoreSource).toContain("function requirePendingConsentGrant(");
    expect(oauthCoreSource).toContain("function requirePendingAuthorizationGrant(");
    expect(oauthCoreSource.match(/store\.getPendingConsentGrant\(/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(oauthCoreSource.match(/store\.getPendingAuthorizationGrant\(/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("keeps refresh-token grant validation behind one narrow core helper", () => {
    const oauthCoreSource = readFileSync(path.join(projectRoot, "src", "oauthCore.ts"), "utf8");

    expect(oauthCoreSource).toContain("function requireRefreshTokenGrant(");
    expect(oauthCoreSource.match(/store\.getRefreshTokenGrant\(/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
