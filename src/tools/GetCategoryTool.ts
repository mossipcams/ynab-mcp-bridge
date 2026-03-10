import { z } from "zod";
import * as ynab from "ynab";

import { getPlanId, toErrorResult, toTextResult } from "./planToolUtils.js";

export const name = "ynab_get_category";
export const description = "Gets a single category by ID.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  categoryId: z.string().describe("The category ID to fetch."),
};

export async function execute(input: { planId?: string; categoryId: string }, api: ynab.API) {
  try {
    const planId = getPlanId(input.planId);
    const response = await api.categories.getCategoryById(planId, input.categoryId);
    return toTextResult({
      category: response.data.category,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
