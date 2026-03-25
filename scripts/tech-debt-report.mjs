import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(repoRoot, "src");
const jscpdReportPath = path.join(repoRoot, "artifacts", "jscpd-report", "jscpd-report.json");

export const reportMetricLabels = [
  "Duplication",
  "Dead exports",
  "ts-ignore count",
  "eslint-disable count",
  "TODO/FIXME/HACK count",
  "Dependencies with major updates",
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

function walkFiles(root) {
  return readdirSync(root).flatMap((entry) => {
    const fullPath = path.join(root, entry);

    if (statSync(fullPath).isDirectory()) {
      return walkFiles(fullPath);
    }

    return [fullPath];
  });
}

function countPatternMatches(pattern) {
  const regex = new RegExp(pattern, "g");

  return walkFiles(srcRoot)
    .filter((filePath) => filePath.endsWith(".ts"))
    .reduce((count, filePath) => {
      const matches = readFileSync(filePath, "utf8").match(regex);
      return count + (matches?.length ?? 0);
    }, 0);
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
    todoFixmeHackCount: countPatternMatches("TODO|FIXME|HACK"),
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
