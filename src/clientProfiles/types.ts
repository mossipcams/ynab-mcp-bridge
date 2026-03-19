export type ClientProfileId = "chatgpt" | "claude" | "codex" | "generic";

export type SetupHookResult = "handle" | "pass";

export type DetectedClientProfile = {
  profileId: ClientProfileId;
  reason: string;
};

export type RequestContext = {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  path: string;
};

export type ClientProfile = {
  detectPreAuth?: (context: RequestContext) => DetectedClientProfile | undefined;
  id: ClientProfileId;
  matchesPreAuth: (context: RequestContext) => boolean;
  matchesInitialize: (clientInfo: unknown, capabilities: unknown) => boolean;
  detection?: {
    initializeReason?: string;
    preAuthReason?: string;
  };
  oauth: {
    allowDynamicClientRegistration: boolean;
    discoveryPathVariants: string[];
    tolerateExtraDiscoveryProbes: boolean;
    tolerateMissingResourceParam: boolean;
    tokenRequestLeniency: "strict" | "normal" | "lenient";
  };
  transport: {
    acceptSessionHeaderButIgnoreIt: boolean;
    preferJsonResponse: boolean;
    requireStatelessPostOnly: boolean;
  };
  hooks: {
    onAuthorizeRequest: (context: RequestContext) => SetupHookResult;
    onDiscoveryRequest: (context: RequestContext) => SetupHookResult;
    onInitialize: (clientInfo: unknown, capabilities: unknown) => void;
    onTokenRequest: (context: RequestContext) => SetupHookResult;
  };
};
