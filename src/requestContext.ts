import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { getFirstHeaderValue } from "./headerUtils.js";

type RequestContext = {
  correlationId: string;
  requestId: string;
  toolCallStarted: boolean;
};

type RequestContextInput = Pick<RequestContext, "correlationId" | "requestId"> & Partial<Pick<RequestContext, "toolCallStarted">>;

const requestContextStorage = new AsyncLocalStorage<RequestContext>();
const CORRELATION_HEADER = "x-correlation-id";
const MAX_CORRELATION_ID_LENGTH = 128;
const VALID_CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

function createId() {
  return crypto.randomUUID();
}

function normalizeCorrelationId(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (
    trimmedValue.length === 0 ||
    trimmedValue.length > MAX_CORRELATION_ID_LENGTH ||
    !VALID_CORRELATION_ID_PATTERN.test(trimmedValue)
  ) {
    return undefined;
  }

  return trimmedValue;
}

export function getCorrelationHeaderName() {
  return CORRELATION_HEADER;
}

export function createRequestContext(headers: Record<string, string | string[] | undefined>): RequestContext {
  const firstValue = getFirstHeaderValue(headers[CORRELATION_HEADER]);

  return {
    correlationId: normalizeCorrelationId(firstValue) ?? createId(),
    requestId: createId(),
    toolCallStarted: false,
  };
}

export function runWithRequestContext<T>(context: RequestContextInput, callback: () => T) {
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
    requestId: context.requestId,
  };
}
