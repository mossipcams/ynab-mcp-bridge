import { z } from "zod";
import { buildCompactListPayload, normalizeListLimit, toErrorResult, toTextResult, withResolvedPlan, } from "./planToolUtils.js";
export const name = "ynab_list_plan_months";
export const description = "Lists plan month summaries for budgeting analysis.";
export const inputSchema = {
    planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
    limit: z.number().int().min(1).max(200).optional().describe("Max months to return."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.months.getPlanMonths(planId));
        const months = response.data.months
            .filter((month) => !month.deleted)
            .map((month) => ({
            month: month.month,
            income: month.income,
            budgeted: month.budgeted,
            activity: month.activity,
            to_be_budgeted: month.to_be_budgeted,
        }));
        return toTextResult(buildCompactListPayload("months", months, normalizeListLimit(input.limit)));
    }
    catch (error) {
        return toErrorResult(error);
    }
}
