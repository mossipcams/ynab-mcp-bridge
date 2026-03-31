import { genericProfile } from "./genericProfile.js";
import { getRequestUserAgent } from "./requestContext.js";
import { getStringValue, isRecord } from "../typeUtils.js";
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
  detectPreAuth: (context) => {
    if (CHATGPT_DISCOVERY_PATHS.has(context.path)) {
      return {
        profileId: "chatgpt",
        reason: "path:chatgpt-protected-resource-probe",
      };
    }

    if (getRequestUserAgent(context)?.startsWith("openai-mcp/")) {
      return {
        profileId: "chatgpt",
        reason: "user-agent:openai-mcp",
      };
    }

    if (getRequestUserAgent(context)?.includes("chatgpt")) {
      return {
        profileId: "chatgpt",
        reason: "user-agent:chatgpt",
      };
    }

    return undefined;
  },
  matchesPreAuth: (context) => Boolean(chatgptProfile.detectPreAuth?.(context)),
  matchesInitialize: (clientInfo) => {
    const name = isRecord(clientInfo)
      ? getStringValue(clientInfo, "name")?.toLowerCase()
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
