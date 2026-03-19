import { genericProfile } from "./genericProfile.js";
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
  matchesPreAuth: (context) => CODEX_DISCOVERY_PATHS.has(context.path),
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
