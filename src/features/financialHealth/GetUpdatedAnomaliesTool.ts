import { z } from "zod";
import * as ynab from "ynab";

import { getCachedPlanMonth } from "../../cachedYnabReads.js";
import { createAnalysisSession, getAnalysisSession } from "../../financialAnalysisState.js";
import { formatAmount, formatPercent, previousMonths } from "./financialDiagnosticsUtils.js";
import { buildCategorySpentLookup, buildSpendingAnomalies, isCreditCardPaymentCategoryName } from "../../financeToolUtils.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../../runtimePlanToolUtils.js";

type AnomalyEntry = {
  category_id: string;
  category_name: string;
  latest_spent: string;
  baseline_average: string;
  change_percent: string;
};

type SpendingAnomalyAnalysisPayload = {
  latestMonth: string;
  anomalies: AnomalyEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAnomalyEntry(value: unknown): value is AnomalyEntry {
  return isRecord(value)
    && typeof value["category_id"] === "string"
    && typeof value["category_name"] === "string"
    && typeof value["latest_spent"] === "string"
    && typeof value["baseline_average"] === "string"
    && typeof value["change_percent"] === "string";
}

function isSpendingAnomalyAnalysisPayload(value: unknown): value is SpendingAnomalyAnalysisPayload {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value["latestMonth"] === "string"
    && Array.isArray(value["anomalies"])
    && value["anomalies"].every(isAnomalyEntry);
}

export const name = "ynab_get_updated_anomalies";
export const description =
  "Returns only the added, removed, or changed anomalies relative to a prior anomaly analysis token.";
export const inputSchema = {
  analysisToken: z.string().describe("Token returned by a prior spending anomalies analysis."),
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  latestMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Month to compare against the prior anomaly analysis."),
  baselineMonths: z.number().int().min(1).max(12).default(3).describe("How many trailing months to use as the baseline."),
  topN: z.number().int().min(1).max(10).default(5).describe("Maximum number of anomalies to include."),
  thresholdMultiplier: z.number().min(1).default(1.5).describe("Minimum multiple over the baseline average to flag."),
  minimumDifference: z.number().int().min(0).default(50000).describe("Minimum milliunit increase over baseline to flag."),
};

function getChangedAnomalies(current: AnomalyEntry[], previousById: Map<string, AnomalyEntry>) {
  return current.filter((entry) => {
    const previous = previousById.get(entry.category_id);
    return previous !== undefined
      && (
        previous.latest_spent !== entry.latest_spent
        || previous.baseline_average !== entry.baseline_average
        || previous.change_percent !== entry.change_percent
      );
  });
}

export async function execute(
  input: {
    analysisToken: string;
    planId?: string;
    latestMonth: string;
    baselineMonths?: number;
    topN?: number;
    thresholdMultiplier?: number;
    minimumDifference?: number;
  },
  api: ynab.API,
) {
  try {
    const previousSession = getAnalysisSession(api, input.analysisToken);

    if (!previousSession || previousSession.kind !== "spending_anomalies") {
      throw new Error("Analysis token is invalid or has expired.");
    }
    if (!isSpendingAnomalyAnalysisPayload(previousSession.payload)) {
      throw new Error("Analysis token payload is invalid.");
    }

    const previousPayload = previousSession.payload;
    const baselineMonths = input.baselineMonths ?? 3;
    const topN = input.topN ?? 5;
    const thresholdMultiplier = input.thresholdMultiplier ?? 1.5;
    const minimumDifference = input.minimumDifference ?? 50000;

    return await withResolvedPlan(input.planId ?? previousSession.planId, api, async (planId) => {
      const baselineMonthIds = previousMonths(input.latestMonth, baselineMonths);
      const responses = await Promise.all([
        ...baselineMonthIds.map((month) => getCachedPlanMonth(api, planId, month)),
        getCachedPlanMonth(api, planId, input.latestMonth),
      ]);
      const baselineResponses = responses.slice(0, baselineMonthIds.length);
      const latestResponse = responses[responses.length - 1];
      const baselineSpentLookups = buildCategorySpentLookup(baselineResponses);

      if (!latestResponse) {
        throw new Error("Latest month response was not returned.");
      }

      const latestCategories = latestResponse.data.month.categories.filter((category) => (
        !category.deleted
        && !category.hidden
        && !isCreditCardPaymentCategoryName(category.category_group_name)
      ));
      const currentAnomalies = buildSpendingAnomalies({
        baselineSpentLookups,
        categories: latestCategories,
        formatAmount,
        formatPercent,
        minimumDifference,
        thresholdMultiplier,
        topN,
      });
      const previousById = new Map<string, AnomalyEntry>(
        previousPayload.anomalies.map((entry) => [entry.category_id, entry]),
      );
      const currentIds = new Set(currentAnomalies.map((entry) => entry.category_id));
      const addedAnomalies = currentAnomalies.filter((entry) => !previousById.has(entry.category_id));
      const removedAnomalyIds = previousPayload.anomalies
        .filter((entry) => !currentIds.has(entry.category_id))
        .map((entry) => entry.category_id);
      const changedAnomalies = getChangedAnomalies(currentAnomalies, previousById);
      const session = createAnalysisSession(api, {
        kind: "spending_anomalies",
        planId,
        payload: {
          latestMonth: input.latestMonth,
          anomalies: currentAnomalies,
        } satisfies SpendingAnomalyAnalysisPayload,
      });

      return toTextResult({
        previous_analysis_token: input.analysisToken,
        analysis_token: session.token,
        latest_month: input.latestMonth,
        current_anomaly_count: currentAnomalies.length,
        added_anomalies: addedAnomalies,
        removed_anomaly_ids: removedAnomalyIds,
        changed_anomalies: changedAnomalies,
      });
    });
  } catch (error) {
    return toErrorResult(error);
  }
}
