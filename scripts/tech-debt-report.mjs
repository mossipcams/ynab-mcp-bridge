import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jscpdReportPath = path.join(repoRoot, "artifacts", "jscpd-report", "jscpd-report.json");
const repoCodeFileExtensions = new Set([".cjs", ".js", ".json", ".mjs", ".sh", ".ts", ".yaml", ".yml"]);
const repoCodeIgnoredDirectories = new Set([".git", "artifacts", "dist", "node_modules", "tasks"]);
const repoCodeIgnoredRootRelativePaths = new Set(["package-lock.json"]);
const repoCodeSpecialBasenames = new Set(["Dockerfile"]);
const todoFixmeHackIgnoredRootRelativePaths = new Set([
  "scripts/tech-debt-report.mjs",
  "src/techDebtReport.spec.ts",
]);

export const reportMetricLabels = [
  "Duplication",
  "Dead exports",
  "ts-ignore count",
  "eslint-disable count",
  "TODO/FIXME/HACK count",
  "Dependencies with major updates",
];

export const repoCodeRootRelativeDirectories = [
  ".github",
  "debugging",
  "scripts",
  "src",
];

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function runUtf8(command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runJson(command, args) {
  return JSON.parse(runUtf8(command, args));
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

export function isRepoOwnedCodePath(relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const segments = normalizedPath.split("/");
  const basename = segments.at(-1) ?? "";
  const extension = path.extname(basename);

  if (repoCodeIgnoredRootRelativePaths.has(normalizedPath)) {
    return false;
  }

  if (segments.some((segment) => repoCodeIgnoredDirectories.has(segment))) {
    return false;
  }

  if (normalizedPath.endsWith(".md")) {
    return false;
  }

  return repoCodeSpecialBasenames.has(basename) || repoCodeFileExtensions.has(extension);
}

function walkRepoOwnedCodeFiles(root, currentRelativePath = "") {
  return readdirSync(root).flatMap((entry) => {
    const fullPath = path.join(root, entry);
    const relativePath = currentRelativePath ? path.join(currentRelativePath, entry) : entry;
    const normalizedRelativePath = normalizeRelativePath(relativePath);

    if (statSync(fullPath).isDirectory()) {
      if (repoCodeIgnoredDirectories.has(entry)) {
        return [];
      }

      return walkRepoOwnedCodeFiles(fullPath, relativePath);
    }

    if (!isRepoOwnedCodePath(normalizedRelativePath)) {
      return [];
    }

    return [{
      fullPath,
      relativePath: normalizedRelativePath,
    }];
  });
}

function countPatternMatches(pattern, ignoredRootRelativePaths = new Set()) {
  const regex = new RegExp(pattern, "g");

  return walkRepoOwnedCodeFiles(repoRoot)
    .reduce((count, filePath) => {
      if (ignoredRootRelativePaths.has(filePath.relativePath)) {
        return count;
      }

      const matches = readFileSync(filePath.fullPath, "utf8").match(regex);
      return count + (matches?.length ?? 0);
    }, 0);
}

export function countTodoFixmeHackMatches() {
  return countPatternMatches("TODO|FIXME|HACK", todoFixmeHackIgnoredRootRelativePaths);
}

function readDuplicationPercentage() {
  runUtf8(npmCommand(), ["run", "--silent", "lint:duplicates"]);
  const report = JSON.parse(readFileSync(jscpdReportPath, "utf8"));

  return report.statistics.total.percentage;
}

function readDeadExportCount() {
  const report = runJson(npxCommand(), [
    "knip",
    "--reporter",
    "json",
    "--production",
    "--exclude",
    "dependencies",
  ]);

  return Array.isArray(report.files) ? report.files.length : 0;
}

function readMajorDependencyUpdateCount() {
  const report = runJson(npxCommand(), [
    "npm-check-updates",
    "--target",
    "greatest",
    "--jsonUpgraded",
  ]);

  return Object.keys(report).length;
}

export async function collectTechDebtMetrics() {
  return {
    duplication: readDuplicationPercentage(),
    deadExports: readDeadExportCount(),
    tsIgnoreCount: countPatternMatches("@ts-ignore|@ts-expect-error"),
    eslintDisableCount: countPatternMatches("eslint-disable"),
    todoFixmeHackCount: countTodoFixmeHackMatches(),
    majorDependencyUpdates: readMajorDependencyUpdateCount(),
  };
}

export function formatTechDebtReport(metrics) {
  return [
    "=== Tech Debt Report ===",
    `${reportMetricLabels[0]}: ${metrics.duplication}%`,
    `${reportMetricLabels[1]}: ${metrics.deadExports}`,
    `${reportMetricLabels[2]}: ${metrics.tsIgnoreCount}`,
    `${reportMetricLabels[3]}: ${metrics.eslintDisableCount}`,
    `${reportMetricLabels[4]}: ${metrics.todoFixmeHackCount}`,
    `${reportMetricLabels[5]}: ${metrics.majorDependencyUpdates}`,
  ].join("\n");
}

async function main() {
  const metrics = await collectTechDebtMetrics();
  console.log(formatTechDebtReport(metrics));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
