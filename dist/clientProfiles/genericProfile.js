function pass() {
    return "pass";
}
export const genericProfile = {
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
        onInitialize: () => { },
        onTokenRequest: pass,
    },
};
