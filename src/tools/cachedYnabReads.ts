import type * as ynab from "ynab";

const cachedReadStoreSymbol = Symbol("ynabCachedReadStore");

type CachedReadStore = Map<string, Promise<unknown>>;

type ApiWithCachedReadStore = object & {
  [cachedReadStoreSymbol]?: CachedReadStore;
};

function getCachedReadStore(api: object): CachedReadStore {
  const target = api as ApiWithCachedReadStore;

  if (target[cachedReadStoreSymbol]) {
    return target[cachedReadStoreSymbol];
  }

  const store: CachedReadStore = new Map();
  Object.defineProperty(target, cachedReadStoreSymbol, {
    configurable: false,
    enumerable: false,
    value: store,
    writable: false,
  });

  return store;
}

async function getCachedRead<T>(
  api: object,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const store = getCachedReadStore(api);
  const cached = store.get(key);

  if (cached) {
    return cached as Promise<T>;
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
