import { z } from "zod";
import * as ynab from "ynab";

import { getPlanId, toErrorResult, toTextResult } from "./planToolUtils.js";

export const name = "ynab_get_plan_settings";
export const description = "Gets plan-level settings such as date and currency formatting.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
};

export async function execute(input: { planId?: string }, api: ynab.API) {
  try {
    const planId = getPlanId(input.planId);
    const response = await api.plans.getPlanSettingsById(planId);
    return toTextResult({
      settings: response.data.settings,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
