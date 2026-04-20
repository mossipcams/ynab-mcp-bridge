import { z } from "zod";
import { compactObject, formatMilliunits, isWithinMonthRange, normalizeMonthRange, } from "../../financeToolUtils.js";
import { createAnalysisSession, getAnalysisSession } from "../../financialAnalysisState.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";
const rollupDirection = (value) => value >= 0 ? "increase" : "decrease";
export const name = "ynab_get_spending_change_explanation";
export const description = "Explains spending change between two periods with compact category and payee drivers for drill-down.";
export const inputSchema = {
    planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
    analysisToken: z.string().optional().describe("Token returned by a prior spending change explanation for server-side refinement."),
    periodAFromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).describe("The first month in period A."),
    periodAToMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("The last month in period A. Defaults to periodAFromMonth."),
    periodBFromMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).describe("The first month in period B."),
    periodBToMonth: z.string().regex(/^(current|\d{4}-\d{2}-\d{2})$/).optional().describe("The last month in period B. Defaults to periodBFromMonth."),
    topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of category and payee drivers to include."),
    focusType: z.enum(["category", "payee"]).optional().describe("Optional driver type to refine from a prior spending change explanation."),
    focusId: z.string().optional().describe("Optional category or payee id used with analysisToken refinement."),
};
function buildFocusPayload(entry) {
    return {
        ...entry.id ? { id: entry.id } : {},
        name: entry.name,
        period_a_spent: entry.period_a_spent,
        period_b_spent: entry.period_b_spent,
        change: entry.change,
        change_direction: entry.change_direction,
    };
}
function addDriverRollup(bucket, key, value) {
    const current = bucket.get(key);
    if (current) {
        current.periodASpentMilliunits += value.periodASpentMilliunits;
        current.periodBSpentMilliunits += value.periodBSpentMilliunits;
        return;
    }
    bucket.set(key, {
        id: value.id,
        name: value.name,
        periodASpentMilliunits: value.periodASpentMilliunits,
        periodBSpentMilliunits: value.periodBSpentMilliunits,
    });
}
function buildDriverPayload(entries, topN) {
    return entries
        .map((entry) => ({
        ...entry,
        changeMilliunits: entry.periodBSpentMilliunits - entry.periodASpentMilliunits,
    }))
        .filter((entry) => entry.changeMilliunits !== 0)
        .sort((left, right) => {
        const changeDifference = Math.abs(right.changeMilliunits) - Math.abs(left.changeMilliunits);
        if (changeDifference !== 0) {
            return changeDifference;
        }
        return left.name.localeCompare(right.name);
    })
        .slice(0, topN)
        .map((entry) => ({
        ...entry.id ? { id: entry.id } : {},
        name: entry.name,
        period_a_spent: formatMilliunits(entry.periodASpentMilliunits),
        period_b_spent: formatMilliunits(entry.periodBSpentMilliunits),
        change: formatMilliunits(Math.abs(entry.changeMilliunits)),
        change_direction: rollupDirection(entry.changeMilliunits),
    }));
}
function buildPeriodSummary(range, spentMilliunits, transactionCount) {
    return {
        from_month: range.fromMonth,
        to_month: range.toMonth,
        spent: formatMilliunits(spentMilliunits),
        transaction_count: transactionCount,
    };
}
function getEarliestMonth(...months) {
    return months.slice().sort((left, right) => left.localeCompare(right))[0];
}
export async function execute(input, api) {
    try {
        if (input.analysisToken) {
            const session = getAnalysisSession(api, input.analysisToken);
            if (!session || session.kind !== "spending_change") {
                throw new Error("Analysis token is invalid or has expired.");
            }
            if (!input.focusType || !input.focusId) {
                throw new Error("Analysis token refinement requires focusType and focusId.");
            }
            const payload = session.payload;
            const focusEntries = input.focusType === "category"
                ? payload.topCategoryDrivers
                : payload.topPayeeDrivers;
            const focus = focusEntries.find((entry) => entry.id === input.focusId);
            if (!focus) {
                throw new Error(`No ${input.focusType} driver found for ${input.focusId}.`);
            }
            return toTextResult({
                analysis_token: session.token,
                focus_type: input.focusType,
                focus_id: input.focusId,
                focus: buildFocusPayload(focus),
            });
        }
        const periodA = normalizeMonthRange(input.periodAFromMonth, input.periodAToMonth);
        const periodB = normalizeMonthRange(input.periodBFromMonth, input.periodBToMonth);
        const topN = input.topN ?? 5;
        const earliestMonth = getEarliestMonth(periodA.fromMonth, periodB.fromMonth);
        return await withResolvedPlan(input.planId, api, async (planId) => {
            const response = await api.transactions.getTransactions(planId, earliestMonth, undefined, undefined);
            const categoryDrivers = new Map();
            const payeeDrivers = new Map();
            let periodASpentMilliunits = 0;
            let periodATransactionCount = 0;
            let periodBSpentMilliunits = 0;
            let periodBTransactionCount = 0;
            for (const transaction of response.data.transactions) {
                if (transaction.deleted || transaction.transfer_account_id || transaction.amount >= 0) {
                    continue;
                }
                const spendMilliunits = Math.abs(transaction.amount);
                const inPeriodA = isWithinMonthRange(transaction.date, periodA.fromMonth, periodA.toMonth);
                const inPeriodB = isWithinMonthRange(transaction.date, periodB.fromMonth, periodB.toMonth);
                if (!inPeriodA && !inPeriodB) {
                    continue;
                }
                if (inPeriodA) {
                    periodASpentMilliunits += spendMilliunits;
                    periodATransactionCount += 1;
                }
                if (inPeriodB) {
                    periodBSpentMilliunits += spendMilliunits;
                    periodBTransactionCount += 1;
                }
                const categoryId = transaction.category_id ?? "uncategorized";
                const categoryName = transaction.category_name ?? "Uncategorized";
                const payeeId = transaction.payee_id ?? "unknown-payee";
                const payeeName = transaction.payee_name ?? "Unknown Payee";
                addDriverRollup(categoryDrivers, categoryId, {
                    id: transaction.category_id ?? undefined,
                    name: categoryName,
                    periodASpentMilliunits: inPeriodA ? spendMilliunits : 0,
                    periodBSpentMilliunits: inPeriodB ? spendMilliunits : 0,
                });
                addDriverRollup(payeeDrivers, payeeId, {
                    id: transaction.payee_id ?? undefined,
                    name: payeeName,
                    periodASpentMilliunits: inPeriodA ? spendMilliunits : 0,
                    periodBSpentMilliunits: inPeriodB ? spendMilliunits : 0,
                });
            }
            const changeMilliunits = periodBSpentMilliunits - periodASpentMilliunits;
            const changePercent = periodASpentMilliunits === 0
                ? undefined
                : ((changeMilliunits / periodASpentMilliunits) * 100).toFixed(2);
            const topCategoryDrivers = buildDriverPayload(Array.from(categoryDrivers.values()), topN);
            const topPayeeDrivers = buildDriverPayload(Array.from(payeeDrivers.values()), topN);
            const session = createAnalysisSession(api, {
                kind: "spending_change",
                planId,
                payload: {
                    topCategoryDrivers,
                    topPayeeDrivers,
                },
            });
            return toTextResult({
                analysis_token: session.token,
                period_a: buildPeriodSummary(periodA, periodASpentMilliunits, periodATransactionCount),
                period_b: buildPeriodSummary(periodB, periodBSpentMilliunits, periodBTransactionCount),
                change: compactObject({
                    amount: formatMilliunits(Math.abs(changeMilliunits)),
                    direction: rollupDirection(changeMilliunits),
                    percent: changePercent,
                }),
                top_category_drivers: topCategoryDrivers,
                top_payee_drivers: topPayeeDrivers,
            });
        });
    }
    catch (error) {
        return toErrorResult(error);
    }
}
