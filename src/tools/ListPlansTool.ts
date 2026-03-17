import { z } from "zod";
import * as ynab from "ynab";

import { buildCompactListPayload, normalizeListLimit, toErrorResult, toTextResult } from "./planToolUtils.js";

export const name = "ynab_list_plans";
export const description = "Lists all available YNAB plans and identifies the default plan when one exists.";
export const inputSchema = {
  limit: z.number().int().min(1).max(200).optional().describe("Max plans to return."),
};

export async function execute(input: { limit?: number }, api: ynab.API) {
  try {
    const response = await api.plans.getPlans();
    const plans = response.data.plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      last_modified_on: plan.last_modified_on,
    }));

    return toTextResult({
      ...buildCompactListPayload("plans", plans, normalizeListLimit(input.limit)),
      default_plan: response.data.default_plan
        ? {
            id: response.data.default_plan.id,
            name: response.data.default_plan.name,
          }
        : null,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
