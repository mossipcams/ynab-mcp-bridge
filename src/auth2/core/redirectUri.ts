import type { AuthConfig } from "../config/schema.js";

type AuthClientConfig = AuthConfig["clients"][number];

export function findClientConfig(config: AuthConfig, clientId: string): AuthClientConfig {
  const client = config.clients.find((candidate) => candidate.clientId === clientId);

  if (!client) {
    throw new Error(`Unknown OAuth client_id: ${clientId}`);
  }

  return client;
}

export function assertExactRedirectUri(client: AuthClientConfig, requestedRedirectUri: string) {
  if (requestedRedirectUri !== client.redirectUri) {
    throw new Error("redirect_uri does not match the registered client redirect URI.");
  }

  return {
    clientId: client.clientId,
    match: true as const,
    registeredRedirectUri: client.redirectUri,
    requestedRedirectUri,
  };
}
