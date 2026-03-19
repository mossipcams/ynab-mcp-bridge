import type { ClientProfile } from "./types.js";

export const genericProfile: ClientProfile = {
  id: "generic",
  oauth: {
    allowDynamicClientRegistration: true,
    discoveryPathVariants: ["/.well-known/oauth-authorization-server"],
    tolerateExtraDiscoveryProbes: false,
    tolerateMissingResourceParam: false,
    tokenRequestLeniency: "strict",
  },
  transport: {
    acceptSessionHeaderButIgnoreIt: false,
    preferJsonResponse: true,
    requireStatelessPostOnly: true,
  },
};
