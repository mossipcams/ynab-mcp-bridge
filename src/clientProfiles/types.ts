export type ClientProfileId = "chatgpt" | "claude" | "generic";

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
  id: ClientProfileId;
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
};
