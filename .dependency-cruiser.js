/** @type {import("dependency-cruiser").IConfiguration} */
const entryLayer = "^src/index\\.ts$";
const transportLayer = "^src/((httpTransport|stdioServer)\\.ts|auth2/http/routes\\.ts)$";
const compositionLayer = "^src/serverRuntime\\.ts$";
const domainLayer = "^src/(?!index\\.ts$|httpTransport\\.ts$|stdioServer\\.ts$|serverRuntime\\.ts$|auth2/http/routes\\.ts$).+\\.ts$";

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
          "^src/(index|authAdmissionPolicy|cloudflareCompatibility|config|headerUtils|httpTransport|localTokenService|logger|originPolicy|packageInfo|requestContext|runtimeConfig|runtimePlanToolUtils|serverRuntime|startupLogging|stdioServer|transactionQueryEngine|typeUtils|ynabApi|ynabConfig|ynabRateLimiter)\\.ts$",
          "^src/clientProfiles/(?!types\\.ts$).+\\.ts$",
          "^src/auth2/(config|core|http|logging|provider|store)/.+\\.ts$",
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
        path: entryLayer,
      },
    },
    {
      name: "transport-does-not-import-entry",
      comment: "The transport layer must not depend on the entry layer.",
      severity: "error",
      from: {
        path: transportLayer,
      },
      to: {
        path: entryLayer,
      },
    },
    {
      name: "composition-does-not-import-higher-layers",
      comment: "The composition layer must not depend on transport or entry.",
      severity: "error",
      from: {
        path: compositionLayer,
      },
      to: {
        path: [entryLayer, transportLayer],
      },
    },
    {
      name: "domain-does-not-import-higher-layers",
      comment: "The domain layer must not depend on composition, transport, or entry.",
      severity: "error",
      from: {
        path: domainLayer,
        pathNot: "\\.spec\\.ts$",
      },
      to: {
        path: [entryLayer, transportLayer, compositionLayer],
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
