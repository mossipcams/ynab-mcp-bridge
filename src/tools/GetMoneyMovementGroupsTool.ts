import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_get_money_movement_groups";
export const description = "Gets all money movement groups for a single YNAB plan.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
};

export async function execute(input: { planId?: string }, api: ynab.API) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.moneyMovements.getMoneyMovementGroups(planId));
    return toTextResult({
      money_movement_groups: response.data.money_movement_groups,
      count: response.data.money_movement_groups.length,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
