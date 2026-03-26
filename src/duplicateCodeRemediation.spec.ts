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

  it("keeps oauth grant record view shaping local to oauthStore while preserving standalone helper coverage", () => {
    const helperPath = path.join(projectRoot, "src", "oauthGrantViews.ts");
    const helperSource = readFileSync(helperPath, "utf8");

    expect(helperSource).toContain("export function toPendingConsentRecord");
    expect(helperSource).toContain("export function toPendingAuthorizationRecord");
    expect(helperSource).toContain("export function toAuthorizationCodeRecord");
    expect(helperSource).toContain("export function toRefreshTokenRecord");

    const oauthStoreSource = readFileSync(path.join(projectRoot, "src", "oauthStore.ts"), "utf8");
    const oauthCoreSource = readFileSync(path.join(projectRoot, "src", "oauthCore.ts"), "utf8");

    expect(oauthStoreSource).not.toContain('from "./oauthGrantViews.js"');
    expect(oauthStoreSource).toContain("toPendingConsentRecord(");
    expect(oauthStoreSource).toContain("toPendingAuthorizationRecord(");
    expect(oauthStoreSource).toContain("toAuthorizationCodeRecord(");
    expect(oauthStoreSource).toContain("toRefreshTokenRecord(");
    expect(oauthStoreSource).toContain("function toPendingConsentRecord(");
    expect(oauthStoreSource).toContain("function toPendingAuthorizationRecord(");
    expect(oauthStoreSource).toContain("function toAuthorizationCodeRecord(");
    expect(oauthStoreSource).toContain("function toRefreshTokenRecord(");

    expect(oauthCoreSource).toContain("function toPendingConsent(");
    expect(oauthCoreSource).not.toContain("toPendingConsentRecord(");
  });

  it("keeps authorization-code validation explicit at the two oauth core call sites", () => {
    const oauthCoreSource = readFileSync(path.join(projectRoot, "src", "oauthCore.ts"), "utf8");

    expect(oauthCoreSource).toContain("async function getAuthorizationCodeChallenge(");
    expect(oauthCoreSource).toContain("async function exchangeAuthorizationCode(");
    expect(oauthCoreSource).not.toContain("function requireAuthorizationCodeGrant(");
    expect(oauthCoreSource.match(/Unknown authorization code\./g)?.length ?? 0).toBe(2);
    expect(oauthCoreSource.match(/Authorization code has expired\./g)?.length ?? 0).toBe(2);
  });

  it("keeps compatibility grant builders standalone while oauthStore owns live persistence methods", () => {
    const helperPath = path.join(projectRoot, "src", "oauthCompatibilityGrants.ts");
    const helperSource = readFileSync(helperPath, "utf8");
    const oauthStoreSource = readFileSync(path.join(projectRoot, "src", "oauthStore.ts"), "utf8");

    expect(helperSource).toContain("export function createAuthorizationCodeCompatibilityGrant");
    expect(helperSource).toContain("export function createPendingAuthorizationCompatibilityGrant");
    expect(helperSource).toContain("export function createPendingConsentCompatibilityGrant");
    expect(helperSource).toContain("export function createRefreshTokenCompatibilityGrant");

    expect(oauthStoreSource).not.toContain('from "./oauthCompatibilityGrants.js"');
    expect(oauthStoreSource).toContain("saveAuthorizationCode(code: string, record: AuthorizationCodeRecord)");
    expect(oauthStoreSource).toContain("savePendingAuthorization(stateId: string, record: PendingAuthorizationRecord)");
    expect(oauthStoreSource).toContain("savePendingConsent(consentId: string, record: PendingConsentRecord)");
    expect(oauthStoreSource).toContain("saveRefreshToken(refreshToken: string, record: RefreshTokenRecord)");
    expect(oauthStoreSource).toContain("[`compat-code:${code}`]: normalizeGrant({");
    expect(oauthStoreSource).toContain("[`compat-authorization:${stateId}`]: normalizeGrant({");
    expect(oauthStoreSource).toContain("[`compat-consent:${consentId}`]: normalizeGrant({");
    expect(oauthStoreSource).toContain("[`compat-refresh:${refreshToken}`]: normalizeGrant({");
  });

  it("keeps compatibility persistence localized to dedicated oauthStore save methods", () => {
    const helperSource = readFileSync(path.join(projectRoot, "src", "oauthCompatibilityGrants.ts"), "utf8");
    const oauthStoreSource = readFileSync(path.join(projectRoot, "src", "oauthStore.ts"), "utf8");

    expect(helperSource).not.toContain("persist(");
    expect(helperSource).not.toContain("state =");

    expect(oauthStoreSource).not.toContain("function saveCompatibilityGrant(");
    expect(oauthStoreSource.match(/saveAuthorizationCode\(/g)?.length ?? 0).toBe(1);
    expect(oauthStoreSource.match(/savePendingAuthorization\(/g)?.length ?? 0).toBe(1);
    expect(oauthStoreSource.match(/savePendingConsent\(/g)?.length ?? 0).toBe(1);
    expect(oauthStoreSource.match(/saveRefreshToken\(/g)?.length ?? 0).toBe(1);
    expect(oauthStoreSource.match(/persist\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });

  it("keeps oauth migration helpers standalone while oauthStore still owns live load-state parsing", () => {
    const migrationSource = readFileSync(path.join(projectRoot, "src", "oauthStoreMigration.ts"), "utf8");
    const oauthStoreSource = readFileSync(path.join(projectRoot, "src", "oauthStore.ts"), "utf8");

    expect(migrationSource).toContain("export function loadPersistedOAuthState(");
    expect(migrationSource).toContain("export function deserializePersistedOAuthState(");
    expect(oauthStoreSource).toContain("function loadState(");
    expect(oauthStoreSource).not.toContain('from "./oauthStoreMigration.js"');
    expect(oauthStoreSource).toContain("function parseGrantRecord(");
    expect(oauthStoreSource).toContain("function migrateLegacyState(");
  });

  it("keeps migration helpers free of file I/O while oauthStore owns file access and JSON parsing", () => {
    const migrationSource = readFileSync(path.join(projectRoot, "src", "oauthStoreMigration.ts"), "utf8");
    const oauthStoreSource = readFileSync(path.join(projectRoot, "src", "oauthStore.ts"), "utf8");

    expect(migrationSource).toContain("export function deserializePersistedOAuthState(");
    expect(migrationSource).not.toContain("readFileSync(");
    expect(migrationSource).not.toContain("writeFileSync(");
    expect(migrationSource).not.toContain("renameSync(");
    expect(oauthStoreSource).not.toContain("deserializePersistedOAuthState(");
    expect(oauthStoreSource).toContain("JSON.parse(");
    expect(oauthStoreSource).toContain("readFileSync(");
    expect(oauthStoreSource).toContain("writeFileSync(");
  });

  it("keeps oauth grant mutation explicit through store.saveGrant at transition sites", () => {
    const oauthCoreSource = readFileSync(path.join(projectRoot, "src", "oauthCore.ts"), "utf8");

    expect(oauthCoreSource).not.toContain("function replaceGrant(");
    expect(oauthCoreSource.match(/store\.saveGrant\(\{/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("keeps pending oauth grant validation explicit in consent and callback flows", () => {
    const oauthCoreSource = readFileSync(path.join(projectRoot, "src", "oauthCore.ts"), "utf8");

    expect(oauthCoreSource).not.toContain("function requirePendingConsentGrant(");
    expect(oauthCoreSource).not.toContain("function requirePendingAuthorizationGrant(");
    expect(oauthCoreSource.match(/store\.getPendingConsentGrant\(/g)?.length ?? 0).toBe(1);
    expect(oauthCoreSource.match(/store\.getPendingAuthorizationGrant\(/g)?.length ?? 0).toBe(1);
    expect(oauthCoreSource.match(/Unknown consent challenge\./g)?.length ?? 0).toBe(2);
    expect(oauthCoreSource.match(/Unknown upstream OAuth state\./g)?.length ?? 0).toBe(1);
  });

  it("keeps refresh-token grant validation explicit in the refresh exchange flow", () => {
    const oauthCoreSource = readFileSync(path.join(projectRoot, "src", "oauthCore.ts"), "utf8");

    expect(oauthCoreSource).not.toContain("function requireRefreshTokenGrant(");
    expect(oauthCoreSource.match(/store\.getRefreshTokenGrant\(/g)?.length ?? 0).toBe(1);
    expect(oauthCoreSource.match(/Unknown refresh token\./g)?.length ?? 0).toBe(1);
    expect(oauthCoreSource.match(/Refresh token has expired\./g)?.length ?? 0).toBe(1);
  });
});
