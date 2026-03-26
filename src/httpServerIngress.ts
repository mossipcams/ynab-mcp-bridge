import type { RequestHandler, Router } from "express";
import type express from "express";
import {
  hostHeaderValidation,
  localhostHostValidation,
} from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";

import type { RuntimeAuthConfig } from "./config.js";
import { detectClientProfile } from "./clientProfiles/detectClient.js";
import { setResolvedClientProfile } from "./clientProfiles/profileContext.js";
import { logClientProfileEvent } from "./clientProfiles/profileLogger.js";
import type { ClientProfileId } from "./clientProfiles/types.js";
import { isLoopbackHostname } from "./headerUtils.js";
import {
  allowsOpaqueNullOrigin,
  getBodyStringValue,
  getPersistedOAuthProfileReason,
  getRequestDebugDetails,
  getRequestPath,
  logHttpDebug,
  toClientProfileRequestContext,
  writeForbiddenOrigin,
} from "./httpServerShared.js";
import { applyCorsHeaders, installCorsGuard, resolveOriginPolicy } from "./originPolicy.js";
import { createRequestContext, getCorrelationHeaderName, runWithRequestContext } from "./requestContext.js";

type McpAuthModuleLike = {
  getClientCompatibilityProfile: (clientId: string) => ClientProfileId | undefined;
  router: Router;
};

export function registerHttpServerIngress(options: {
  allowedHosts: readonly string[];
  allowedOrigins: ReadonlySet<string>;
  app: express.Express;
  auth: RuntimeAuthConfig;
  cloudflareCompatibilityMiddleware?: RequestHandler | undefined;
  getRequestAuthDebugOptions: (req: Parameters<typeof getRequestDebugDetails>[0]) => {
    authMode?: RuntimeAuthConfig["mode"] | undefined;
    authRequired?: boolean | undefined;
  };
  host: string;
  mcpAuthModule?: McpAuthModuleLike | undefined;
  path: string;
  jsonParser: RequestHandler;
  urlencodedParser: RequestHandler;
}) {
  const {
    allowedHosts,
    allowedOrigins,
    app,
    auth,
    cloudflareCompatibilityMiddleware,
    getRequestAuthDebugOptions,
    host,
    mcpAuthModule,
    path,
    jsonParser,
    urlencodedParser,
  } = options;

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    const requestContext = createRequestContext(req.headers as Record<string, string | string[] | undefined>);

    runWithRequestContext(requestContext, () => {
      res.setHeader(getCorrelationHeaderName(), requestContext.correlationId);
      next();
    });
  });

  app.use((req, _res, next) => {
    logHttpDebug("request.received", getRequestDebugDetails(req, getRequestAuthDebugOptions(req)));
    next();
  });

  if (auth.mode === "oauth") {
    app.use((req, res, next) => {
      if (getRequestPath(req) !== "/token" || req.method !== "POST") {
        next();
        return;
      }

      urlencodedParser(req, res, next);
    });
  }

  app.use((req, res, next) => {
    const requestProfile = detectClientProfile(toClientProfileRequestContext(req));
    const tokenClientId = auth.mode === "oauth" &&
      getRequestPath(req) === "/token" &&
      req.method === "POST"
      ? getBodyStringValue(req.body, "client_id")
      : undefined;
    const persistedProfileId = auth.mode === "oauth" && tokenClientId
      ? mcpAuthModule?.getClientCompatibilityProfile(tokenClientId)
      : undefined;
    const detectedProfile = persistedProfileId && requestProfile.profileId === "generic"
      ? {
          profileId: persistedProfileId,
          reason: getPersistedOAuthProfileReason(persistedProfileId),
        }
      : requestProfile;

    setResolvedClientProfile(res.locals, detectedProfile);
    logClientProfileEvent("profile.detected", {
      method: req.method ?? "GET",
      path: getRequestPath(req),
      profileId: detectedProfile.profileId,
      reason: detectedProfile.reason,
    });

    next();
  });

  if (allowedHosts.length > 0) {
    app.use(hostHeaderValidation([...allowedHosts]));
  } else if (isLoopbackHostname(host)) {
    app.use(localhostHostValidation());
  }

  app.use((req, res, next) => {
    const resolution = resolveOriginPolicy({
      allowOpaqueNullOrigin: allowsOpaqueNullOrigin(req, auth.mode),
      allowedOrigins: new Set(allowedOrigins),
      headers: req.headers,
    });

    if (!resolution.allowed) {
      logHttpDebug("request.rejected", {
        ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
        reason: "forbidden-origin",
      });
      writeForbiddenOrigin(res);
      return;
    }

    applyCorsHeaders(res, resolution.responseOrigin);

    if (resolution.responseOrigin) {
      installCorsGuard(res, resolution.responseOrigin);
    }

    next();
  });

  app.use((req, res, next) => {
    if (req.method === "OPTIONS") {
      logHttpDebug("request.preflight", getRequestDebugDetails(req));
      res.status(204).end();
      return;
    }

    next();
  });

  app.use((req, res, next) => {
    if (getRequestPath(req) !== path || req.method !== "POST") {
      next();
      return;
    }

    if (auth.mode === "oauth" && cloudflareCompatibilityMiddleware) {
      cloudflareCompatibilityMiddleware(req, res, (error?: unknown) => {
        if (error) {
          next(error);
          return;
        }

        jsonParser(req, res, next);
      });
      return;
    }

    jsonParser(req, res, next);
  });
}
