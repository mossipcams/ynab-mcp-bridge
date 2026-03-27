import { readFile, writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { compareReliabilityArtifacts, createReliabilityArtifact } from "./reliabilityArtifact.js";
import { getReliabilityProfile } from "./reliabilityProfiles.js";
import { runReliabilityProbes, summarizeReliabilityRun, } from "./reliabilityRunner.js";
class ConnectTransportAdapter {
    transport;
    onclose;
    onerror;
    onmessage;
    constructor(transport) {
        this.transport = transport;
    }
    async close() {
        await this.transport.close();
    }
    async send(message, options) {
        await this.transport.send(message, options);
    }
    setProtocolVersion(version) {
        this.transport.setProtocolVersion(version);
    }
    async start() {
        if (this.onclose) {
            this.transport.onclose = this.onclose;
        }
        else {
            delete this.transport.onclose;
        }
        if (this.onerror) {
            this.transport.onerror = this.onerror;
        }
        else {
            delete this.transport.onerror;
        }
        if (this.onmessage) {
            this.transport.onmessage = this.onmessage;
        }
        else {
            delete this.transport.onmessage;
        }
        await this.transport.start();
    }
}
const DEFAULT_OPTIONS = {
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
function parseIntegerFlag(name, value) {
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`Expected ${name} to be a positive integer.`);
    }
    return parsed;
}
function parsePortFlag(value) {
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error("Expected --port to be zero or a positive integer.");
    }
    return parsed;
}
function parseNumberFlag(name, value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error(`Expected ${name} to be a number between 0 and 1.`);
    }
    return parsed;
}
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
async function measureOperation(operation, work) {
    const startedAt = performance.now();
    try {
        await work();
        return {
            ok: true,
            operation,
            latencyMs: performance.now() - startedAt,
        };
    }
    catch (error) {
        return {
            ok: false,
            operation,
            latencyMs: performance.now() - startedAt,
            errorMessage: getErrorMessage(error),
        };
    }
}
function isObjectRecord(value) {
    return typeof value === "object" && value !== null;
}
function isTextContentItem(value) {
    if (!isObjectRecord(value)) {
        return false;
    }
    return value["type"] === "text" && typeof value["text"] === "string";
}
function hasContentArray(value) {
    if (!isObjectRecord(value)) {
        return false;
    }
    return Array.isArray(value["content"]);
}
function extractVersionText(response) {
    const content = hasContentArray(response) ? response.content : [];
    return content
        .filter(isTextContentItem)
        .map((item) => item.text)
        .join("\n");
}
function normalizeToolCallResponse(response) {
    const textContent = extractVersionText(response);
    if (textContent.length === 0) {
        return response;
    }
    try {
        return JSON.parse(textContent);
    }
    catch {
        return textContent;
    }
}
function requireScenarioUrl(options) {
    if (!options.url) {
        throw new Error("Expected an HTTP URL for the reliability scenario.");
    }
    return options.url;
}
function requireSmokeProfile() {
    const baseProfile = getReliabilityProfile("smoke");
    if (baseProfile.runner !== "smoke") {
        throw new Error("Expected the smoke reliability profile.");
    }
    return baseProfile;
}
function createConnectTransport(baseUrl) {
    return new ConnectTransportAdapter(new StreamableHTTPClientTransport(new URL(baseUrl)));
}
function createReliabilityClient(index) {
    return new Client({
        name: `ynab-mcp-bridge-reliability-${index + 1}`,
        version: "1.0.0",
    });
}
function defaultToolCallValidation(response) {
    const normalizedResponse = normalizeToolCallResponse(response);
    if (!isObjectRecord(normalizedResponse) || typeof normalizedResponse["version"] !== "string") {
        throw new Error("Expected ynab_get_mcp_version to return version text.");
    }
}
function getMeasuredToolCalls(toolCalls) {
    if (toolCalls && toolCalls.length > 0) {
        return toolCalls;
    }
    return [{
            arguments: {},
            name: "ynab_get_mcp_version",
            validate: defaultToolCallValidation,
        }];
}
function parseReliabilityHttpValueFlag(parsed, argument, value) {
    if (!value) {
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
function applyReliabilityHttpFlag(parsed, argument, value) {
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
function isReliabilityArtifact(value) {
    if (!isObjectRecord(value)) {
        return false;
    }
    return isObjectRecord(value["profile"]) && isObjectRecord(value["summary"]);
}
async function readBaselineArtifact(path) {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!isReliabilityArtifact(parsed)) {
        throw new Error(`Failed to parse baseline artifact: ${path}.`);
    }
    return parsed;
}
export async function runMeasuredHttpSequence(baseUrl, index, options = {}) {
    const client = options.createClient?.(index) ?? createReliabilityClient(index);
    const transport = options.createTransport?.(baseUrl) ?? createConnectTransport(baseUrl);
    const toolCalls = getMeasuredToolCalls(options.toolCalls);
    const results = [];
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
        results.push(await measureOperation("tools/list", async () => {
            const listedTools = await client.listTools();
            if (!listedTools.tools.some((tool) => tool.name === "ynab_get_mcp_version")) {
                throw new Error("Expected ynab_get_mcp_version to be registered.");
            }
        }));
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
    }
    finally {
        if (connected) {
            await client.close();
        }
    }
}
export function parseReliabilityHttpArgs(argv) {
    const parsed = {
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
export function formatReliabilitySummary(summary) {
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
        lines.push(`failure operation=${failure.operation} latency=${failure.latencyMs.toFixed(2)}ms message=${failure.errorMessage}`);
    }
    return lines.join("\n");
}
export async function runHttpReliabilityScenario(options) {
    const url = requireScenarioUrl(options);
    const results = await runReliabilityProbes({
        concurrency: options.concurrency,
        count: options.requestCount,
        probe: async (index) => await runMeasuredHttpSequence(url, index),
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
function createSmokeProfile(options) {
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
export async function executeReliabilityHttpCli(argv, dependencies = {}) {
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
        const formattedSummary = {
            passed: !artifact.summary.failed,
            maxErrorRate: artifact.profile.thresholds.maxErrorRate,
            errorRate: artifact.summary.thresholds.maxErrorRate.actual,
            failureGroups: artifact.summary.failureGroups,
            totals: artifact.summary.totals,
            latencyMs: artifact.summary.latencyMs,
            thresholds: artifact.summary.thresholds,
            failures: artifact.summary.failures,
        };
        const writeLine = dependencies.writeLine ?? console.log;
        writeLine(formatReliabilitySummary(formattedSummary));
        let exitCode = artifact.summary.failed ? 1 : 0;
        if (options.jsonOut) {
            await writeFile(options.jsonOut, JSON.stringify(artifact, null, 2), "utf8");
            writeLine(`artifact=${options.jsonOut}`);
        }
        if (options.baselineArtifact) {
            let baseline;
            try {
                baseline = await readBaselineArtifact(options.baselineArtifact);
            }
            catch (error) {
                throw new Error(`Failed to read baseline artifact: ${options.baselineArtifact}. ${getErrorMessage(error)}`);
            }
            const comparison = compareReliabilityArtifacts({
                baseline,
                current: artifact,
                tolerances: {
                    maxErrorRateIncrease: 0.05,
                    maxP95LatencyIncreaseMs: 250,
                    maxP99LatencyIncreaseMs: 250,
                },
            });
            writeLine(`baseline_status=${comparison.passed ? "pass" : "fail"}`);
            if (!comparison.passed) {
                exitCode = 1;
            }
        }
        return exitCode;
    }
    catch (error) {
        (dependencies.writeLine ?? console.error)(`status=error message=${getErrorMessage(error)}`);
        return 1;
    }
}
