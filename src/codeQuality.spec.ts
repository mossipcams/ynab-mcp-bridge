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
    expect(dependencyCruiserConfig).toContain("no-circular");
    expect(dependencyCruiserConfig).toContain("circular");
    expect(dependencyCruiserConfig).toContain("no-orphans");
    expect(dependencyCruiserConfig).toContain("orphan");
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
    expect(packageJson.scripts["lint:unused"]).toContain("--production");
    expect(packageJson.scripts["lint:unused"]).toContain("--exclude dependencies");
    expect(knipConfig).toContain("\"project\"");
    expect(knipConfig).not.toContain("\"entry\"");
    expect(knipConfig).not.toContain("\"ignore\"");
    expect(knipConfig).not.toContain("\"src/index.ts\"");
    expect(knipConfig).not.toContain("\"src/**/*.spec.ts\"");
    expect(knipConfig).not.toContain("\"src/tools/**/*.ts\"");
    expect(workflow).toContain("Run Knip");
    expect(workflow).toContain("npm run lint:unused");
  });

  it("runs the main CI workflow in the expected validation order", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );
    const validate22Job = workflow.split("validate-22:")[1]?.split("validate-24:")[0] ?? "";

    const installIndex = validate22Job.indexOf("Install dependencies");
    const testsIndex = validate22Job.indexOf("Run full tests");
    const dependencyRulesIndex = validate22Job.indexOf("Run dependency rules");
    const eslintIndex = validate22Job.indexOf("Run ESLint");
    const typecheckIndex = validate22Job.indexOf("Run TypeScript typecheck");
    const knipIndex = validate22Job.indexOf("Run Knip");
    const buildIndex = validate22Job.indexOf("Build package");

    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(testsIndex).toBeGreaterThan(installIndex);
    expect(dependencyRulesIndex).toBeGreaterThan(testsIndex);
    expect(eslintIndex).toBeGreaterThan(dependencyRulesIndex);
    expect(typecheckIndex).toBeGreaterThan(eslintIndex);
    expect(knipIndex).toBeGreaterThan(typecheckIndex);
    expect(buildIndex).toBeGreaterThan(knipIndex);
  });

  it("defines a dedicated typecheck that includes test files in package scripts and CI", () => {
    expect(existsSync(new URL("../tsconfig.test.json", import.meta.url))).toBe(true);

    const testTsconfig = readFileSync(
      new URL("../tsconfig.test.json", import.meta.url),
      "utf8",
    );
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(testTsconfig).toContain("\"**/*.spec.ts\"");
    expect(testTsconfig).not.toContain("\"**/*.test.ts\"");
    expect(packageJson.scripts.typecheck).toContain("tsconfig.test.json");
    expect(workflow).toContain("Run TypeScript typecheck");
    expect(workflow).toContain("npm run typecheck");
  });

  it("lints spec files with test-specific overrides instead of ignoring them", () => {
    const eslintConfig = readFileSync(
      new URL("../eslint.config.mjs", import.meta.url),
      "utf8",
    );
    const topLevelIgnoreBlock = eslintConfig
      .split("export default [")[1]
      ?.split("js.configs.recommended")[0] ?? "";

    expect(topLevelIgnoreBlock).not.toContain('"src/**/*.spec.ts"');
    expect(eslintConfig).toContain('files: ["src/**/*.spec.ts"]');
    expect(eslintConfig).toContain('project: "./tsconfig.test.json"');
    expect(eslintConfig).toContain("describe");
    expect(eslintConfig).toContain("it");
    expect(eslintConfig).toContain("expect");
  });

  it("emits machine-readable test reports and uploads them from CI", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(packageJson.scripts["test:ci"]).toContain("--reporter=junit");
    expect(packageJson.scripts["test:ci"]).toContain("--outputFile.junit=");
    expect(workflow).toContain("npm run test:ci");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("artifacts/test-results");
  });

  it("enforces coverage thresholds in Vitest and CI", () => {
    const vitestConfig = readFileSync(
      new URL("../vitest.config.ts", import.meta.url),
      "utf8",
    );
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(vitestConfig).toContain("thresholds");
    expect(vitestConfig).toContain("lines");
    expect(vitestConfig).toContain("functions");
    expect(vitestConfig).toContain("branches");
    expect(vitestConfig).toContain("statements");
    expect(packageJson.scripts["test:coverage"]).toContain("--coverage");
    expect(workflow).toContain("npm run test:coverage");
  });

  it("cancels stale CI runs and avoids duplicate branch pushes for pull requests", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain("group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches:");
    expect(workflow).toContain("- main");
  });

  it("uses explicit least-privilege workflow permissions for CI", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("permissions:");
    expect(workflow).toContain("contents: read");
  });

  it("assigns workflow files to a code owner", () => {
    expect(existsSync(new URL("../.github/CODEOWNERS", import.meta.url))).toBe(true);

    const codeowners = readFileSync(
      new URL("../.github/CODEOWNERS", import.meta.url),
      "utf8",
    );

    expect(codeowners).toContain(".github/workflows/");
    expect(codeowners).toContain("@mossipcams");
  });

  it("ignores generated CI artifacts in git", () => {
    const gitignore = readFileSync(
      new URL("../.gitignore", import.meta.url),
      "utf8",
    );

    expect(gitignore).toContain("artifacts");
  });

  it("keeps Release Please PR required checks inside the main CI workflow", () => {
    expect(
      existsSync(new URL("../.github/workflows/release-please-pr-checks.yml", import.meta.url)),
    ).toBe(false);

    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("validate-22:");
    expect(workflow).toContain("name: validate (22.x)");
    expect(workflow).toContain("validate-24:");
    expect(workflow).toContain("name: validate (24.x)");
    expect(workflow).toContain("startsWith(github.event.pull_request.head.ref, 'release-please--')");
    expect(workflow).toContain("node-version: 22.x");
    expect(workflow).toContain("node-version: 24.x");
    expect(workflow).toContain("npm run test:ci");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm run build");
    expect(workflow).not.toContain("release-please-smoke:");
    expect(workflow).not.toContain("release-please-pr-checks.yml");
  });

  it("keeps the full 22.x validation job from running release-only shortcuts on normal PRs", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("if:");
    expect(workflow).toContain("github.event_name == 'pull_request' && startsWith(github.event.pull_request.head.ref, 'release-please--')");
    expect(workflow).toContain("github.event_name != 'pull_request' || !startsWith(github.event.pull_request.head.ref, 'release-please--')");
  });

  it("keeps the full validation pair for non-release PRs while making release checks lightweight", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).not.toContain("matrix:");
    expect(workflow).toContain("Run dependency rules");
    expect(workflow).toContain("Run ESLint");
    expect(workflow).toContain("Run Knip");
    expect(workflow).toContain("Release Please 24.x validation marker");
  });

  it("keeps Release Please 22.x diagnostics lightweight but reviewable", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );
    const validate22Job = workflow.split("validate-22:")[1]?.split("validate-24:")[0] ?? "";
    const validate24Job = workflow.split("validate-24:")[1] ?? "";

    expect(workflow).toContain("name: validate (22.x)");
    expect(validate22Job).toContain("Upload release-please test reports");
    expect(validate22Job).toContain("name: release-please-test-results");
    expect(validate24Job).toContain("Release Please 24.x validation marker");
    expect(validate24Job).toContain("if: github.event_name != 'pull_request' || !startsWith(github.event.pull_request.head.ref, 'release-please--')");
  });

  it("reports a release-please exemption instead of skipping PR title validation", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/validate-pr-title.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("validate-pr-title:");
    expect(workflow).toContain("Release Please PR title exemption");
    expect(workflow).toContain("Validate releasable conventional commit title");
  });
});
