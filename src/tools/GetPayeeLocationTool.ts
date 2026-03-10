import { z } from "zod";
import * as ynab from "ynab";

import { getPlanId, toErrorResult, toTextResult } from "./planToolUtils.js";

export const name = "ynab_get_payee_location";
export const description = "Gets a single payee location by ID.";
export const inputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  payeeLocationId: z.string().describe("The payee location ID to fetch."),
};

export async function execute(input: { planId?: string; payeeLocationId: string }, api: ynab.API) {
  try {
    const planId = getPlanId(input.planId);
    const response = await api.payeeLocations.getPayeeLocationById(planId, input.payeeLocationId);
    return toTextResult({
      payee_location: response.data.payee_location,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
