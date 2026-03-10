import { z } from "zod";
import * as ynab from "ynab";

import { getPlanId, toErrorResult, toTextResult } from "./planToolUtils.js";

export const name = "ynab_list_plan_months";
export const description = "Lists plan month summaries for budgeting analysis.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
};

export async function execute(input: { planId?: string }, api: ynab.API) {
  try {
    const planId = getPlanId(input.planId);
    const response = await api.months.getPlanMonths(planId);
    const months = response.data.months
      .filter((month) => !month.deleted)
      .map((month) => ({
        month: month.month,
        income: month.income,
        budgeted: month.budgeted,
        activity: month.activity,
        to_be_budgeted: month.to_be_budgeted,
      }));

    return toTextResult({
      months,
      month_count: months.length,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
