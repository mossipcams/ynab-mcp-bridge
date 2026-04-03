import { readFile, writeFile } from "node:fs/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

import { compareReliabilityArtifacts, createReliabilityArtifact, type ReliabilityArtifact } from "./reliabilityArtifact.js";
import { getReliabilityProfile, type ReliabilityProfile } from "./reliabilityProfiles.js";
import {
  runReliabilityProbes,
  summarizeReliabilityRun,
  type ReliabilityProbeResult,
  type ReliabilityRunSummary,
} from "./reliabilityRunner.js";
import type { YnabConfig } from "./config.js";

export type ReliabilityHttpOptions = {
  baselineArtifact: string | undefined;
  concurrency: number;
  host: string;
  jsonOut: string | undefined;
  maxErrorRate: number | undefined;
  path: string;
  port: number;
  profileName: "smoke";
  requestCount: number;
  url: string | undefined;
};

export type ReliabilityHttpScenarioOptions = {
  concurrency: number;
  host?: string | undefined;
  maxErrorRate: number;
  path?: string | undefined;
  port?: number | undefined;
  requestCount: number;
  toolCalls?: readonly MeasuredToolCall[];
  url?: string | undefined;
  ynab: YnabConfig;
};

export type ReliabilityHttpScenarioResult = {
  results: ReliabilityProbeResult[];
  target: {
    mode: "local" | "url";
    url: string;
  };
  summary: ReliabilityRunSummary;
};

type ExecuteReliabilityHttpCliDependencies = {
  runScenario?: (options: ReliabilityHttpScenarioOptions) => Promise<ReliabilityHttpScenarioResult>;
  writeLine?: (line: string) => void;
  ynab?: YnabConfig;
};

type RequiredLatencyReduction = {
  minimumReductionRatio: number;
  operation: string;
};

type RunHttpReliabilityScenarioDependencies = {
  runSequence?: typeof runMeasuredHttpSequence;
};

type TextContentItem = {
  text: string;
  type: "text";
};

type CallToolResponseWithContent = {
  content: unknown[];
};

type SmokeReliabilityProfile = Extract<ReliabilityProfile, { runner: "smoke" }>;
type ReliabilityClientLike = Pick<Client, "callTool" | "close" | "connect" | "listTools">;

export type MeasuredToolCall = {
  arguments?: Record<string, unknown>;
  name: string;
  validate?: (response: unknown) => void;
};

type RunMeasuredHttpSequenceOptions = {
  createClient?: (index: number) => ReliabilityClientLike;
  createTransport?: (baseUrl: string) => Parameters<Client["connect"]>[0];
  toolCalls?: readonly MeasuredToolCall[];
};

class ConnectTransportAdapter {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(private readonly transport: StreamableHTTPClientTransport) {}

  async close() {
    await this.transport.close();
  }

  async send(message: JSONRPCMessage | JSONRPCMessage[], options?: Parameters<StreamableHTTPClientTransport["send"]>[1]) {
    await this.transport.send(message, options);
  }

  setProtocolVersion(version: string) {
    this.transport.setProtocolVersion(version);
  }

  async start() {
    if (this.onclose) {
      this.transport.onclose = this.onclose;
    } else {
      delete this.transport.onclose;
    }

    if (this.onerror) {
      this.transport.onerror = this.onerror;
    } else {
      delete this.transport.onerror;
    }

    if (this.onmessage) {
      this.transport.onmessage = this.onmessage;
    } else {
      delete this.transport.onmessage;
    }

    await this.transport.start();
  }
}

const DEFAULT_OPTIONS: ReliabilityHttpOptions = {
  baselineArtifact: undefined,
  concurrency: 1,
  host: "127.0.0.1",
  jsonOut: undefined,
  maxErrorRate: undefined,
  path: "/mcp",
  port: 0,
  profileName: "smoke",
  requestCount: 5,
  url: undefined,
};

function parseIntegerFlag(name: string, value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected ${name} to be a positive integer.`);
  }

  return parsed;
}

function parsePortFlag(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Expected --port to be zero or a positive integer.");
  }

  return parsed;
}

function parseNumberFlag(name: string, value: string | undefined) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Expected ${name} to be a number between 0 and 1.`);
  }

  return parsed;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getRequiredLatencyReductions(artifact: ReliabilityArtifact): RequiredLatencyReduction[] {
  const defaultOperations = [
    "initialize",
    "tools/list",
  ];
  const toolCallOperations = Object.keys(artifact.summary.operations)
    .filter((operation) => operation.startsWith("tools/call:"))
    .sort((left, right) => left.localeCompare(right));

  return [...new Set([...defaultOperations, ...toolCallOperations])]
    .filter((operation) => operation in artifact.summary.operations)
    .map((operation) => ({
      operation,
      minimumReductionRatio: 0.2,
    }));
}

function formatCliReliabilitySummary(artifact: ReliabilityArtifact): ReliabilityRunSummary {
  return {
    passed: !artifact.summary.failed,
    maxErrorRate: artifact.profile.thresholds.maxErrorRate,
    errorRate: artifact.summary.thresholds.maxErrorRate.actual,
    failureGroups: artifact.summary.failureGroups,
    totals: artifact.summary.totals,
    latencyMs: artifact.summary.latencyMs,
    thresholds: artifact.summary.thresholds,
    operations: artifact.summary.operations,
    failures: artifact.summary.failures,
  };
}

async function writeArtifactIfRequested(
  artifact: ReliabilityArtifact,
  jsonOut: string | undefined,
  writeLine: (line: string) => void,
) {
  if (!jsonOut) {
    return;
  }

  await writeFile(jsonOut, JSON.stringify(artifact, null, 2), "utf8");
  writeLine(`artifact=${jsonOut}`);
}

async function readBaselineArtifactOrThrow(baselineArtifactPath: string) {
  try {
    return await readBaselineArtifact(baselineArtifactPath);
  } catch (error) {
    throw new Error(`Failed to read baseline artifact: ${baselineArtifactPath}. ${getErrorMessage(error)}`);
  }
}

function writeRequiredImprovements(
  comparison: ReturnType<typeof compareReliabilityArtifacts>,
  writeLine: (line: string) => void,
) {
  for (const improvement of comparison.requiredImprovements) {
    const reductionPct = Number.isFinite(improvement.reductionRatio)
      ? (improvement.reductionRatio * 100).toFixed(2)
      : "n/a";
    writeLine(
      `baseline_latency_reduction operation=${improvement.operation} ` +
      `status=${improvement.passed ? "pass" : "fail"} ` +
      `reduction_pct=${reductionPct} ` +
      `target_pct=${(improvement.minimumReductionRatio * 100).toFixed(2)} ` +
      `baseline_avg_ms=${Number.isFinite(improvement.baselineAverage) ? improvement.baselineAverage.toFixed(2) : "n/a"} ` +
      `current_avg_ms=${Number.isFinite(improvement.currentAverage) ? improvement.currentAverage.toFixed(2) : "n/a"}`,
    );
  }
}

async function evaluateBaselineComparison(
  artifact: ReliabilityArtifact,
  baselineArtifactPath: string | undefined,
  writeLine: (line: string) => void,
) {
  if (!baselineArtifactPath) {
    return true;
  }

  const baseline = await readBaselineArtifactOrThrow(baselineArtifactPath);
  const comparison = compareReliabilityArtifacts({
    baseline,
    current: artifact,
    requiredOperationAverageLatencyReductions: getRequiredLatencyReductions(artifact),
    tolerances: {
      maxErrorRateIncrease: 0.05,
      maxP95LatencyIncreaseMs: 250,
      maxP99LatencyIncreaseMs: 250,
    },
  });

  writeLine(`baseline_status=${comparison.passed ? "pass" : "fail"}`);
  writeRequiredImprovements(comparison, writeLine);
  return comparison.passed;
}

async function measureOperation(operation: string, work: () => Promise<void>): Promise<ReliabilityProbeResult> {
  const startedAt = performance.now();

  try {
    await work();

    return {
      ok: true,
      operation,
      latencyMs: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      operation,
      latencyMs: performance.now() - startedAt,
      errorMessage: getErrorMessage(error),
    };
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTextContentItem(value: unknown): value is TextContentItem {
  if (!isObjectRecord(value)) {
    return false;
  }

  return value["type"] === "text" && typeof value["text"] === "string";
}

function hasContentArray(value: unknown): value is CallToolResponseWithContent {
  if (!isObjectRecord(value)) {
    return false;
  }

  return Array.isArray(value["content"]);
}

function extractVersionText(response: unknown) {
  const content = hasContentArray(response) ? response.content : [];

  return content
    .filter(isTextContentItem)
    .map((item) => item.text)
    .join("\n");
}

function normalizeToolCallResponse(response: unknown) {
  const textContent = extractVersionText(response);

  if (textContent.length === 0) {
    return response;
  }

  try {
    const parsed: unknown = JSON.parse(textContent);
    return parsed;
  } catch {
    return textContent;
  }
}

function requireScenarioUrl(options: ReliabilityHttpScenarioOptions) {
  if (!options.url) {
    throw new Error("Expected an HTTP URL for the reliability scenario.");
  }

  return options.url;
}

function requireSmokeProfile(): SmokeReliabilityProfile {
  const baseProfile = getReliabilityProfile("smoke");

  if (baseProfile.runner !== "smoke") {
    throw new Error("Expected the smoke reliability profile.");
  }

  return baseProfile;
}

function createConnectTransport(baseUrl: string): Parameters<Client["connect"]>[0] {
  return new ConnectTransportAdapter(new StreamableHTTPClientTransport(new URL(baseUrl)));
}

function createReliabilityClient(index: number): ReliabilityClientLike {
  return new Client({
    name: `ynab-mcp-bridge-reliability-${index + 1}`,
    version: "1.0.0",
  });
}

function defaultToolCallValidation(response: unknown) {
  const normalizedResponse = normalizeToolCallResponse(response);

  if (!isObjectRecord(normalizedResponse) || typeof normalizedResponse["version"] !== "string") {
    throw new Error("Expected ynab_get_mcp_version to return version text.");
  }
}

function getMeasuredToolCalls(toolCalls: readonly MeasuredToolCall[] | undefined): readonly MeasuredToolCall[] {
  if (toolCalls && toolCalls.length > 0) {
    return toolCalls;
  }

  return [{
    arguments: {},
    name: "ynab_get_mcp_version",
    validate: defaultToolCallValidation,
  }];
}

function parseReliabilityHttpValueFlag(
  parsed: ReliabilityHttpOptions,
  argument: string,
  value: string | undefined,
) {
  if (!value || value.startsWith("--")) {
    throw new Error(`Expected ${argument} to be followed by a value.`);
  }

  if (argument === "--profile") {
    if (value !== "smoke") {
      throw new Error("The HTTP reliability command currently supports only the smoke profile.");
    }
    parsed.profileName = "smoke";
    return;
  }

  if (argument === "--json-out") {
    parsed.jsonOut = value;
    return;
  }

  if (argument === "--baseline-artifact") {
    parsed.baselineArtifact = value;
    return;
  }

  if (argument === "--url") {
    parsed.url = value;
    return;
  }

  if (argument === "--host") {
    parsed.host = value;
    return;
  }

  if (argument === "--path") {
    parsed.path = value;
    return;
  }

  throw new Error(`Unknown reliability argument: ${argument}`);
}

function applyReliabilityHttpFlag(
  parsed: ReliabilityHttpOptions,
  argument: string,
  value: string | undefined,
) {
  if (argument === "--requests") {
    parsed.requestCount = parseIntegerFlag("--requests", value);
    return true;
  }

  if (argument === "--concurrency") {
    parsed.concurrency = parseIntegerFlag("--concurrency", value);
    return true;
  }

  if (argument === "--max-error-rate") {
    parsed.maxErrorRate = parseNumberFlag("--max-error-rate", value);
    return true;
  }

  if (argument === "--port") {
    parsed.port = parsePortFlag(value);
    return true;
  }

  parseReliabilityHttpValueFlag(parsed, argument, value);
  return true;
}

function isReliabilityArtifact(value: unknown): value is ReliabilityArtifact {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (!isObjectRecord(value["profile"]) || !isObjectRecord(value["summary"]) || !isObjectRecord(value["target"])) {
    return false;
  }

  const target = value["target"];

  return (
    (target["mode"] === "local" || target["mode"] === "url") &&
    typeof target["url"] === "string"
  );
}

async function readBaselineArtifact(path: string) {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));

  if (!isReliabilityArtifact(parsed)) {
    throw new Error(`Failed to parse baseline artifact: ${path}.`);
  }

  return parsed;
}

export async function runMeasuredHttpSequence(
  baseUrl: string,
  index: number,
  options: RunMeasuredHttpSequenceOptions = {},
) {
  const client = options.createClient?.(index) ?? createReliabilityClient(index);
  const transport = options.createTransport?.(baseUrl) ?? createConnectTransport(baseUrl);
  const toolCalls = getMeasuredToolCalls(options.toolCalls);
  const results: ReliabilityProbeResult[] = [];
  let connected = false;

  try {
    const initializeResult = await measureOperation("initialize", async () => {
      await client.connect(transport);
      connected = true;
    });
    results.push(initializeResult);

    if (!initializeResult.ok) {
      return results;
    }

    const listToolsResult = await measureOperation("tools/list", async () => {
      const listedTools = await client.listTools();

      if (!listedTools.tools.some((tool) => tool.name === "ynab_get_mcp_version")) {
        throw new Error("Expected ynab_get_mcp_version to be registered.");
      }
    });
    results.push(listToolsResult);

    if (!listToolsResult.ok) {
      return results;
    }

    for (const toolCall of toolCalls) {
      results.push(await measureOperation(`tools/call:${toolCall.name}`, async () => {
        const response = await client.callTool({
          name: toolCall.name,
          arguments: toolCall.arguments ?? {},
        });
        toolCall.validate?.(normalizeToolCallResponse(response));
      }));
    }

    return results;
  } finally {
    if (connected) {
      await client.close();
    }
  }
}

export function parseReliabilityHttpArgs(argv: string[]): ReliabilityHttpOptions {
  const parsed: ReliabilityHttpOptions = {
    ...DEFAULT_OPTIONS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument) {
      continue;
    }
    const value = argv[index + 1];
    applyReliabilityHttpFlag(parsed, argument, value);
    index += 1;
  }

  return parsed;
}

export function formatReliabilitySummary(summary: ReliabilityRunSummary) {
  const status = summary.passed ? "pass" : "fail";
  const lines = [
    [
      `status=${status}`,
      `attempts=${summary.totals.attempts}`,
      `succeeded=${summary.totals.succeeded}`,
      `failed=${summary.totals.failed}`,
      `errorRate=${summary.errorRate.toFixed(4)}`,
      `threshold=${summary.thresholds.maxErrorRate.target.toFixed(4)}`,
      `avg=${summary.latencyMs.average.toFixed(2)}ms`,
      `p50=${summary.latencyMs.p50.toFixed(2)}ms`,
      `p95=${summary.latencyMs.p95.toFixed(2)}ms`,
      `p99=${summary.latencyMs.p99.toFixed(2)}ms`,
    ].join(" "),
  ];

  for (const failure of summary.failures) {
    lines.push(
      `failure operation=${failure.operation} latency=${failure.latencyMs.toFixed(2)}ms message=${failure.errorMessage}`,
    );
  }

  return lines.join("\n");
}

export async function runHttpReliabilityScenario(
  options: ReliabilityHttpScenarioOptions,
  dependencies: RunHttpReliabilityScenarioDependencies = {},
): Promise<ReliabilityHttpScenarioResult> {
  const url = requireScenarioUrl(options);
  const runSequence = dependencies.runSequence ?? runMeasuredHttpSequence;

  const results = await runReliabilityProbes({
    concurrency: options.concurrency,
    count: options.requestCount,
    probe: async (index) => await runSequence(
      url,
      index,
      options.toolCalls
        ? { toolCalls: options.toolCalls }
        : {},
    ),
  });

  return {
    results,
    target: {
      mode: "url",
      url,
    },
    summary: summarizeReliabilityRun({
      maxErrorRate: options.maxErrorRate,
      maxP95LatencyMs: Number.POSITIVE_INFINITY,
      maxP99LatencyMs: Number.POSITIVE_INFINITY,
      results,
    }),
  };
}

function createSmokeProfile(options: ReliabilityHttpOptions): SmokeReliabilityProfile {
  const baseProfile = requireSmokeProfile();
  return {
    ...baseProfile,
    smoke: {
      concurrency: options.concurrency,
      requestCount: options.requestCount,
    },
    thresholds: {
      ...baseProfile.thresholds,
      maxErrorRate: options.maxErrorRate ?? baseProfile.thresholds.maxErrorRate,
    },
  };
}

export async function executeReliabilityHttpCli(
  argv: string[],
  dependencies: ExecuteReliabilityHttpCliDependencies = {},
) {
  try {
    const options = parseReliabilityHttpArgs(argv);
    const result = await (dependencies.runScenario ?? runHttpReliabilityScenario)({
      ...options,
      maxErrorRate: options.maxErrorRate ?? getReliabilityProfile("smoke").thresholds.maxErrorRate,
      ynab: dependencies.ynab ?? {
        apiToken: "reliability-test-token",
      },
    });
    const artifact = createReliabilityArtifact({
      completedAt: new Date().toISOString(),
      profile: createSmokeProfile(options),
      results: result.results,
      startedAt: new Date().toISOString(),
      target: result.target,
    });
    const writeLine = dependencies.writeLine ?? console.log;
    writeLine(formatReliabilitySummary(formatCliReliabilitySummary(artifact)));
    await writeArtifactIfRequested(artifact, options.jsonOut, writeLine);

    const baselinePassed = await evaluateBaselineComparison(artifact, options.baselineArtifact, writeLine);
    return artifact.summary.failed || !baselinePassed ? 1 : 0;
  } catch (error) {
    (dependencies.writeLine ?? console.error)(`status=error message=${getErrorMessage(error)}`);
    return 1;
  }
}
