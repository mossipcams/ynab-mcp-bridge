import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const srcRoot = path.join(projectRoot, "src");
const featuresDir = path.join(srcRoot, "features");
const toolsDir = path.join(srcRoot, "tools");

function getProductionTypeScriptFiles(directoryPath: string): string[] {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      return getProductionTypeScriptFiles(entryPath);
    }

    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".spec.ts")) {
      return [];
    }

    return [entryPath];
  });
}

describe("feature module boundaries", () => {
  it("treats capability modules under src/features as the canonical MCP middle layer", () => {
    expect(readdirSync(featuresDir).sort()).toEqual([
      "accounts",
      "financialHealth",
      "index.ts",
      "meta",
      "moneyMovements",
      "payees",
      "plans",
      "transactions",
    ]);
  });

  it("keeps production feature modules independent from src/tools", () => {
    const featureFiles = getProductionTypeScriptFiles(featuresDir);

    for (const featureFile of featureFiles) {
      const source = readFileSync(featureFile, "utf8");

      expect(
        source,
        `${path.relative(srcRoot, featureFile)} should not import from src/tools`,
      ).not.toMatch(/from ["'][.]{2}\/[.]{2}\/tools\//);
      expect(
        source,
        `${path.relative(srcRoot, featureFile)} should not re-export from src/tools`,
      ).not.toMatch(/export \* from ["'][.]{2}\/[.]{2}\/tools\//);
    }
  });

  it("keeps src/tools limited to compatibility wrappers or shared-kernel helpers", () => {
    const toolFiles = getProductionTypeScriptFiles(toolsDir);
    const approvedSharedHelpers = new Set([
      "cachedYnabReads.ts",
      "collectionToolUtils.ts",
      "errorUtils.ts",
      "financeToolUtils.ts",
      "planToolUtils.ts",
    ]);

    for (const toolFile of toolFiles) {
      const source = readFileSync(toolFile, "utf8").trim();
      const basename = path.basename(toolFile);
      const isSharedHelper = approvedSharedHelpers.has(basename);
      const isCompatibilityWrapper = /^export \* from "\.\.\/features\/.+";$/.test(source);

      expect(
        isSharedHelper || isCompatibilityWrapper,
        `${basename} should be a shared helper or a one-line compatibility wrapper`,
      ).toBe(true);
    }
  });
});
