import type { ClientProfile } from "./types.js";

function pass() {
  return "pass" as const;
}

export const genericProfile: ClientProfile = {
  id: "generic",
  matchesInitialize: () => false,
  matchesPreAuth: () => false,
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
  hooks: {
    onAuthorizeRequest: pass,
    onDiscoveryRequest: pass,
    onInitialize: () => {},
    onTokenRequest: pass,
  },
};
