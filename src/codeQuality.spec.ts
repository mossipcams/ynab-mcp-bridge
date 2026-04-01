import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

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
    expect(dependencyCruiserConfig).toContain("httpTransport");
    expect(dependencyCruiserConfig).toContain("serverRuntime");
    expect(dependencyCruiserConfig).toContain("auth2");
    expect(dependencyCruiserConfig).toContain("auth2/http/routes");
    expect(dependencyCruiserConfig).not.toContain("httpServer|stdioServer");
    expect(dependencyCruiserConfig).not.toContain("httpServer\\.ts");
    expect(dependencyCruiserConfig).not.toContain("server\\.ts");
    expect(dependencyCruiserConfig).not.toContain("oauthRuntime");
    expect(dependencyCruiserConfig).not.toContain("grantLifecycle");
    expect(dependencyCruiserConfig).not.toContain("grantPersistence");
    expect(packageJson.devDependencies["dependency-cruiser"]).toBeTruthy();
    expect(packageJson.scripts["lint:deps"]).toBeTruthy();
    expect(workflow).toContain("Run dependency rules");
    expect(workflow).toContain("npm run lint:deps");
  });

  it("defines strict type-aware ESLint in repo config, package scripts, and CI", () => {
    expect(existsSync(new URL("../eslint.config.mjs", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../tsconfig.eslint.json", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../tsconfig.eslint.clientProfiles.json", import.meta.url))).toBe(true);

    const eslintConfig = readFileSync(
      new URL("../eslint.config.mjs", import.meta.url),
      "utf8",
    );
    const eslintTsconfig = readFileSync(
      new URL("../tsconfig.eslint.json", import.meta.url),
      "utf8",
    );
    const eslintClientProfilesTsconfig = readFileSync(
      new URL("../tsconfig.eslint.clientProfiles.json", import.meta.url),
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
    expect(packageJson.scripts.lint).toContain("lint:repo");
    expect(packageJson.scripts.lint).toContain("lint:specs");
    expect(packageJson.scripts["lint:repo"]).toContain("lint:repo:fast");
    expect(packageJson.scripts["lint:repo"]).toContain("lint:repo:typed:core");
    expect(packageJson.scripts["lint:repo"]).toContain("lint:repo:typed:client-profiles");
    expect(packageJson.scripts["lint:repo:fast"]).toContain("--max-old-space-size=4096");
    expect(packageJson.scripts["lint:repo:fast"]).toContain("src/tools/**/*.ts");
    expect(packageJson.scripts["lint:repo:fast"]).toContain("src/serverRuntime.ts");
    expect(packageJson.scripts["lint:repo:fast"]).toContain("src/httpTransport.ts");
    expect(packageJson.scripts["lint:repo:fast"]).toContain("src/stdioServer.ts");
    expect(packageJson.scripts["lint:repo:fast"]).toContain("src/index.ts");
    expect(packageJson.scripts["lint:repo:fast"]).toContain("artifacts/**");
    expect(packageJson.scripts["lint:repo:typed:core"]).toContain("--max-old-space-size=4096");
    expect(packageJson.scripts["lint:repo:typed:core"]).toContain("src/*.ts");
    expect(packageJson.scripts["lint:repo:typed:core"]).toContain("src/serverRuntime.ts");
    expect(packageJson.scripts["lint:repo:typed:client-profiles"]).toContain("--max-old-space-size=4096");
    expect(packageJson.scripts["lint:repo:typed:client-profiles"]).toContain("src/clientProfiles/**/*.ts");
    expect(packageJson.scripts["lint:specs"]).toContain("--max-old-space-size=8192");
    expect(packageJson.scripts["lint:specs"]).toContain("src/**/*.spec.ts");
    expect(eslintConfig).toContain("strictTypeChecked");
    expect(eslintConfig).toContain("parserOptions");
    expect(eslintConfig).toContain('project: "./tsconfig.eslint.json"');
    expect(eslintConfig).toContain('project: "./tsconfig.eslint.clientProfiles.json"');
    expect(eslintConfig).not.toContain("projectService");
    expect(eslintConfig).toContain('"artifacts/**"');
    expect(eslintConfig).toContain('"src/serverRuntime.ts"');
    expect(eslintConfig).toContain('"src/httpTransport.ts"');
    expect(eslintConfig).toContain('"src/stdioServer.ts"');
    expect(eslintConfig).toContain('"src/index.ts"');
    expect(eslintTsconfig).toContain("\"./tsconfig.json\"");
    expect(eslintTsconfig).toContain("\"src/*.ts\"");
    expect(eslintTsconfig).toContain("\"src/serverRuntime.ts\"");
    expect(eslintClientProfilesTsconfig).toContain("\"src/clientProfiles/**/*.ts\"");
    expect(eslintTsconfig).toContain("\"**/*.contract.ts\"");
    expect(eslintConfig).not.toContain('files: ["src/serverRuntime.ts"]');
    expect(workflow).toContain("Run ESLint");
    expect(workflow).toContain("npm run lint");
  });

  it("pins TypeScript 5.9 and enables the agreed strict compiler options", () => {
    const tsconfig = readFileSync(
      new URL("../tsconfig.json", import.meta.url),
      "utf8",
    );
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );

    expect(packageJson.devDependencies.typescript).toMatch(/\b5\.9\./);
    expect(tsconfig).toContain('"strict": true');
    expect(tsconfig).toContain('"exactOptionalPropertyTypes": true');
    expect(tsconfig).toContain('"noUncheckedIndexedAccess": true');
    expect(tsconfig).toContain('"noPropertyAccessFromIndexSignature": true');
    expect(tsconfig).toContain('"noImplicitOverride": true');
  });

  it("defines the remaining explicit ESLint plugin and import guardrails for this slice", () => {
    const eslintConfig = readFileSync(
      new URL("../eslint.config.mjs", import.meta.url),
      "utf8",
    );
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );

    expect(packageJson.devDependencies["eslint-plugin-security"]).toBeTruthy();
    expect(packageJson.devDependencies["eslint-plugin-sonarjs"]).toBeTruthy();
    expect(eslintConfig).toContain("no-restricted-imports");
  });

  it("explicitly forbids type assertions and keeps no-unsafe rules in the effective lint config", () => {
    const eslintConfig = readFileSync(
      new URL("../eslint.config.mjs", import.meta.url),
      "utf8",
    );
    const printedConfig = execFileSync(
      "npx",
      ["eslint", "--print-config", "src/config.ts"],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
      },
    );

    expect(eslintConfig).toContain("@typescript-eslint/consistent-type-assertions");
    expect(eslintConfig).toContain('"never"');
    expect(printedConfig).toContain('"@typescript-eslint/no-unsafe-assignment"');
    expect(printedConfig).toContain('"@typescript-eslint/no-unsafe-call"');
    expect(printedConfig).toContain('"@typescript-eslint/no-unsafe-member-access"');
    expect(printedConfig).toContain('"@typescript-eslint/no-unsafe-return"');
  });

  it("defines explicit exported return type enforcement for non-spec TypeScript files", () => {
    const eslintConfig = readFileSync(
      new URL("../eslint.config.mjs", import.meta.url),
      "utf8",
    );

    expect(eslintConfig).toContain("@typescript-eslint/explicit-function-return-type");
  });

  it("defines the selected complexity thresholds for this slice", () => {
    const eslintConfig = readFileSync(
      new URL("../eslint.config.mjs", import.meta.url),
      "utf8",
    );

    expect(eslintConfig).toContain("sonarjs/cognitive-complexity");
    expect(eslintConfig).toContain("max-depth");
    expect(eslintConfig).toContain("max-params");
    expect(eslintConfig).toContain('["error", 10]');
    expect(eslintConfig).toContain('["error", 3]');
    expect(eslintConfig).toContain('["error", 4]');
  });

  it("includes fast-check when property-based testing is enabled for this slice", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );

    expect(packageJson.devDependencies["fast-check"]).toBeTruthy();
  });

  it("removes legacy tsconfig path alias settings before the Oxlint pilot", () => {
    const tsconfig = readFileSync(
      new URL("../tsconfig.json", import.meta.url),
      "utf8",
    );

    expect(tsconfig).not.toContain('"baseUrl"');
    expect(tsconfig).not.toContain('"paths"');
  });

  it("defines the Oxlint pilot dependencies, config, and script", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );

    expect(existsSync(new URL("../.oxlintrc.json", import.meta.url))).toBe(true);
    expect(packageJson.devDependencies.oxlint).toBeTruthy();
    expect(packageJson.devDependencies["oxlint-tsgolint"]).toBeTruthy();
    expect(packageJson.scripts["lint:oxlint"]).toBeTruthy();
  });

  it("keeps Oxlint advisory when wired into CI", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("Run Oxlint advisory pilot");
    expect(workflow).toContain("npm run lint:oxlint");
    expect(workflow).toContain("continue-on-error: true");
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

  it("defines JSCPD duplicate detection and a checked-in tech debt report in repo config and CI", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const jscpdConfig = JSON.parse(
      readFileSync(new URL("../.jscpd.json", import.meta.url), "utf8"),
    ) as {
      ignore?: string[];
    };
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(existsSync(new URL("../.jscpd.json", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../scripts/tech-debt-report.mjs", import.meta.url))).toBe(true);
    expect(packageJson.devDependencies.jscpd).toBeTruthy();
    expect(packageJson.devDependencies["npm-check-updates"]).toBeTruthy();
    expect(packageJson.scripts["lint:duplicates"]).toBeTruthy();
    expect(packageJson.scripts["lint:duplicates"]).toBe("jscpd --config .jscpd.json .");
    expect(packageJson.scripts["tech-debt:report"]).toBe("node ./scripts/tech-debt-report.mjs");
    expect(jscpdConfig.ignore).toEqual(expect.arrayContaining([
      "dist/**",
      "artifacts/**",
      "node_modules/**",
      "tasks/**",
      "src/auth2/harness/**",
      "**/*.md",
      "package-lock.json",
    ]));
    expect(workflow).toContain("Run JSCPD");
    expect(workflow).toContain("npm run lint:duplicates");
    expect(workflow).toContain("Run tech debt report");
    expect(workflow).toContain("npm run tech-debt:report");
  });

  it("fails CI when committed build artifacts drift from the generated runtime output", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(packageJson.scripts?.["verify:build-sync"]).toBeTruthy();
    expect(packageJson.scripts?.["verify:build-sync"]).toContain("git diff");
    expect(packageJson.scripts?.["verify:build-sync"]).toContain("dist");
    expect(workflow).toContain("Verify build artifacts are committed");
    expect(workflow).toContain("npm run verify:build-sync");
  });

  it("smoke-tests the packed npm artifact in CI before treating a build as release-ready", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      scripts?: Record<string, string>;
    };
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(packageJson.scripts?.["verify:pack"]).toBeTruthy();
    expect(packageJson.scripts?.["verify:pack"]).toContain("ci-smoke-pack");
    expect(workflow).toContain("Smoke-test packed npm artifact");
    expect(workflow).toContain("npm run verify:pack");
  });

  it("runs the main CI workflow in the expected validation order", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("strategy:");
    expect(workflow).toContain("node-version: [22.x, 24.x]");
    expect(workflow).toContain("quality:");

    const testsIndex = workflow.indexOf("Run tests");
    const coverageIndex = workflow.indexOf("Run coverage thresholds");
    const dependencyRulesIndex = workflow.indexOf("Run dependency rules");
    const eslintIndex = workflow.indexOf("Run ESLint");
    const typecheckIndex = workflow.indexOf("Run TypeScript typecheck");
    const knipIndex = workflow.indexOf("Run Knip");
    const jscpdIndex = workflow.indexOf("Run JSCPD");
    const techDebtIndex = workflow.indexOf("Run tech debt report");
    const buildIndex = workflow.indexOf("Build package");

    expect(testsIndex).toBeGreaterThanOrEqual(0);
    expect(coverageIndex).toBeGreaterThan(testsIndex);
    expect(dependencyRulesIndex).toBeGreaterThan(coverageIndex);
    expect(eslintIndex).toBeGreaterThan(dependencyRulesIndex);
    expect(typecheckIndex).toBeGreaterThan(eslintIndex);
    expect(knipIndex).toBeGreaterThan(typecheckIndex);
    expect(jscpdIndex).toBeGreaterThan(knipIndex);
    expect(techDebtIndex).toBeGreaterThan(jscpdIndex);
    expect(buildIndex).toBeGreaterThan(techDebtIndex);
  });

  it("keeps production typecheck in CI and exposes a separate test typecheck script", () => {
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
    expect(packageJson.scripts.typecheck).toContain("--max-old-space-size=12288");
    expect(packageJson.scripts.typecheck).toContain("tsconfig.json");
    expect(packageJson.scripts.typecheck).not.toContain("tsconfig.test.json");
    expect(packageJson.scripts["typecheck:tests"]).toContain("--max-old-space-size=12288");
    expect(packageJson.scripts["typecheck:tests"]).toContain("tsconfig.test.json");
    expect(packageJson.scripts["typecheck:all"]).toContain("npm run typecheck");
    expect(packageJson.scripts["typecheck:all"]).toContain("npm run typecheck:tests");
    expect(workflow).toContain("Run TypeScript typecheck");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).not.toContain("npm run typecheck:tests");
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
    expect(workflow).toContain("if: always()");
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

  it("does not define dedicated validate jobs for Release Please PRs", () => {
    expect(
      existsSync(new URL("../.github/workflows/release-please-pr-checks.yml", import.meta.url)),
    ).toBe(false);

    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("strategy:");
    expect(workflow).toContain("matrix:");
    expect(workflow).toContain("node-version: [22.x, 24.x]");
    expect(workflow).not.toContain("validate-22:");
    expect(workflow).not.toContain("validate-24:");
    expect(workflow).not.toContain("name: validate (22.x)");
    expect(workflow).not.toContain("name: validate (24.x)");
    expect(workflow).not.toContain("Release Please 24.x validation marker");
    expect(workflow).not.toContain("release-please-test-results");
    expect(workflow).not.toContain("Run smoke tests for Release Please PRs");
  });

  it("skips the main CI job for Release Please PR branches instead of adding placeholder validations", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("if: github.event_name != 'pull_request' || !startsWith(github.event.pull_request.head.ref, 'release-please--')");
    expect(workflow).not.toContain("github.event_name == 'pull_request' && startsWith(github.event.pull_request.head.ref, 'release-please--')");
  });

  it("keeps the normal validation matrix for non-release PRs", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("Run dependency rules");
    expect(workflow).toContain("Run ESLint");
    expect(workflow).toContain("Run Knip");
    expect(workflow).toContain("Run TypeScript typecheck");
    expect(workflow).toContain("Build package");
  });

  it("skips PR title validation entirely for Release Please PR branches", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/validate-pr-title.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("if: ${{ !startsWith(github.event.pull_request.head.ref, 'release-please--') }}");
    expect(workflow).not.toContain("Release Please PR title exemption");
  });
});
