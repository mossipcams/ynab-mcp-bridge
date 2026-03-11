import { z } from "zod";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_list_payee_locations";
export const description = "Lists payee locations for a single YNAB plan.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.payeeLocations.getPayeeLocations(planId));
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
    }
    catch (error) {
        return toErrorResult(error);
    }
}
