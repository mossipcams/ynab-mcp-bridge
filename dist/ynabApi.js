/* eslint-disable @typescript-eslint/consistent-type-assertions --
   The YNAB SDK exposes configuration and generated API internals through
   protected/private-ish shapes, so we need narrow structural casts at this boundary. */
import * as ynab from "ynab";
import { assertYnabConfig } from "./config.js";
import { createYnabRateLimiter } from "./ynabRateLimiter.js";
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_RETRY_LIMIT = 1;
const sharedRateLimiter = createYnabRateLimiter();
const runtimeContextSymbol = Symbol("ynabRuntimeContext");
function normalizeYnabConfig(configOrToken) {
    if (typeof configOrToken === "string") {
        return assertYnabConfig({
            apiToken: configOrToken.trim(),
        });
    }
    return assertYnabConfig(configOrToken);
}
function getSdkConfiguration(api) {
    return api._configuration;
}
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
function getRetryDelayMs(response, fallbackDelayMs) {
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
function createRateLimitedFetchApi(token, options) {
    return async (input, init) => {
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
export function attachYnabApiRuntimeContext(api, config) {
    const target = api;
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
        },
        writable: false,
    });
    return target;
}
export function getYnabApiRuntimeContext(api) {
    return api[runtimeContextSymbol];
}
export function createYnabApi(configOrToken, options = {}) {
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
            value: new ynab.MoneyMovementsApi(getSdkConfiguration(api)),
        });
    }
    return api;
}
