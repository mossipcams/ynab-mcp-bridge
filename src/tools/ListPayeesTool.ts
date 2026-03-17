import { z } from "zod";
import * as ynab from "ynab";

import {
  buildCompactListPayload,
  normalizeListLimit,
  toErrorResult,
  toTextResult,
  withResolvedPlan,
} from "./planToolUtils.js";

export const name = "ynab_list_payees";
export const description = "Lists payees for a single YNAB plan.";
export const inputSchema = {
  planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
  limit: z.number().int().min(1).max(200).optional().describe("Max payees to return."),
};

export async function execute(input: { planId?: string; limit?: number }, api: ynab.API) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.payees.getPayees(planId));
    const payees = response.data.payees
      .filter((payee) => !payee.deleted)
      .map((payee) => ({
        id: payee.id,
        name: payee.name,
        transfer_account_id: payee.transfer_account_id,
      }));

    return toTextResult(buildCompactListPayload("payees", payees, normalizeListLimit(input.limit)));
  } catch (error) {
    return toErrorResult(error);
  }
}
