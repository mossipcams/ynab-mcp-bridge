import type { RequestHandler, Router } from "express";
import type express from "express";

import type { RuntimeAuthConfig } from "./config.js";
import { getResolvedClientProfile, setResolvedClientProfile } from "./clientProfiles/profileContext.js";
import { logClientProfileEvent } from "./clientProfiles/profileLogger.js";
import type { ClientProfileId } from "./clientProfiles/types.js";
import {
  getCanonicalOAuthDiscoveryPath,
  getPersistedOAuthProfileReason,
  getRequestDebugDetails,
  getRequestPath,
  isDirectUpstreamBearerToken,
  logHttpDebug,
} from "./httpServerShared.js";

type OAuthMcpAuthModule = {
  authMiddleware: RequestHandler;
  getClientCompatibilityProfile: (clientId: string) => ClientProfileId | undefined;
  protectedResourceMetadata: unknown;
  router: Router;
};

export function registerOAuthHttpRoutes(options: {
  app: express.Express;
  auth: Extract<RuntimeAuthConfig, { mode: "oauth" }>;
  getRequestAuthDebugOptions: (req: Parameters<typeof getRequestDebugDetails>[0]) => {
    authMode?: RuntimeAuthConfig["mode"] | undefined;
    authRequired?: boolean | undefined;
  };
  mcpAuthModule: OAuthMcpAuthModule;
  path: string;
}) {
  const { app, auth, getRequestAuthDebugOptions, mcpAuthModule, path } = options;

  app.get("/.well-known/oauth-protected-resource", (req, res, next) => {
    const resolvedProfile = getResolvedClientProfile(res.locals);

    if (resolvedProfile?.profileId !== "chatgpt") {
      next();
      return;
    }

    res.status(200).json(mcpAuthModule.protectedResourceMetadata);
  });

  app.use((req, res, next) => {
    const resolvedProfile = getResolvedClientProfile(res.locals);
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
    if (getRequestPath(req) !== path || (req.method !== "POST" && req.method !== "DELETE")) {
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

    const persistedProfile = {
      profileId: persistedProfileId,
      reason: getPersistedOAuthProfileReason(persistedProfileId),
    };
    const resolvedProfile = getResolvedClientProfile(res.locals);

    if (
      resolvedProfile?.profileId !== persistedProfile.profileId ||
      resolvedProfile.reason !== persistedProfile.reason
    ) {
      setResolvedClientProfile(res.locals, persistedProfile);
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
