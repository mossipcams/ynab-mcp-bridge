import * as ynab from "ynab";
export function createYnabApi(token = process.env.YNAB_API_TOKEN || "") {
    const api = new ynab.API(token);
    if (!("moneyMovements" in api)) {
        Object.defineProperty(api, "moneyMovements", {
            configurable: true,
            enumerable: false,
            value: new ynab.MoneyMovementsApi(api._configuration),
        });
    }
    return api;
}
