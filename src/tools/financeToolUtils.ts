type CompactObjectValue = unknown;

type AccountBalanceLike = {
  balance: number;
  deleted?: boolean;
  closed?: boolean;
  on_budget?: boolean;
};

type AccountTransactionLike = {
  account_id?: string;
  amount: number;
  date: string;
  deleted?: boolean;
};

type RollupEntry = {
  id?: string | undefined;
  name: string;
  amountMilliunits: number;
  transactionCount?: number | undefined;
};

export function formatMilliunits(value: number) {
  return (value / 1000).toFixed(2);
}

export function buildAssignedSpentSummary(assignedMilliunits: number, spentMilliunits: number) {
  return {
    assigned: formatMilliunits(assignedMilliunits),
    spent: formatMilliunits(spentMilliunits),
    assigned_vs_spent: formatMilliunits(assignedMilliunits - spentMilliunits),
  };
}

export function toSpentMilliunits(activityMilliunits: number) {
  return Math.abs(activityMilliunits);
}

export function getCurrentMonthStartIsoDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export function normalizeMonthInput(month?: string) {
  return !month || month === "current" ? getCurrentMonthStartIsoDate() : month;
}

export function normalizeMonthRange(fromMonth?: string, toMonth?: string) {
  const normalizedFromMonth = normalizeMonthInput(fromMonth);
  const normalizedToMonth = normalizeMonthInput(toMonth ?? normalizedFromMonth);

  return {
    fromMonth: normalizedFromMonth,
    toMonth: normalizedToMonth,
  };
}

export function toMonthEnd(month: string) {
  const [yearValue, monthValue] = month.split("-");
  const year = Number.parseInt(yearValue ?? "", 10);
  const monthNumber = Number.parseInt(monthValue ?? "", 10);

  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
    throw new Error(`Invalid month value: ${month}`);
  }

  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

export function listMonthsInRange(fromMonth: string, toMonth: string) {
  const months: string[] = [];
  const normalizedRange = normalizeMonthRange(fromMonth, toMonth);
  const cursor = new Date(`${normalizedRange.fromMonth}T00:00:00.000Z`);
  const end = new Date(`${normalizedRange.toMonth}T00:00:00.000Z`);

  while (cursor <= end) {
    months.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

export function buildAllocationBreakdown(amountMilliunits: number, totalMilliunits: number, targetPercent: number) {
  const actualPercent = totalMilliunits === 0 ? 0 : (amountMilliunits / totalMilliunits) * 100;

  return {
    amount: formatMilliunits(amountMilliunits),
    actual_percent: actualPercent.toFixed(2),
    target_percent: targetPercent.toFixed(2),
    variance_percent: (actualPercent - targetPercent).toFixed(2),
  };
}

export function buildUpcomingWindowSummary(inflowMilliunits: number, outflowMilliunits: number) {
  const normalizedOutflow = Math.abs(outflowMilliunits);

  return {
    upcoming_inflows: formatMilliunits(inflowMilliunits),
    upcoming_outflows: formatMilliunits(normalizedOutflow),
    net_upcoming: formatMilliunits(inflowMilliunits - normalizedOutflow),
  };
}

export function isWithinMonthRange(date: string, fromMonth: string, toMonth: string) {
  return date >= fromMonth && date <= toMonthEnd(toMonth);
}

export function liquidCashMilliunits(accounts: AccountBalanceLike[]) {
  return accounts
    .filter((account) => !account.deleted && account.on_budget && account.balance > 0)
    .reduce((sum, account) => sum + account.balance, 0);
}

export function debtMilliunits(accounts: AccountBalanceLike[]) {
  return accounts
    .filter((account) => !account.deleted && account.balance < 0)
    .reduce((sum, account) => sum + Math.abs(account.balance), 0);
}

export function netWorthMilliunits(accounts: AccountBalanceLike[]) {
  return accounts
    .filter((account) => !account.deleted)
    .reduce((sum, account) => sum + account.balance, 0);
}

export function reconstructHistoricalAccountBalances<
  TAccount extends AccountBalanceLike & { id: string },
  TTransaction extends AccountTransactionLike,
>(
  accounts: TAccount[],
  transactions: TTransaction[],
  months: string[],
) {
  const balances = new Map(accounts
    .filter((account) => !account.deleted)
    .map((account) => [account.id, account.balance] as const));
  const snapshots = new Map<string, TAccount[]>();
  const transactionsDescending = transactions
    .filter((transaction) => !transaction.deleted && typeof transaction.account_id === "string" && balances.has(transaction.account_id))
    .slice()
    .sort((left, right) => right.date.localeCompare(left.date));

  let transactionIndex = 0;
  const sortedMonths = months.slice().sort((left, right) => right.localeCompare(left));

  for (const month of sortedMonths) {
    const monthEnd = toMonthEnd(month);

    while (transactionIndex < transactionsDescending.length) {
      const transaction = transactionsDescending[transactionIndex];
      if (!transaction || transaction.date <= monthEnd) {
        break;
      }

      const accountId = transaction.account_id;
      if (!accountId) {
        transactionIndex += 1;
        continue;
      }

      const currentBalance = balances.get(accountId);

      if (typeof currentBalance === "number") {
        balances.set(accountId, currentBalance - transaction.amount);
      }

      transactionIndex += 1;
    }

    snapshots.set(
      month,
      accounts
        .filter((account) => !account.deleted)
        .map((account) => ({
          ...account,
          balance: balances.get(account.id) ?? account.balance,
        })),
    );
  }

  return snapshots;
}

export function compactObject(input: Record<string, CompactObjectValue>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === undefined || value === null) {
        return false;
      }

      if (Array.isArray(value) && value.length === 0) {
        return false;
      }

      return true;
    }),
  );
}

export function toTopRollups(entries: RollupEntry[], limit: number) {
  return entries
    .slice()
    .sort((left, right) => {
      const amountDifference = Math.abs(right.amountMilliunits) - Math.abs(left.amountMilliunits);
      if (amountDifference !== 0) {
        return amountDifference;
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, limit)
    .map((entry) => compactObject({
      id: entry.id,
      name: entry.name,
      amount: formatMilliunits(entry.amountMilliunits),
      transaction_count: entry.transactionCount,
    }));
}
