import { genericProfile } from "./genericProfile.js";
import { getRequestOrigin, getRequestUserAgent } from "./requestContext.js";
import { getStringValue, isRecord } from "../typeUtils.js";
import type { ClientProfile } from "./types.js";

export const claudeProfile: ClientProfile = {
  ...genericProfile,
  id: "claude",
  detection: {
    initializeReason: "initialize:client-info",
    preAuthReason: "origin:claude.ai",
  },
  detectPreAuth: (context) => {
    if (getRequestOrigin(context) === "https://claude.ai") {
      return {
        profileId: "claude",
        reason: "origin:claude.ai",
      };
    }

    if (getRequestUserAgent(context)?.startsWith("claude-user")) {
      return {
        profileId: "claude",
        reason: "user-agent:claude-user",
      };
    }

    return undefined;
  },
  matchesPreAuth: (context) => Boolean(claudeProfile.detectPreAuth?.(context)),
  matchesInitialize: (clientInfo) => Boolean(
    isRecord(clientInfo) &&
    getStringValue(clientInfo, "name")?.toLowerCase().includes("claude"),
  ),
  oauth: {
    ...genericProfile.oauth,
    tolerateMissingResourceParam: true,
    tokenRequestLeniency: "normal",
  },
  transport: {
    ...genericProfile.transport,
    acceptSessionHeaderButIgnoreIt: true,
  },
};
