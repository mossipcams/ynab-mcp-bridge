import { z } from "zod";
import * as ynab from "ynab";

import { getPlanId, toErrorResult, toTextResult } from "./planToolUtils.js";

export const name = "ynab_get_payee";
export const description = "Gets a single payee by ID.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  payeeId: z.string().describe("The payee ID to fetch."),
};

export async function execute(input: { planId?: string; payeeId: string }, api: ynab.API) {
  try {
    const planId = getPlanId(input.planId);
    const response = await api.payees.getPayeeById(planId, input.payeeId);
    return toTextResult({
      payee: response.data.payee,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
