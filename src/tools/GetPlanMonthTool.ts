import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_get_plan_month";
export const description = "Gets a single plan month snapshot for budgeting analysis.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  month: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).default("current").describe("The month in ISO format or the string 'current'."),
};

export async function execute(input: { planId?: string; month?: string }, api: ynab.API) {
  try {
    const month = input.month || "current";
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.months.getPlanMonth(planId, month));
    return toTextResult({
      month: response.data.month,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
