import { describe, expect, it } from "vitest";

import { createTransactionCollectionExecutor } from "./features/transactions/transactionCollectionToolUtils.js";

type ToolResult = {
  isError?: boolean;
  content: Array<{
    text: string;
  }>;
};

function readResult(result: ToolResult) {
  return JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("transaction collection tool utils", () => {
  it("ignores deleted rows before sorting so malformed deleted transactions do not break the response", async () => {
    const execute = createTransactionCollectionExecutor(async () => [
      {
        id: "txn-visible",
        date: "2026-03-05",
        amount: -2500,
        payee_name: "Grocer",
        category_name: "Groceries",
        account_name: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
      },
      {
        id: "txn-deleted",
        amount: -1000,
        deleted: true,
        get date() {
          throw new Error("deleted rows should not be sorted");
        },
      },
    ]);

    const result = await execute({
      planId: "plan-1",
    }, {} as never) as ToolResult;

    expect(result.isError).not.toBe(true);
    expect(readResult(result)).toEqual({
      transactions: [
        {
          id: "txn-visible",
          date: "2026-03-05",
          amount: "-2.50",
          payee_name: "Grocer",
          category_name: "Groceries",
          account_name: "Checking",
          approved: true,
          cleared: "cleared",
        },
      ],
      transaction_count: 1,
    });
  });
});
