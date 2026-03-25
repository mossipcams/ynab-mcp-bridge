import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(projectRoot, "artifacts", "jscpd-report", "jscpd-report.json");
const trackedExtensions = new Set([".cjs", ".js", ".json", ".md", ".mjs", ".ts", ".yml", ".yaml"]);
const excludedDirectories = new Set([".git", "artifacts", "dist", "node_modules"]);
const excludedFiles = new Set(["package-lock.json"]);

function resolveNpxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function runJsonCommand(args) {
  try {
    return execFileSync(resolveNpxCommand(), args, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return error.stdout?.toString() ?? "";
  }
}

function walkTrackedFiles(currentPath) {
  const stats = statSync(currentPath);

  if (stats.isDirectory()) {
    if (excludedDirectories.has(path.basename(currentPath))) {
      return [];
    }

    return readdirSync(currentPath, { withFileTypes: true }).flatMap((entry) =>
      walkTrackedFiles(path.join(currentPath, entry.name)),
    );
  }

  if (excludedFiles.has(path.basename(currentPath))) {
    return [];
  }

  if (!trackedExtensions.has(path.extname(currentPath))) {
    return [];
  }

  return [currentPath];
}

function countPatternMatches(pattern) {
  return walkTrackedFiles(projectRoot)
    .map((filePath) => readFileSync(filePath, "utf8").match(pattern)?.length ?? 0)
    .reduce((total, count) => total + count, 0);
}

function readDuplicationPercentage() {
  runJsonCommand(["jscpd", "--config", ".jscpd.json", "--reporters", "json", "."]);

  if (!existsSync(reportPath)) {
    throw new Error("JSCPD report was not generated.");
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8"));

  return Number(report.statistics.total.percentage).toFixed(2);
}

function readDeadExportCount() {
  const output = runJsonCommand([
    "knip",
    "--config",
    "knip.json",
    "--production",
    "--exclude",
    "dependencies",
    "--reporter",
    "json",
  ]);

  if (!output.trim()) {
    return 0;
  }

  const report = JSON.parse(output);

  return Array.isArray(report.files) ? report.files.length : 0;
}

export function formatTechDebtReport(metrics) {
  return [
    "=== Tech Debt Report ===",
    `Whole-codebase duplication: ${metrics.duplication}%`,
    `Dead exports: ${metrics.deadExports}`,
    `ts-ignore count: ${metrics.tsIgnoreCount}`,
    `eslint-disable count: ${metrics.eslintDisableCount}`,
    `TODO/FIXME/HACK count: ${metrics.todoCount}`,
  ].join("\n");
}

export function collectTechDebtMetrics() {
  return {
    duplication: readDuplicationPercentage(),
    deadExports: readDeadExportCount(),
    tsIgnoreCount: countPatternMatches(/@ts-ignore|@ts-expect-error/g),
    eslintDisableCount: countPatternMatches(/eslint-disable/g),
    todoCount: countPatternMatches(/TODO|FIXME|HACK/g),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(formatTechDebtReport(collectTechDebtMetrics()));
}
