import { z } from "zod";
import * as ynab from "ynab";

import { buildUpcomingWindowSummary, expandScheduledOccurrences, formatMilliunits } from "../../financeToolUtils.js";
import { getCachedScheduledTransactions } from "../../cachedYnabReads.js";
import type { OutputFormat } from "../../runtimePlanToolUtils.js";
import { toErrorResult, toProseResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";
import { buildProse, proseItem } from "./proseFormatUtils.js";

export const name = "ynab_get_upcoming_obligations";
export const description =
  "Upcoming scheduled inflows and outflows across 7, 14, and 30 day windows.";
export const inputSchema = {
  planId: z.string().optional().describe("Plan ID (uses env default)"),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Anchor date (ISO)"),
  topN: z.number().int().min(1).max(10).default(5).describe("Top N results"),
  format: z.enum(["compact", "pretty", "prose"]).default("compact").describe("Output format."),
};

const WINDOW_DAYS = [7, 14, 30] as const;

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function execute(
  input: { planId?: string; asOfDate?: string; topN?: number; format?: OutputFormat },
  api: ynab.API,
) {
  try {
    const asOfDate = input.asOfDate ?? getTodayIsoDate();
    const topN = input.topN ?? 5;
    const format = input.format ?? "compact";

    return await withResolvedPlan(input.planId, api, async (planId) => {
      const response = await getCachedScheduledTransactions(api, planId);
      const scheduledTransactions = expandScheduledOccurrences(
        response.data.scheduled_transactions.filter((transaction) => !transaction.deleted),
        asOfDate,
        30,
      )
        .sort((left, right) => {
          const dayDifference = left.days_until_due - right.days_until_due;
          if (dayDifference !== 0) {
            return dayDifference;
          }

          return Math.abs(right.amount) - Math.abs(left.amount);
        });

      const windows = Object.fromEntries(
        WINDOW_DAYS.map((windowDays) => {
          const windowTransactions = scheduledTransactions.filter((transaction) => transaction.days_until_due <= windowDays);
          const inflows = windowTransactions
            .filter((transaction) => transaction.amount > 0)
            .reduce((sum, transaction) => sum + transaction.amount, 0);
          const outflows = windowTransactions
            .filter((transaction) => transaction.amount < 0)
            .reduce((sum, transaction) => sum + transaction.amount, 0);
          const outflowCount = windowTransactions.filter((transaction) => transaction.amount < 0).length;
          const inflowCount = windowTransactions.filter((transaction) => transaction.amount > 0).length;

          return [
            `${windowDays}d`,
            {
              ...buildUpcomingWindowSummary(inflows, outflows),
              obligation_count: outflowCount,
              expected_inflow_count: inflowCount,
            },
          ];
        }),
      );

      const payload = {
        as_of_date: asOfDate,
        obligation_count: scheduledTransactions.filter((transaction) => transaction.amount < 0).length,
        expected_inflow_count: scheduledTransactions.filter((transaction) => transaction.amount > 0).length,
        windows,
        top_due: scheduledTransactions.slice(0, topN).map((transaction) => ({
          id: transaction.id,
          date_next: transaction.occurrence_date,
          payee_name: transaction.payee_name,
          category_name: transaction.category_name,
          account_name: transaction.account_name,
          amount: formatMilliunits(Math.abs(transaction.amount)),
          type: transaction.amount >= 0 ? "inflow" : "outflow",
        })),
      };

      if (format === "prose") {
        return toProseResult(buildProse(
          `Upcoming Obligations (${payload.as_of_date})`,
          [
            ["obligations", payload.obligation_count],
            ["expected_inflows", payload.expected_inflow_count],
            ["net_30d", payload.windows["30d"]?.net_upcoming],
          ],
          [
            { heading: "Windows", items: WINDOW_DAYS.map((windowDays) => proseItem(`${windowDays}d`, payload.windows[`${windowDays}d`]?.net_upcoming)) },
            { heading: "Top Due", items: payload.top_due.map((entry) => proseItem(entry.date_next, entry.payee_name, entry.amount, entry.type)) },
          ],
        ));
      }

      return toTextResult(payload, format);
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
