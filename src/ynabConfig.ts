export type YnabConfig = {
  apiToken: string;
  planId?: string | undefined;
};

type EnvConfig = Record<string, string | undefined>;

type BackendReadiness = {
  checks: {
    ynabApiToken: boolean;
    ynabPlanIdConfigured: boolean;
  };
  planResolution: "configured" | "dynamic";
  status: "ok" | "misconfigured";
};

function readOptionalValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function hasValue(value: string | undefined) {
  return readOptionalValue(value) !== undefined;
}

function getBackendReadiness(env: EnvConfig): BackendReadiness {
  const ynabApiToken = hasValue(env["YNAB_API_TOKEN"]);
  const ynabPlanIdConfigured = hasValue(env["YNAB_PLAN_ID"]);

  return {
    status: ynabApiToken ? "ok" : "misconfigured",
    planResolution: ynabPlanIdConfigured ? "configured" : "dynamic",
    checks: {
      ynabApiToken,
      ynabPlanIdConfigured,
    },
  };
}

export function assertBackendEnvironment(env: EnvConfig) {
  const readiness = getBackendReadiness(env);

  if (!readiness.checks.ynabApiToken) {
    throw new Error("YNAB_API_TOKEN is required.");
  }

  return readiness;
}

export function readYnabConfig(env: EnvConfig): YnabConfig {
  return {
    apiToken: readOptionalValue(env["YNAB_API_TOKEN"]) ?? "",
    ...(readOptionalValue(env["YNAB_PLAN_ID"]) ? { planId: readOptionalValue(env["YNAB_PLAN_ID"]) } : {}),
  };
}

export function assertYnabConfig(config: YnabConfig | undefined): YnabConfig {
  const apiToken = readOptionalValue(config?.apiToken);

  if (!apiToken) {
    throw new Error("YNAB config is required.");
  }

  return {
    apiToken,
    ...(readOptionalValue(config?.planId) ? { planId: readOptionalValue(config?.planId) } : {}),
  };
}
