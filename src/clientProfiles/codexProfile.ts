import { genericProfile } from "./genericProfile.js";
import { getRequestUserAgent } from "./requestContext.js";
import type { ClientProfile } from "./types.js";

const CODEX_DISCOVERY_PATHS = new Set([
  "/.well-known/oauth-authorization-server/sse",
  "/sse/.well-known/oauth-authorization-server",
]);

export const codexProfile: ClientProfile = {
  ...genericProfile,
  id: "codex",
  detection: {
    initializeReason: "initialize:client-info",
    preAuthReason: "path:codex-oauth-probe",
  },
  detectPreAuth: (context) => {
    if (CODEX_DISCOVERY_PATHS.has(context.path)) {
      return {
        profileId: "codex",
        reason: "path:codex-oauth-probe",
      };
    }

    if (getRequestUserAgent(context)?.includes("codex")) {
      return {
        profileId: "codex",
        reason: "user-agent:codex",
      };
    }

    return undefined;
  },
  matchesPreAuth: (context) => Boolean(codexProfile.detectPreAuth?.(context)),
  matchesInitialize: (clientInfo) => (
    typeof (clientInfo as { name?: unknown } | undefined)?.name === "string" &&
    (clientInfo as { name: string }).name.toLowerCase().includes("codex")
  ),
  oauth: {
    ...genericProfile.oauth,
    discoveryPathVariants: [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-authorization-server/sse",
      "/sse/.well-known/oauth-authorization-server",
    ],
    tolerateExtraDiscoveryProbes: true,
  },
};
