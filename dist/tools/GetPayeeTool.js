import { z } from "zod";
import { compactObject } from "./financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../runtimePlanToolUtils.js";
export const name = "ynab_get_payee";
export const description = "Gets a single payee by ID. Returns a compact projection by default, with an explicit full-view opt-in.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    payeeId: z.string().describe("The payee ID to fetch."),
    view: z.enum(["compact", "full"]).default("compact").optional().describe("Returns a compact projection by default, or the full payee payload when set to 'full'."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.payees.getPayeeById(planId, input.payeeId));
        const payee = response.data.payee;
        if (input.view === "full") {
            return toTextResult({
                payee,
            });
        }
        return toTextResult({
            payee: compactObject({
                id: payee.id,
                name: payee.name,
                transfer_account_id: payee.transfer_account_id,
            }),
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
