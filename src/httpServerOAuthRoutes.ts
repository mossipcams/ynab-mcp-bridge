import type { Express, Request, RequestHandler } from "express";

import type { ClientProfileId, DetectedClientProfile } from "./clientProfiles/types.js";
import { getResolvedClientProfile, setResolvedClientProfile } from "./clientProfiles/profileContext.js";
import { logClientProfileEvent } from "./clientProfiles/profileLogger.js";
import { createMcpAuthModule } from "./mcpAuthServer.js";
import type { RuntimeAuthConfig } from "./config.js";

type OAuthAuthConfig = Extract<RuntimeAuthConfig, { mode: "oauth" }>;
type AuthDebugOptions = {
  authMode?: RuntimeAuthConfig["mode"];
  authRequired?: boolean;
};

type InstallOAuthRoutesOptions = {
  app: Express;
  auth: OAuthAuthConfig;
  cloudflareCompatibilityMiddleware: RequestHandler;
  getCanonicalOAuthDiscoveryPath: (pathname: string, profileId: ClientProfileId) => string | undefined;
  getPersistedOAuthProfileReason: (profileId: ClientProfileId) => string;
  getRequestAuthDebugOptions: (req: Pick<Request, "path" | "url">) => AuthDebugOptions;
  getRequestDebugDetails: (req: Request, options?: AuthDebugOptions) => Record<string, unknown>;
  getRequestPath: (req: Pick<Request, "path" | "url">) => string;
  isDirectUpstreamBearerToken: (req: Pick<Request, "headers">, auth: OAuthAuthConfig) => boolean;
  jsonParser: RequestHandler;
  logHttpDebug: (event: string, details: Record<string, unknown>) => void;
  mcpAuthModule: ReturnType<typeof createMcpAuthModule>;
  path: string;
};

export function installOAuthRoutes(options: InstallOAuthRoutesOptions) {
  const {
    app,
    auth,
    cloudflareCompatibilityMiddleware,
    getCanonicalOAuthDiscoveryPath,
    getPersistedOAuthProfileReason,
    getRequestAuthDebugOptions,
    getRequestDebugDetails,
    getRequestPath,
    isDirectUpstreamBearerToken,
    jsonParser,
    logHttpDebug,
    mcpAuthModule,
    path,
  } = options;

  app.get("/.well-known/oauth-protected-resource", (req, res, next) => {
    const resolvedProfile = getResolvedClientProfile(res.locals as Record<string, unknown>);

    if (resolvedProfile?.profileId !== "chatgpt") {
      next();
      return;
    }

    res.status(200).json(mcpAuthModule.protectedResourceMetadata);
  });

  app.use((req, res, next) => {
    const resolvedProfile = getResolvedClientProfile(res.locals as Record<string, unknown>);
    const canonicalPath = getCanonicalOAuthDiscoveryPath(
      getRequestPath(req),
      resolvedProfile?.profileId ?? "generic",
    );

    if (canonicalPath) {
      req.url = canonicalPath;
    }

    next();
  });

  app.use(mcpAuthModule.router);

  app.use((req, res, next) => {
    if (getRequestPath(req) === path && req.method === "POST") {
      cloudflareCompatibilityMiddleware(req, res, (error?: unknown) => {
        if (error) {
          next(error);
          return;
        }

        jsonParser(req, res, next);
      });
      return;
    }

    next();
  });

  app.use((req, res, next) => {
    if (getRequestPath(req) !== path || req.method !== "POST") {
      next();
      return;
    }

    if (isDirectUpstreamBearerToken(req, auth)) {
      delete req.headers.authorization;
    }

    res.once("finish", () => {
      if (req.auth || (res.statusCode !== 401 && res.statusCode !== 403)) {
        return;
      }

      logHttpDebug("request.rejected", {
        ...getRequestDebugDetails(req, getRequestAuthDebugOptions(req)),
        reason: res.statusCode === 401 ? "unauthorized" : "forbidden-scope",
      });
    });

    mcpAuthModule.authMiddleware(req, res, next);
  });

  app.use((req, res, next) => {
    if (getRequestPath(req) !== path || req.method !== "POST" || !req.auth?.clientId) {
      next();
      return;
    }

    const persistedProfileId = mcpAuthModule.getClientCompatibilityProfile(req.auth.clientId);

    if (!persistedProfileId) {
      next();
      return;
    }

    const persistedProfile: DetectedClientProfile = {
      profileId: persistedProfileId,
      reason: getPersistedOAuthProfileReason(persistedProfileId),
    };
    const resolvedProfile = getResolvedClientProfile(res.locals as Record<string, unknown>);

    if (
      resolvedProfile?.profileId !== persistedProfile.profileId ||
      resolvedProfile.reason !== persistedProfile.reason
    ) {
      setResolvedClientProfile(res.locals as Record<string, unknown>, persistedProfile);
      logClientProfileEvent("profile.detected", {
        method: req.method ?? "GET",
        path: getRequestPath(req),
        profileId: persistedProfile.profileId,
        reason: persistedProfile.reason,
      });
    }

    next();
  });
}
