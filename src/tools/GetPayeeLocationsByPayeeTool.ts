import { z } from "zod";
import * as ynab from "ynab";

import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";

export const name = "ynab_get_payee_locations_by_payee";
export const description = "Gets payee locations for a single payee.";
export const inputSchema = {
  planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
  payeeId: z.string().describe("The payee ID to filter by."),
};

export async function execute(input: { planId?: string; payeeId: string }, api: ynab.API) {
  try {
    const response = await withResolvedPlan(input.planId, api, async (planId) => api.payeeLocations.getPayeeLocationsByPayee(planId, input.payeeId));
    const payeeLocations = response.data.payee_locations
      .filter((location) => !location.deleted)
      .map((location) => ({
        id: location.id,
        payee_id: location.payee_id,
        latitude: location.latitude,
        longitude: location.longitude,
      }));

    return toTextResult({
      payee_locations: payeeLocations,
      payee_location_count: payeeLocations.length,
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
