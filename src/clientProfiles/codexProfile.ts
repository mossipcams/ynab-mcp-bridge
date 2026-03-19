import { genericProfile } from "./genericProfile.js";
import type { ClientProfile } from "./types.js";

export const codexProfile: ClientProfile = {
  ...genericProfile,
  id: "codex",
  matchesInitialize: (clientInfo) => (
    typeof (clientInfo as { name?: unknown } | undefined)?.name === "string" &&
    (clientInfo as { name: string }).name.toLowerCase().includes("codex")
  ),
  oauth: {
    ...genericProfile.oauth,
    discoveryPathVariants: [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-authorization-server/sse",
      "/sse/.well-known/oauth-authorization-server",
    ],
    tolerateExtraDiscoveryProbes: true,
  },
};
