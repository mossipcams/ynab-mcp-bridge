import * as ynab from "ynab";

import { assertYnabConfig, type NormalizedYnabConfig, type YnabConfig } from "./config.js";
import { getRecordValueIfObject, isRecord } from "./typeUtils.js";
import { isPlanId, type PlanId } from "./ynabTypes.js";
import { SlidingWindowRateLimiter, createYnabRateLimiter } from "./ynabRateLimiter.js";

declare module "ynab" {
  interface api {
    moneyMovements: ynab.MoneyMovementsApi;
  }
}

type CreateYnabApiOptions = {
  fetchApi?: typeof fetch;
  rateLimiter?: SlidingWindowRateLimiter;
  retryDelayMs?: number;
  retryLimit?: number;
};

const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_RETRY_LIMIT = 1;
const sharedRateLimiter = createYnabRateLimiter();
const runtimeContextSymbol = Symbol("ynabRuntimeContext");

type YnabSdkConfiguration = {
  configuration: ynab.ConfigurationParameters;
  sdk: ynab.Configuration;
};

type YnabApiRuntimeContext = {
  config: NormalizedYnabConfig;
  runtimePlanIdOverride?: PlanId | undefined;
};

function normalizeYnabConfig(configOrToken: YnabConfig | string | undefined): NormalizedYnabConfig {
  if (typeof configOrToken === "string") {
    return assertYnabConfig({
      apiToken: configOrToken.trim(),
    });
  }

  return assertYnabConfig(configOrToken);
}

function getSdkConfiguration(api: ynab.API): YnabSdkConfiguration {
  const sdkConfiguration: unknown = Object.getOwnPropertyDescriptor(api, "_configuration")?.value;

  if (!(sdkConfiguration instanceof ynab.Configuration)) {
    throw new Error("YNAB SDK configuration is invalid.");
  }

  return {
    configuration: {
      ...(sdkConfiguration.accessToken !== undefined ? { accessToken: sdkConfiguration.accessToken } : {}),
      ...(sdkConfiguration.apiKey !== undefined ? { apiKey: sdkConfiguration.apiKey } : {}),
      basePath: sdkConfiguration.basePath,
      ...(sdkConfiguration.credentials !== undefined ? { credentials: sdkConfiguration.credentials } : {}),
      ...(sdkConfiguration.fetchApi !== undefined ? { fetchApi: sdkConfiguration.fetchApi } : {}),
      ...(sdkConfiguration.headers !== undefined ? { headers: sdkConfiguration.headers } : {}),
      ...(sdkConfiguration.middleware !== undefined ? { middleware: sdkConfiguration.middleware } : {}),
      ...(sdkConfiguration.password !== undefined ? { password: sdkConfiguration.password } : {}),
      ...(sdkConfiguration.queryParamsStringify !== undefined ? { queryParamsStringify: sdkConfiguration.queryParamsStringify } : {}),
      ...(sdkConfiguration.username !== undefined ? { username: sdkConfiguration.username } : {}),
    },
    sdk: sdkConfiguration,
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getRetryDelayMs(response: Response, fallbackDelayMs: number) {
  const retryAfter = response.headers.get("retry-after");

  if (!retryAfter) {
    return fallbackDelayMs;
  }

  const retryAfterSeconds = Number(retryAfter);

  if (Number.isFinite(retryAfterSeconds)) {
    return Math.max(retryAfterSeconds * 1000, 0);
  }

  const retryAfterTimestamp = Date.parse(retryAfter);

  if (Number.isNaN(retryAfterTimestamp)) {
    return fallbackDelayMs;
  }

  return Math.max(retryAfterTimestamp - Date.now(), 0);
}

function createRateLimitedFetchApi(
  token: string,
  options: Required<Pick<CreateYnabApiOptions, "fetchApi" | "rateLimiter" | "retryDelayMs" | "retryLimit">>,
) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    let attempt = 0;

    while (true) {
      await options.rateLimiter.acquire(token);
      const response = await options.fetchApi(input, init);

      if (response.status !== 429 || attempt >= options.retryLimit) {
        return response;
      }

      attempt += 1;
      await sleep(getRetryDelayMs(response, options.retryDelayMs));
    }
  };
}

export function attachYnabApiRuntimeContext<T extends object>(api: T, config: NormalizedYnabConfig) {
  const existingContext = getYnabApiRuntimeContext(api);

  if (existingContext) {
    existingContext.config = config;
    return api;
  }

  Object.defineProperty(api, runtimeContextSymbol, {
    configurable: false,
    enumerable: false,
    value: {
      config,
    } satisfies YnabApiRuntimeContext,
    writable: false,
  });

  return api;
}

export function getYnabApiRuntimeContext(api: object): YnabApiRuntimeContext | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(api, runtimeContextSymbol);
  const value: unknown = descriptor?.value;

  if (!isRecord(value)) {
    return undefined;
  }

  const config = getRecordValueIfObject(value, "config");

  if (!config) {
    return undefined;
  }

  const runtimePlanIdOverride = value["runtimePlanIdOverride"];

  if (runtimePlanIdOverride !== undefined && typeof runtimePlanIdOverride !== "string") {
    return undefined;
  }

  const trimmedRuntimePlanIdOverride = typeof runtimePlanIdOverride === "string"
    ? runtimePlanIdOverride.trim()
    : undefined;
  const normalizedRuntimePlanIdOverride = trimmedRuntimePlanIdOverride !== undefined && isPlanId(trimmedRuntimePlanIdOverride)
    ? trimmedRuntimePlanIdOverride
    : undefined;

  return {
    config: assertYnabConfig({
      apiToken: typeof config["apiToken"] === "string" ? config["apiToken"] : "",
      ...(typeof config["planId"] === "string" ? { planId: config["planId"] } : {}),
    }),
    ...(normalizedRuntimePlanIdOverride ? { runtimePlanIdOverride: normalizedRuntimePlanIdOverride } : {}),
  };
}

export function createYnabApi(configOrToken: YnabConfig | string | undefined, options: CreateYnabApiOptions = {}) {
  const config = normalizeYnabConfig(configOrToken);
  const api = attachYnabApiRuntimeContext(new ynab.API(config.apiToken), config);
  const configuration = getSdkConfiguration(api);

  configuration.sdk.config = new ynab.Configuration({
    ...configuration.configuration,
    fetchApi: createRateLimitedFetchApi(config.apiToken, {
      fetchApi: options.fetchApi ?? fetch,
      rateLimiter: options.rateLimiter ?? sharedRateLimiter,
      retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      retryLimit: options.retryLimit ?? DEFAULT_RETRY_LIMIT,
    }),
  });

  if (!("moneyMovements" in api)) {
    const sdkConfiguration = getSdkConfiguration(api);

    Object.defineProperty(api, "moneyMovements", {
      configurable: true,
      enumerable: false,
      value: new ynab.MoneyMovementsApi(sdkConfiguration.sdk),
    });
  }

  return api;
}
