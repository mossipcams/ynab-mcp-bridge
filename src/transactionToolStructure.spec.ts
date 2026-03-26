import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const transactionToolFiles = [
  "ListTransactionsTool.ts",
  "GetTransactionsByMonthTool.ts",
  "GetTransactionsByAccountTool.ts",
  "GetTransactionsByCategoryTool.ts",
  "GetTransactionsByPayeeTool.ts",
] as const;

describe("transaction tool structure", () => {
  it("routes transaction collection tools through a shared wrapper helper", () => {
    expect(existsSync(new URL("./tools/transactionCollectionToolUtils.ts", import.meta.url))).toBe(true);

    for (const file of transactionToolFiles) {
      const source = readFileSync(new URL(`./tools/${file}`, import.meta.url), "utf8");

      expect(source).toContain("transactionCollectionToolUtils");
      expect(
        source.includes("createIdFilteredTransactionCollectionExecutor")
        || source.includes("listTransactionCollectionExecutor")
        || source.includes("monthTransactionCollectionExecutor"),
      ).toBe(true);
      expect(source).not.toContain("buildTransactionCollectionResult");
      expect(source).not.toContain("toDisplayTransactions");
    }
  });
});
