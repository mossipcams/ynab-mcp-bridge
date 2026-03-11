import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_get_month_category";
export const description = "Gets a single category for a specific month.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  month: z.string().describe("The month in ISO format (YYYY-MM-DD)."),
  categoryId: z.string().describe("The category ID to fetch."),
};

export async function execute(
  input: { planId?: string; month: string; categoryId: string },
  api: ynab.API,
) {
  try {
    const response = await withResolvedPlan(input.planId, api as any, async (planId) => api.categories.getMonthCategoryById(planId, input.month, input.categoryId));
    return toTextResult({
      category: response.data.category,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
