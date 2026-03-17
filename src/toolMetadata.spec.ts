import { describe, expect, it } from "vitest";

import * as GetFinancialSnapshotTool from "./tools/GetFinancialSnapshotTool.js";
import * as GetPlanDetailsTool from "./tools/GetPlanDetailsTool.js";
import * as GetSpendingSummaryTool from "./tools/GetSpendingSummaryTool.js";
import * as GetTransactionsByMonthTool from "./tools/GetTransactionsByMonthTool.js";
import * as ListPlansTool from "./tools/ListPlansTool.js";
import * as ListTransactionsTool from "./tools/ListTransactionsTool.js";

function getDescription(schema: { description?: string; _def?: { description?: string } }) {
  return schema.description ?? schema._def?.description;
}

describe("tool metadata", () => {
  it("uses compact shared parameter descriptions", () => {
    expect(getDescription(ListTransactionsTool.inputSchema.planId as any)).toBe(
      "YNAB plan ID. Defaults to YNAB_PLAN_ID.",
    );
    expect(getDescription(GetFinancialSnapshotTool.inputSchema.month as any)).toBe(
      "Month as YYYY-MM-DD or 'current'.",
    );
    expect(getDescription(GetTransactionsByMonthTool.inputSchema.month as any)).toBe(
      "Month as YYYY-MM-DD.",
    );
    expect(getDescription(GetSpendingSummaryTool.inputSchema.fromMonth as any)).toBe(
      "Start month as YYYY-MM-DD or 'current'.",
    );
    expect(getDescription(GetSpendingSummaryTool.inputSchema.toMonth as any)).toBe(
      "End month as YYYY-MM-DD. Defaults to fromMonth.",
    );
    expect(getDescription(ListTransactionsTool.inputSchema.limit as any)).toBe(
      "Max transactions to return.",
    );
    expect(getDescription(ListTransactionsTool.inputSchema.includeFullDetails as any)).toBe(
      "Include extra transaction fields.",
    );
    expect(getDescription(ListPlansTool.inputSchema.limit as any)).toBe(
      "Max plans to return.",
    );
    expect(getDescription(GetPlanDetailsTool.inputSchema.includeAccounts as any)).toBe(
      "Include plan accounts.",
    );
    expect(getDescription(GetPlanDetailsTool.inputSchema.includeCategoryGroups as any)).toBe(
      "Include plan category groups.",
    );
  });
});
