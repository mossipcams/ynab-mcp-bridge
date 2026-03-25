import { compactObject, formatMilliunits } from "./financeToolUtils.js";

type YnabAccountLike = {
  deleted?: boolean;
  closed?: boolean;
  on_budget?: boolean;
  balance: number;
  id?: string;
  name?: string;
  type?: string;
};

type YnabMonthLike = {
  month: string;
  income?: number;
  activity?: number;
  deleted?: boolean;
};

function activeAccounts<T extends YnabAccountLike>(accounts: T[]) {
  return accounts.filter((account) => !account.deleted && !account.closed);
}

export function liquidCashMilliunits(accounts: YnabAccountLike[]) {
  return activeAccounts(accounts)
    .filter((account) => account.on_budget && account.balance > 0)
    .reduce((sum, account) => sum + account.balance, 0);
}

export function totalDebtMilliunits(accounts: YnabAccountLike[]) {
  return activeAccounts(accounts)
    .filter((account) => account.balance < 0)
    .reduce((sum, account) => sum + Math.abs(account.balance), 0);
}

export function netWorthMilliunits(accounts: YnabAccountLike[]) {
  return activeAccounts(accounts).reduce((sum, account) => sum + account.balance, 0);
}

export function recentMonths<T extends YnabMonthLike>(months: T[], asOfMonth: string, monthsBack: number) {
  if (monthsBack <= 0) {
    return [];
  }

  return months
    .filter((month) => !month.deleted && month.month <= asOfMonth)
    .sort((left, right) => right.month.localeCompare(left.month))
    .slice(0, monthsBack);
}

export function averageMonthlySpendingMilliunits(months: YnabMonthLike[]) {
  if (months.length === 0) {
    return 0;
  }

  return Math.round(
    months.reduce((sum, month) => sum + Math.abs(month.activity ?? 0), 0) / months.length,
  );
}

export function averageDailyOutflowMilliunits(months: YnabMonthLike[]) {
  const monthlyAverage = averageMonthlySpendingMilliunits(months);
  return Math.round(monthlyAverage / 30);
}

export function spreadPercent(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  const average = total / values.length;

  if (average === 0) {
    return 0;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  return ((max - min) / average) * 100;
}

export function formatPercent(value: number) {
  return value.toFixed(2);
}

export function formatRatio(value: number) {
  return value.toFixed(2);
}

export function daysUntil(asOfDate: string, dueDate: string) {
  const start = new Date(`${asOfDate}T00:00:00.000Z`);
  const end = new Date(`${dueDate}T00:00:00.000Z`);
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

export function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function formatAmount(value: number) {
  return formatMilliunits(value);
}

export function compactRisk(code: string, severity: "high" | "medium" | "low") {
  return compactObject({ code, severity });
}


export function previousMonths(latestMonth: string, count: number) {
  const months: string[] = [];
  const cursor = new Date(`${latestMonth}T00:00:00.000Z`);
  cursor.setUTCMonth(cursor.getUTCMonth() - count);

  while (cursor.toISOString().slice(0, 10) < latestMonth) {
    months.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}
