import { genericProfile } from "./genericProfile.js";
import { getRequestOrigin, getRequestUserAgent } from "./requestContext.js";
import { getStringValue, isRecord } from "../typeUtils.js";
import type { ClientProfile } from "./types.js";

function isClaudeDesktopUserAgent(userAgent: string | undefined) {
  return userAgent === "claude-user" || userAgent?.startsWith("claude-user/") === true;
}

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

    if (isClaudeDesktopUserAgent(getRequestUserAgent(context))) {
      return {
        profileId: "claude",
        reason: "user-agent:claude-desktop",
      };
    }

    return undefined;
  },
  matchesPreAuth: (context) => getRequestOrigin(context) === "https://claude.ai",
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
