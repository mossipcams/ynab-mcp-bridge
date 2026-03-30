import type * as ynab from "ynab";
import { z } from "zod";

import {
  assertTransactionMonth,
  buildTransactionCollectionResult,
  compareTransactions,
  transactionFields,
  type TransactionLike,
  type TransactionProjectionInput,
} from "../transactionQueryEngine.js";
import { toErrorResult, toTextResult, withResolvedPlan } from "../runtimePlanToolUtils.js";

type TransactionCollectionOptions<TInput extends TransactionProjectionInput> = {
  normalizeInput?: (input: TInput) => TInput;
};

async function runTransactionCollectionTool<TInput extends TransactionProjectionInput>(
  input: TInput,
  api: ynab.API,
  fetchTransactions: (
    api: ynab.API,
    planId: string,
    input: TInput,
  ) => Promise<readonly TransactionLike[]>,
  options: TransactionCollectionOptions<TInput> = {},
) {
  try {
    const normalizedInput = options.normalizeInput ? options.normalizeInput(input) : input;
    const transactions = await withResolvedPlan(
      normalizedInput.planId,
      api,
      async (planId) => fetchTransactions(api, planId, normalizedInput),
    );
    const sortedTransactions = Array.from(transactions)
      .filter((transaction) => !transaction.deleted)
      .sort((left, right) => compareTransactions(left, right, "date_desc"));

    return toTextResult({
      ...buildTransactionCollectionResult(
        sortedTransactions,
        normalizedInput,
        "transaction_count",
      ),
    });
  } catch (error) {
    return toErrorResult(error);
  }
}

export function createTransactionCollectionExecutor<TInput extends TransactionProjectionInput>(
  fetchTransactions: (
    api: ynab.API,
    planId: string,
    input: TInput,
  ) => Promise<readonly TransactionLike[]>,
  options: TransactionCollectionOptions<TInput> = {},
) {
  return async (input: TInput, api: ynab.API) => runTransactionCollectionTool(
    input,
    api,
    fetchTransactions,
    options,
  );
}

export type TransactionCollectionInput = TransactionProjectionInput;

export type IdFilteredTransactionCollectionInput<TKey extends string> =
  TransactionProjectionInput & Record<TKey, string>;

export type MonthTransactionCollectionInput = TransactionProjectionInput & {
  month: string;
};

export const transactionCollectionInputSchema = {
  planId: z.string().optional().describe("The YNAB plan ID. Falls back to YNAB_PLAN_ID."),
  limit: z.number().int().min(1).max(500).optional().describe("Maximum number of transactions to return."),
  offset: z.number().int().min(0).optional().describe("Number of transactions to skip before returning results."),
  includeIds: z.boolean().optional().describe("When false, omits transaction ids from the output."),
  fields: z.array(z.enum(transactionFields)).optional().describe("Optional transaction fields to include in each row."),
};

export function buildTransactionCollectionInputSchema<TExtra extends Record<string, unknown>>(extra: TExtra) {
  return {
    ...transactionCollectionInputSchema,
    ...extra,
  };
}

export const listTransactionCollectionExecutor =
  createTransactionCollectionExecutor<TransactionCollectionInput>(
    async (api, planId) => (await api.transactions.getTransactions(
      planId,
      undefined,
      undefined,
      undefined,
    )).data.transactions,
  );

export const monthTransactionCollectionExecutor =
  createTransactionCollectionExecutor<MonthTransactionCollectionInput>(
    async (api, planId, normalizedInput) => (await api.transactions.getTransactionsByMonth(
      planId,
      normalizedInput.month,
      undefined,
      undefined,
      undefined,
    )).data.transactions,
    {
      normalizeInput: (value) => ({
        ...value,
        month: assertTransactionMonth(value.month),
      }),
    },
  );

export function createIdFilteredTransactionCollectionExecutor<TKey extends string>(
  fetchTransactions: (
    transactions: ynab.API["transactions"],
    planId: string,
    id: string,
  ) => Promise<readonly TransactionLike[]>,
  selectorKey: TKey,
) {
  return createTransactionCollectionExecutor<IdFilteredTransactionCollectionInput<TKey>>(
    async (api, planId, input) => fetchTransactions(
      api.transactions,
      planId,
      input[selectorKey],
    ),
  );
}
