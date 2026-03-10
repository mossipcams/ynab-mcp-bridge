import { z } from "zod";
import { getPlanId, toErrorResult, toTextResult } from "./planToolUtils.js";
export const name = "ynab_get_account";
export const description = "Gets a single account by ID.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    accountId: z.string().describe("The account ID to fetch."),
};
export async function execute(input, api) {
    try {
        const planId = getPlanId(input.planId);
        const response = await api.accounts.getAccountById(planId, input.accountId);
        return toTextResult({
            account: response.data.account,
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
