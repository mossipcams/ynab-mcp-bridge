import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("code quality guardrails", () => {
  it("defines Dependency Cruiser architecture enforcement in repo config, package scripts, and CI", () => {
    expect(existsSync(new URL("../.dependency-cruiser.js", import.meta.url))).toBe(true);

    const dependencyCruiserConfig = readFileSync(
      new URL("../.dependency-cruiser.js", import.meta.url),
      "utf8",
    );
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(dependencyCruiserConfig).toContain("entry");
    expect(dependencyCruiserConfig).toContain("transport");
    expect(dependencyCruiserConfig).toContain("composition");
    expect(dependencyCruiserConfig).toContain("domain");
    expect(dependencyCruiserConfig).toContain("from.path");
    expect(dependencyCruiserConfig).toContain("to.path");
    expect(packageJson.devDependencies["dependency-cruiser"]).toBeTruthy();
    expect(packageJson.scripts["lint:deps"]).toBeTruthy();
    expect(workflow).toContain("Run dependency rules");
    expect(workflow).toContain("npm run lint:deps");
  });

  it("defines strict type-aware ESLint in repo config, package scripts, and CI", () => {
    expect(existsSync(new URL("../eslint.config.mjs", import.meta.url))).toBe(true);

    const eslintConfig = readFileSync(
      new URL("../eslint.config.mjs", import.meta.url),
      "utf8",
    );
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(packageJson.devDependencies.eslint).toBeTruthy();
    expect(packageJson.devDependencies["@typescript-eslint/eslint-plugin"]).toBeTruthy();
    expect(packageJson.devDependencies["@typescript-eslint/parser"]).toBeTruthy();
    expect(packageJson.scripts.lint).toBeTruthy();
    expect(eslintConfig).toContain("strictTypeChecked");
    expect(eslintConfig).toContain("parserOptions");
    expect(eslintConfig).toContain("projectService");
    expect(eslintConfig).not.toContain('files: ["src/server.ts"]');
    expect(workflow).toContain("Run ESLint");
    expect(workflow).toContain("npm run lint");
  });

  it("defines Knip dead-code detection in repo config, package scripts, and CI", () => {
    expect(existsSync(new URL("../knip.json", import.meta.url))).toBe(true);

    const knipConfig = readFileSync(
      new URL("../knip.json", import.meta.url),
      "utf8",
    );
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(packageJson.devDependencies.knip).toBeTruthy();
    expect(packageJson.scripts["lint:unused"]).toBeTruthy();
    expect(knipConfig).toContain("\"entry\"");
    expect(knipConfig).toContain("\"project\"");
    expect(knipConfig).not.toContain("\"src/tools/**/*.ts\"");
    expect(workflow).toContain("Run Knip");
    expect(workflow).toContain("npm run lint:unused");
  });

  it("runs the main CI workflow in the expected validation order", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    const installIndex = workflow.indexOf("Install dependencies");
    const testsIndex = workflow.indexOf("Run tests");
    const dependencyRulesIndex = workflow.indexOf("Run dependency rules");
    const eslintIndex = workflow.indexOf("Run ESLint");
    const knipIndex = workflow.indexOf("Run Knip");
    const buildIndex = workflow.indexOf("Build package");

    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(testsIndex).toBeGreaterThan(installIndex);
    expect(dependencyRulesIndex).toBeGreaterThan(testsIndex);
    expect(eslintIndex).toBeGreaterThan(dependencyRulesIndex);
    expect(knipIndex).toBeGreaterThan(eslintIndex);
    expect(buildIndex).toBeGreaterThan(knipIndex);
  });
});
