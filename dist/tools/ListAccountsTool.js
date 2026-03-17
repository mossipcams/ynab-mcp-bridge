import { z } from "zod";
import { buildCompactListPayload, normalizeListLimit, toErrorResult, toTextResult, withResolvedPlan, } from "./planToolUtils.js";
export const name = "ynab_list_accounts";
export const description = "Lists accounts for a single YNAB plan.";
export const inputSchema = {
    planId: z.string().optional().describe("YNAB plan ID. Defaults to YNAB_PLAN_ID."),
    limit: z.number().int().min(1).max(200).optional().describe("Max accounts to return."),
};
export async function execute(input, api) {
    try {
        const response = await withResolvedPlan(input.planId, api, async (planId) => api.accounts.getAccounts(planId));
        const accounts = response.data.accounts
            .filter((account) => !account.deleted)
            .map((account) => ({
            id: account.id,
            name: account.name,
            type: account.type,
            closed: account.closed,
            balance: (account.balance / 1000).toFixed(2),
        }));
        return toTextResult(buildCompactListPayload("accounts", accounts, normalizeListLimit(input.limit)));
    }
    catch (error) {
        return toErrorResult(error);
    }
}
