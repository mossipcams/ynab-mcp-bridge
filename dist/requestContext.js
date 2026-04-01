import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { getFirstHeaderValue } from "./headerUtils.js";
const requestContextStorage = new AsyncLocalStorage();
const CORRELATION_HEADER = "x-correlation-id";
const MAX_CORRELATION_ID_LENGTH = 128;
const VALID_CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
function createId() {
    return crypto.randomUUID();
}
function normalizeCorrelationId(value) {
    if (!value) {
        return undefined;
    }
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0 ||
        trimmedValue.length > MAX_CORRELATION_ID_LENGTH ||
        !VALID_CORRELATION_ID_PATTERN.test(trimmedValue)) {
        return undefined;
    }
    return trimmedValue;
}
export function getCorrelationHeaderName() {
    return CORRELATION_HEADER;
}
export function createRequestContext(headers) {
    const firstValue = getFirstHeaderValue(headers[CORRELATION_HEADER]);
    return {
        correlationId: normalizeCorrelationId(firstValue) ?? createId(),
        requestId: createId(),
        toolCallStarted: false,
    };
}
export function runWithRequestContext(context, callback) {
    return requestContextStorage.run({
        ...context,
        toolCallStarted: context.toolCallStarted ?? false,
    }, callback);
}
export function getRequestContext() {
    return requestContextStorage.getStore();
}
export function markToolCallStarted() {
    const context = getRequestContext();
    if (context) {
        context.toolCallStarted = true;
    }
}
export function hasToolCallStarted() {
    return getRequestContext()?.toolCallStarted === true;
}
export function getRequestLogFields() {
    const context = getRequestContext();
    if (!context) {
        return {};
    }
    return {
        correlationId: context.correlationId,
        ...(typeof context.method === "string" ? { method: context.method } : {}),
        ...(typeof context.path === "string" ? { path: context.path } : {}),
        requestId: context.requestId,
    };
}
