import { z } from "zod";
import { buildCompactListPayload, normalizeListLimit, toErrorResult, toTextResult, withResolvedPlan, } from "./planToolUtils.js";
export const name = "ynab_list_payee_locations";
export const description = "Lists payee locations for a single YNAB plan.";
export const inputSchema = {
    planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
    limit: z.number().int().min(1).max(200).optional().describe("Max payee locations to return."),
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
        return toTextResult(buildCompactListPayload("payee_locations", payeeLocations, normalizeListLimit(input.limit)));
    }
    catch (error) {
        return toErrorResult(error);
    }
}
