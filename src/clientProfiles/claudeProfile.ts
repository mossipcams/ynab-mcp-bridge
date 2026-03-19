import { genericProfile } from "./genericProfile.js";
import type { ClientProfile } from "./types.js";

export const claudeProfile: ClientProfile = {
  ...genericProfile,
  id: "claude",
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
