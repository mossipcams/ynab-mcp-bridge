import { describe, expect, it } from "vitest";

import { toDisplayTransactions, transactionFields } from "./tools/transactionToolUtils.js";

describe("transaction tool utils", () => {
  it("exports the shared transaction display fields for browse-style tools", () => {
    expect(transactionFields).toEqual([
      "date",
      "amount",
      "payee_name",
      "category_name",
      "account_name",
      "approved",
      "cleared",
    ]);
  });

  it("formats browse transactions while omitting deleted entries", () => {
    expect(toDisplayTransactions([
      {
        id: "tx-1",
        date: "2026-03-01",
        amount: -2500,
        deleted: false,
        payee_name: "Grocer",
        category_name: "Groceries",
        account_name: "Checking",
        approved: true,
        cleared: "cleared",
      },
      {
        id: "tx-2",
        date: "2026-03-02",
        amount: -1000,
        deleted: true,
        payee_name: "Cafe",
        category_name: "Coffee",
        account_name: "Checking",
      },
    ])).toEqual([
      {
        id: "tx-1",
        date: "2026-03-01",
        amount: "-2.50",
        payee_name: "Grocer",
        category_name: "Groceries",
        account_name: "Checking",
        approved: true,
        cleared: "cleared",
      },
    ]);
  });
});
