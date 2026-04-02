import type * as ynab from "ynab";

const cachedReadStoreSymbol = Symbol("ynabCachedReadStore");

type CachedReadStore = Map<string, Promise<unknown>>;

type ApiWithCachedReadStore = object & {
  [cachedReadStoreSymbol]?: CachedReadStore;
};

function getCachedReadStore(api: ApiWithCachedReadStore): CachedReadStore {
  if (api[cachedReadStoreSymbol]) {
    return api[cachedReadStoreSymbol];
  }

  const store: CachedReadStore = new Map();
  Object.defineProperty(api, cachedReadStoreSymbol, {
    configurable: false,
    enumerable: false,
    value: store,
    writable: false,
  });

  return store;
}

function hasCachedRead<T>(value: Promise<unknown> | undefined): value is Promise<T> {
  return value !== undefined;
}

async function getCachedRead<T>(
  api: ApiWithCachedReadStore,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const store = getCachedReadStore(api);
  const cached = store.get(key);

  if (hasCachedRead<T>(cached)) {
    return await cached;
  }

  const pendingRead = load().catch((error: unknown) => {
    store.delete(key);
    throw error;
  });

  store.set(key, pendingRead);

  return await pendingRead;
}

export async function getCachedAccounts(api: ynab.API, planId: string) {
  return await getCachedRead(api, `accounts:${planId}`, async () => await api.accounts.getAccounts(planId));
}

export async function getCachedCategories(api: ynab.API, planId: string) {
  return await getCachedRead(api, `categories:${planId}`, async () => await api.categories.getCategories(planId));
}

export async function getCachedPlanMonth(api: ynab.API, planId: string, month: string) {
  return await getCachedRead(api, `plan-month:${planId}:${month}`, async () => await api.months.getPlanMonth(planId, month));
}

export async function getCachedPlanMonths(api: ynab.API, planId: string) {
  return await getCachedRead(api, `plan-months:${planId}`, async () => await api.months.getPlanMonths(planId));
}

export async function getCachedScheduledTransactions(api: ynab.API, planId: string) {
  return await getCachedRead(
    api,
    `scheduled-transactions:${planId}`,
    async () => await api.scheduledTransactions.getScheduledTransactions(planId, undefined),
  );
}
