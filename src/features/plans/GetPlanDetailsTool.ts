import { z } from "zod";
import * as ynab from "ynab";

import { compactObject } from "../../tools/financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";

export const name = "ynab_get_plan";
export const description =
  "Gets a single YNAB plan. Returns a compact summary by default, with an explicit full-view opt-in for detailed budgeting data.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  view: z.enum(["compact", "full"]).default("compact").optional().describe("Returns a compact projection by default, or the full plan payload when set to 'full'."),
};

export async function execute(input: { planId?: string; view?: "compact" | "full" }, api: ynab.API) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.plans.getPlanById(planId, undefined));
    const plan = response.data.plan;

    if (input.view === "full") {
      return toTextResult({
        plan,
      });
    }

    return toTextResult({
      plan: compactObject({
        id: plan.id,
        name: plan.name,
        last_modified_on: plan.last_modified_on,
        first_month: plan.first_month,
        last_month: plan.last_month,
        account_count: Array.isArray(plan.accounts) ? plan.accounts.length : undefined,
        category_group_count: Array.isArray(plan.category_groups) ? plan.category_groups.length : undefined,
        payee_count: Array.isArray(plan.payees) ? plan.payees.length : undefined,
      }),
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
