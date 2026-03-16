import type { Response } from "express";

const CORS_HEADERS = {
  "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization",
  "access-control-allow-methods": "OPTIONS, POST",
  "access-control-expose-headers": "Mcp-Session-Id",
} as const;

function getFirstHeaderValue(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value.split(",")[0]?.trim();
  }

  return value?.[0]?.split(",")[0]?.trim();
}

function parseHostName(host: string | undefined) {
  if (!host) {
    return undefined;
  }

  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return undefined;
  }
}

function isLoopbackHostname(hostname: string | undefined) {
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname === "localhost";
}

function getRequestHostName(headers: Record<string, string | string[] | undefined>) {
  const forwardedHost = getFirstHeaderValue(headers["x-forwarded-host"]);
  const host = forwardedHost ?? getFirstHeaderValue(headers.host);

  return parseHostName(host);
}

export function normalizeOrigin(origin: string) {
  return new URL(origin).origin;
}

export function resolveOriginPolicy(input: {
  allowedOrigins: Set<string>;
  headers: Record<string, string | string[] | undefined>;
  path?: string;
}) {
  const originHeader = getFirstHeaderValue(input.headers.origin);

  if (!originHeader) {
    return {
      allowed: true,
      responseOrigin: undefined,
    };
  }

  if (originHeader === "null" && input.path === "/authorize/consent") {
    return {
      allowed: true,
      responseOrigin: undefined,
    };
  }

  try {
    const normalizedOrigin = normalizeOrigin(originHeader);

    if (input.allowedOrigins.has(normalizedOrigin)) {
      return {
        allowed: true,
        responseOrigin: normalizedOrigin,
      };
    }

    const requestHostName = getRequestHostName(input.headers);
    const originHostName = new URL(normalizedOrigin).hostname;

    if (isLoopbackHostname(requestHostName) && isLoopbackHostname(originHostName)) {
      return {
        allowed: true,
        responseOrigin: normalizedOrigin,
      };
    }
  } catch {
    return {
      allowed: false,
      responseOrigin: undefined,
    };
  }

  return {
    allowed: false,
    responseOrigin: undefined,
  };
}

export function applyCorsHeaders(res: Response, responseOrigin: string | undefined) {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(name, value);
  }

  if (!responseOrigin) {
    return;
  }

  res.setHeader("access-control-allow-origin", responseOrigin);
  res.append("vary", "Origin");
}
