import { z } from "zod";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_get_payee_location";
export const description = "Gets a single payee location by ID.";
export const inputSchema = {
    planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
    payeeLocationId: z.string().describe("The payee location ID to fetch."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.payeeLocations.getPayeeLocationById(planId, input.payeeLocationId));
        return toTextResult({
            payee_location: response.data.payee_location,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
