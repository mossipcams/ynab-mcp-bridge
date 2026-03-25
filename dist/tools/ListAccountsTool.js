import { z } from "zod";
import { formatAmountMilliunits, renderCollectionResult, } from "./collectionToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "./planToolUtils.js";
export const name = "ynab_list_accounts";
export const description = "Lists accounts for a YNAB plan with optional compact projections and pagination.";
const accountFields = [
    "name",
    "type",
    "closed",
    "balance",
];
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    limit: z.number().int().min(1).max(500).optional().describe("Maximum number of accounts to return."),
    offset: z.number().int().min(0).optional().describe("Number of accounts to skip before returning results."),
    includeIds: z.boolean().optional().describe("When false, omits account ids from the output."),
    fields: z.array(z.enum(accountFields)).optional().describe("Optional account fields to include in each row."),
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
            balance: formatAmountMilliunits(account.balance),
        }));
        return toTextResult(renderCollectionResult(accounts, accountFields, input, "accounts", "account_count"));
    }
    catch (error) {
        return toErrorResult(error);
    }
}
