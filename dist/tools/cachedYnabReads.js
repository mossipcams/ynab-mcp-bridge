const cachedReadStoreSymbol = Symbol("ynabCachedReadStore");
function getCachedReadStore(api) {
    const target = api;
    if (target[cachedReadStoreSymbol]) {
        return target[cachedReadStoreSymbol];
    }
    const store = new Map();
    Object.defineProperty(target, cachedReadStoreSymbol, {
        configurable: false,
        enumerable: false,
        value: store,
        writable: false,
    });
    return store;
}
async function getCachedRead(api, key, load) {
    const store = getCachedReadStore(api);
    const cached = store.get(key);
    if (cached) {
        return cached;
    }
    const pendingRead = load().catch((error) => {
        store.delete(key);
        throw error;
    });
    store.set(key, pendingRead);
    return await pendingRead;
}
export async function getCachedAccounts(api, planId) {
    return await getCachedRead(api, `accounts:${planId}`, async () => await api.accounts.getAccounts(planId));
}
export async function getCachedCategories(api, planId) {
    return await getCachedRead(api, `categories:${planId}`, async () => await api.categories.getCategories(planId));
}
export async function getCachedPlanMonth(api, planId, month) {
    return await getCachedRead(api, `plan-month:${planId}:${month}`, async () => await api.months.getPlanMonth(planId, month));
}
export async function getCachedPlanMonths(api, planId) {
    return await getCachedRead(api, `plan-months:${planId}`, async () => await api.months.getPlanMonths(planId));
}
export async function getCachedScheduledTransactions(api, planId) {
    return await getCachedRead(api, `scheduled-transactions:${planId}`, async () => await api.scheduledTransactions.getScheduledTransactions(planId, undefined));
}
