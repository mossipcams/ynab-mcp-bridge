import { genericProfile } from "./genericProfile.js";
import type { ClientProfile } from "./types.js";

const CHATGPT_DISCOVERY_PATHS = new Set([
  "/.well-known/oauth-protected-resource",
]);

export const chatgptProfile: ClientProfile = {
  ...genericProfile,
  id: "chatgpt",
  detection: {
    initializeReason: "initialize:client-info",
    preAuthReason: "path:chatgpt-protected-resource-probe",
  },
  matchesPreAuth: (context) => CHATGPT_DISCOVERY_PATHS.has(context.path),
  matchesInitialize: (clientInfo) => {
    const name = typeof (clientInfo as { name?: unknown } | undefined)?.name === "string"
      ? (clientInfo as { name: string }).name.toLowerCase()
      : undefined;

    return Boolean(name && (name.includes("chatgpt") || name.includes("openai-mcp")));
  },
  oauth: {
    ...genericProfile.oauth,
    discoveryPathVariants: [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-protected-resource",
    ],
    tolerateExtraDiscoveryProbes: true,
  },
};
