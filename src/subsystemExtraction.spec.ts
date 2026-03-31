import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

type ModuleContract = {
  exports: string[];
  path: string;
};

const moduleContracts: ModuleContract[] = [
  {
    exports: ["defineTool", "registerServerTools", "createServer"],
    path: "./serverRuntime.ts",
  },
  {
    exports: ["startHttpServer"],
    path: "./httpTransport.ts",
  },
  {
    exports: ["installAuthV2Routes"],
    path: "./auth2/http/routes.ts",
  },
  {
    exports: ["createOAuthStore"],
    path: "./grantPersistence.ts",
  },
  {
    exports: ["createOAuthCore"],
    path: "./grantLifecycle.ts",
  },
];

const retiredShimPaths = [
  "./server.ts",
  "./httpServer.ts",
  "./httpServerMcpRoute.ts",
  "./httpServerOAuthRoutes.ts",
  "./mcpAuthServer.ts",
  "./oauthBroker.ts",
  "./oauthCore.ts",
  "./oauthStore.ts",
] as const;

function getAbsolutePath(relativePath: string) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

function getSourceFiles(directoryPath: string): string[] {
  return readdirSync(directoryPath).flatMap((entryName) => {
    const entryPath = path.join(directoryPath, entryName);
    const entryStats = statSync(entryPath);

    if (entryStats.isDirectory()) {
      return getSourceFiles(entryPath);
    }

    if (!entryPath.endsWith(".ts") || entryPath.endsWith(".spec.ts")) {
      return [];
    }

    return [entryPath];
  });
}

describe("modular monolith subsystem extraction contracts", () => {
  it("exposes the planned subsystem modules through enforceable runtime exports", async () => {
    for (const contract of moduleContracts) {
      const absolutePath = getAbsolutePath(contract.path);

      expect(existsSync(absolutePath), `${contract.path} should exist`).toBe(true);

      const importedModule = await import(pathToFileURL(absolutePath).href);

      for (const exportName of contract.exports) {
        expect(
          importedModule,
          `${contract.path} should export ${exportName}`,
        ).toHaveProperty(exportName);
      }
    }
  });

  it("removes the transitional shim entrypoints and blocks production imports from targeting them", () => {
    const sourceFiles = getSourceFiles(path.dirname(fileURLToPath(import.meta.url)));

    for (const retiredShimPath of retiredShimPaths) {
      const shimAbsolutePath = getAbsolutePath(retiredShimPath);
      const shimImportPath = retiredShimPath.replace(/\.ts$/, ".js").replace(/^\.\//, "");
      const shimImportPattern = new RegExp(String.raw`\bfrom ["'][^"']*${shimImportPath}["']`);

      expect(
        existsSync(shimAbsolutePath),
        `${retiredShimPath} should be deleted after the extraction completes`,
      ).toBe(false);

      for (const sourceFile of sourceFiles) {
        const sourceText = readFileSync(sourceFile, "utf8");

        expect(
          sourceText,
          `${path.relative(path.dirname(fileURLToPath(import.meta.url)), sourceFile)} should not import ${shimImportPath}`,
        ).not.toMatch(shimImportPattern);
      }
    }
  });
});
