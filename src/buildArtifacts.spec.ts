import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("build artifact hygiene", () => {
  it("excludes oauth test helpers from the runtime TypeScript build", () => {
    const tsconfig = JSON.parse(
      readFileSync(new URL("../tsconfig.json", import.meta.url), "utf8"),
    ) as {
      exclude?: string[];
    };

    expect(tsconfig.exclude).toEqual(expect.arrayContaining([
      "src/oauthTestHelpers.ts",
    ]));
  });

  it("does not ship contract-only modules in dist", () => {
    const distDir = new URL("../dist/", import.meta.url);
    const stack = [distDir];
    const distFiles: string[] = [];

    while (stack.length > 0) {
      const current = stack.pop()!;

      for (const entry of readdirSync(current, {
        withFileTypes: true,
      })) {
        const entryPath = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, current);

        if (entry.isDirectory()) {
          stack.push(entryPath);
          continue;
        }

        distFiles.push(path.posix.normalize(entryPath.pathname));
      }
    }

    expect(distFiles.filter((file) => file.endsWith(".contract.js"))).toEqual([]);
  });

  it("does not ship auth2 harness modules in dist", () => {
    const distDir = new URL("../dist/", import.meta.url);
    const stack = [distDir];
    const distFiles: string[] = [];

    while (stack.length > 0) {
      const current = stack.pop()!;

      for (const entry of readdirSync(current, {
        withFileTypes: true,
      })) {
        const entryPath = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, current);

        if (entry.isDirectory()) {
          stack.push(entryPath);
          continue;
        }

        distFiles.push(path.posix.normalize(entryPath.pathname));
      }
    }

    expect(distFiles.filter((file) => file.includes("/auth2/harness/"))).toEqual([]);
  });
});
