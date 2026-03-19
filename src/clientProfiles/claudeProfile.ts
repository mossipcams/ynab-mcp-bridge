import { genericProfile } from "./genericProfile.js";
import { getRequestOrigin } from "./requestContext.js";
import type { ClientProfile } from "./types.js";

export const claudeProfile: ClientProfile = {
  ...genericProfile,
  id: "claude",
  detection: {
    initializeReason: "initialize:client-info",
    preAuthReason: "origin:claude.ai",
  },
  matchesPreAuth: (context) => getRequestOrigin(context) === "https://claude.ai",
  matchesInitialize: (clientInfo) => (
    typeof (clientInfo as { name?: unknown } | undefined)?.name === "string" &&
    (clientInfo as { name: string }).name.toLowerCase().includes("claude")
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
