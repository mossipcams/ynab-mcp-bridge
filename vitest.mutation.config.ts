import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/collectionToolUtils.spec.ts",
      "src/transactionQueryEngine.spec.ts",
      "src/mutationTooling.spec.ts",
    ],
  },
});
