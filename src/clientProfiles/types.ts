import type { ReadonlyArrayOf, ReadonlyObject, ReadonlyRecord } from "../typeUtils.js";

export type ClientProfileId = "chatgpt" | "claude" | "codex" | "generic";

export type SetupHookResult = "handle" | "pass";

export type DetectedClientProfile = ReadonlyObject<{
  profileId: ClientProfileId;
  reason: string;
}>;

export type RequestContext = ReadonlyObject<{
  headers: ReadonlyRecord<string, string | ReadonlyArrayOf<string> | undefined>;
  method: string;
  path: string;
}>;

export type ClientProfile = {
  detectPreAuth?: (context: RequestContext) => DetectedClientProfile | undefined;
  id: ClientProfileId;
  matchesPreAuth: (context: RequestContext) => boolean;
  matchesInitialize: (clientInfo: unknown, capabilities: unknown) => boolean;
  detection?: ReadonlyObject<{
    initializeReason?: string;
    preAuthReason?: string;
  }>;
  oauth: ReadonlyObject<{
    allowDynamicClientRegistration: boolean;
    discoveryPathVariants: ReadonlyArrayOf<string>;
    tolerateExtraDiscoveryProbes: boolean;
    tolerateMissingResourceParam: boolean;
    tokenRequestLeniency: "strict" | "normal" | "lenient";
  }>;
  transport: ReadonlyObject<{
    acceptSessionHeaderButIgnoreIt: boolean;
    preferJsonResponse: boolean;
    requireStatelessPostOnly: boolean;
  }>;
  hooks: ReadonlyObject<{
    onAuthorizeRequest: (context: RequestContext) => SetupHookResult;
    onDiscoveryRequest: (context: RequestContext) => SetupHookResult;
    onInitialize: (clientInfo: unknown, capabilities: unknown) => void;
    onTokenRequest: (context: RequestContext) => SetupHookResult;
  }>;
};
