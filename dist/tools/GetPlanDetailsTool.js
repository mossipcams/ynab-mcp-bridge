import { z } from "zod";
import { compactResultItem, toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_plan";
export const description = "Gets a single YNAB plan with its detailed budgeting data.";
export const inputSchema = {
    planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
    includeAccounts: z.boolean().optional().describe("Include plan accounts."),
    includeCategoryGroups: z.boolean().optional().describe("Include plan category groups."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.plans.getPlanById(planId, undefined));
        const plan = compactResultItem({
            id: response.data.plan.id,
            name: response.data.plan.name,
            last_modified_on: response.data.plan.last_modified_on,
            first_month: response.data.plan.first_month,
            last_month: response.data.plan.last_month,
            accounts: input.includeAccounts ? response.data.plan.accounts : undefined,
            category_groups: input.includeCategoryGroups ? response.data.plan.category_groups : undefined,
        });
        return toTextResult({
            plan,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
