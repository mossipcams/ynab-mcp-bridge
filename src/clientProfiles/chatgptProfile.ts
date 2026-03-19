import { genericProfile } from "./genericProfile.js";
import type { ClientProfile } from "./types.js";

export const chatgptProfile: ClientProfile = {
  ...genericProfile,
  id: "chatgpt",
  oauth: {
    ...genericProfile.oauth,
    discoveryPathVariants: [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-protected-resource",
    ],
    tolerateExtraDiscoveryProbes: true,
  },
};
