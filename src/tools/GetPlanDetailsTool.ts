import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_get_plan";
export const description = "Gets a single YNAB plan with its detailed budgeting data.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
};

export async function execute(input: { planId?: string }, api: ynab.API) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.plans.getPlanById(planId, undefined));
    return toTextResult({
      plan: response.data.plan,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
