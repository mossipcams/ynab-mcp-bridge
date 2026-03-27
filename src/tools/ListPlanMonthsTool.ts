import { z } from "zod";
import * as ynab from "ynab";

import {
  hasPaginationControls,
  hasProjectionControls,
  paginateEntries,
  projectRecord,
} from "./collectionToolUtils.js";
import { getCachedPlanMonths } from "./cachedYnabReads.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_list_plan_months";
export const description =
  "Lists plan month summaries for budgeting analysis with optional compact projections and pagination.";
const monthFields = [
  "month",
  "income",
  "budgeted",
  "activity",
  "to_be_budgeted",
] as const;
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  limit: z.number().int().min(1).max(500).optional().describe("Maximum number of months to return."),
  offset: z.number().int().min(0).optional().describe("Number of months to skip before returning results."),
  fields: z.array(z.enum(monthFields)).optional().describe("Optional month fields to include in each row."),
};

export async function execute(
  input: {
    planId?: string;
    limit?: number;
    offset?: number;
    fields?: Array<(typeof monthFields)[number]>;
  },
  api: ynab.API,
) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => getCachedPlanMonths(api, planId));
    const months = response.data.months
      .filter((month) => !month.deleted)
      .map((month) => ({
        month: month.month,
        income: month.income,
        budgeted: month.budgeted,
        activity: month.activity,
        to_be_budgeted: month.to_be_budgeted,
      }));

    if (!hasPaginationControls(input) && !hasProjectionControls(input)) {
      return toTextResult({
        months,
        month_count: months.length,
      });
    }

    if (!hasPaginationControls(input)) {
      return toTextResult({
        months: months.map((month) => projectRecord(month, monthFields, input)),
        month_count: months.length,
      });
    }

    const pagedMonths = paginateEntries(months, input);

    return toTextResult({
      months: pagedMonths.entries.map((month) => projectRecord(month, monthFields, input)),
      month_count: months.length,
      ...pagedMonths.metadata,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
