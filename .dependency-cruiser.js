/** @type {import("dependency-cruiser").IConfiguration} */
const config = {
  // Layers: entry, transport, composition, domain.
  // Selectors are expressed with dependency-cruiser from.path and to.path matchers.
  forbidden: [
    {
      name: "no-circular",
      comment: "Production modules should not participate in circular dependencies.",
      severity: "error",
      from: {
        path: "^src/",
        pathNot: "\\.spec\\.ts$",
      },
      to: {
        circular: true,
      },
    },
    {
      name: "no-orphans",
      comment:
        "Runtime and tool modules should stay connected to the production entry graph.",
      severity: "error",
      from: {
        orphan: true,
        path: [
          "^src/(index|httpServer|stdioServer|server|cloudflareCompatibility|config|localTokenService|logger|mcpAuthServer|oauthBroker|oauthCore|oauthGrant|oauthStore|oauthVerifier|originPolicy|packageInfo|runtimeConfig|startupLogging|upstreamOAuthAdapter|ynabApi|ynabRateLimiter)\\.ts$",
          "^src/clientProfiles/(?!types\\.ts$).+\\.ts$",
          "^src/tools/.+\\.ts$",
        ],
      },
      to: {},
    },
    {
      name: "no-imports-to-entry",
      comment: "Only the CLI entry layer should own src/index.ts.",
      severity: "error",
      from: {
        path: "^src/",
        pathNot: "\\.spec\\.ts$",
      },
      to: {
        path: "^src/index\\.ts$",
      },
    },
    {
      name: "transport-does-not-import-entry",
      comment: "The transport layer must not depend on the entry layer.",
      severity: "error",
      from: {
        path: "^src/(httpServer|stdioServer)\\.ts$",
      },
      to: {
        path: "^src/index\\.ts$",
      },
    },
    {
      name: "composition-does-not-import-higher-layers",
      comment: "The composition layer must not depend on transport or entry.",
      severity: "error",
      from: {
        path: "^src/server\\.ts$",
      },
      to: {
        path: "^src/(index|httpServer|stdioServer)\\.ts$",
      },
    },
    {
      name: "domain-does-not-import-higher-layers",
      comment: "The domain layer must not depend on composition, transport, or entry.",
      severity: "error",
      from: {
        path: "^src/(?!index\\.ts$|httpServer\\.ts$|stdioServer\\.ts$|server\\.ts$).+\\.ts$",
        pathNot: "\\.spec\\.ts$",
      },
      to: {
        path: "^src/(index|httpServer|stdioServer|server)\\.ts$",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      path: "(^dist/)|(^src/.*\\.spec\\.ts$)",
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};

export default config;
