/* eslint-disable @typescript-eslint/consistent-type-assertions --
   The YNAB SDK exposes configuration and generated API internals through
   protected/private-ish shapes, so we need narrow structural casts at this boundary. */
import * as ynab from "ynab";

import { assertYnabConfig, type YnabConfig } from "./config.js";
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

type YnabApiWithInternals = {
  _configuration: {
    config?: Record<string, unknown> | undefined;
    configuration: ynab.ConfigurationParameters;
  };
};

type YnabApiRuntimeContext = {
  config: YnabConfig;
};

type YnabApiWithRuntimeContext = ynab.API & {
  [runtimeContextSymbol]?: YnabApiRuntimeContext;
};

function normalizeYnabConfig(configOrToken: YnabConfig | string | undefined): YnabConfig {
  if (typeof configOrToken === "string") {
    return assertYnabConfig({
      apiToken: configOrToken.trim(),
    });
  }

  return assertYnabConfig(configOrToken);
}

function getSdkConfiguration(api: ynab.API): YnabApiWithInternals["_configuration"] {
  return (api as unknown as YnabApiWithInternals)._configuration;
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

export function attachYnabApiRuntimeContext<T extends object>(api: T, config: YnabConfig) {
  const target = api as T & YnabApiWithRuntimeContext;
  const existingContext = target[runtimeContextSymbol];

  if (existingContext) {
    existingContext.config = config;
    return target;
  }

  Object.defineProperty(target, runtimeContextSymbol, {
    configurable: false,
    enumerable: false,
    value: {
      config,
    } satisfies YnabApiRuntimeContext,
    writable: false,
  });

  return target;
}

export function getYnabApiRuntimeContext(api: object) {
  return (api as YnabApiWithRuntimeContext)[runtimeContextSymbol];
}

export function getConfiguredPlanId(api: object) {
  return getYnabApiRuntimeContext(api)?.config.planId?.trim();
}

export function createYnabApi(configOrToken: YnabConfig | string | undefined, options: CreateYnabApiOptions = {}) {
  const config = normalizeYnabConfig(configOrToken);
  const api = attachYnabApiRuntimeContext(new ynab.API(config.apiToken), config);
  const configuration = getSdkConfiguration(api);

  configuration.config = {
    ...configuration.configuration,
    fetchApi: createRateLimitedFetchApi(config.apiToken, {
      fetchApi: options.fetchApi ?? fetch,
      rateLimiter: options.rateLimiter ?? sharedRateLimiter,
      retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      retryLimit: options.retryLimit ?? DEFAULT_RETRY_LIMIT,
    }),
  };

  if (!("moneyMovements" in api)) {
    Object.defineProperty(api, "moneyMovements", {
      configurable: true,
      enumerable: false,
      value: new ynab.MoneyMovementsApi(getSdkConfiguration(api) as unknown as ynab.Configuration),
    });
  }

  return api;
}
