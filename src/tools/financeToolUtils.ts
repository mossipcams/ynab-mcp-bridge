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

type BudgetHealthMonthCategoryLike = {
  id: string;
  name: string;
  balance: number;
  deleted?: boolean;
  hidden?: boolean;
  goal_under_funded?: number | null;
  category_group_name?: string;
};

type BudgetHealthMonthLike = {
  budgeted: number;
  activity: number;
  to_be_budgeted: number;
  categories: BudgetHealthMonthCategoryLike[];
};

type ScheduledFrequency =
  | "never"
  | "daily"
  | "weekly"
  | "everyOtherWeek"
  | "twiceAMonth"
  | "every4Weeks"
  | "monthly"
  | "everyOtherMonth"
  | "every3Months"
  | "every4Months"
  | "twiceAYear"
  | "yearly"
  | "everyOtherYear";

type ScheduledTransactionLike = {
  id: string;
  date_next: string;
  amount: number;
  frequency?: ScheduledFrequency | null;
  transfer_account_id?: string | null;
};

type ExpandedScheduledOccurrence<T extends ScheduledTransactionLike> = T & {
  occurrence_date: string;
  days_until_due: number;
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

function sortDescendingByAmount<T extends { amountMilliunits: number; name: string }>(entries: T[]) {
  return entries
    .slice()
    .sort((left, right) => {
      const difference = right.amountMilliunits - left.amountMilliunits;
      if (difference !== 0) {
        return difference;
      }

      return left.name.localeCompare(right.name);
    });
}

export function toSpentMilliunits(activityMilliunits: number) {
  return activityMilliunits < 0 ? Math.abs(activityMilliunits) : 0;
}

export function buildBudgetHealthMonthSummary(monthDetail: BudgetHealthMonthLike) {
  const categories = monthDetail.categories.filter((category) => !category.deleted && !category.hidden);
  const overspentCategories = sortDescendingByAmount(
    categories
      .filter((category) => category.balance < 0)
      .map((category) => ({
        id: category.id,
        name: category.name,
        categoryGroupName: category.category_group_name,
        amountMilliunits: Math.abs(category.balance),
      })),
  );
  const underfundedCategories = sortDescendingByAmount(
    categories
      .filter((category) => (category.goal_under_funded ?? 0) > 0)
      .map((category) => ({
        id: category.id,
        name: category.name,
        categoryGroupName: category.category_group_name,
        amountMilliunits: category.goal_under_funded ?? 0,
      })),
  );

  return {
    ready_to_assign: formatMilliunits(monthDetail.to_be_budgeted),
    available_total: formatMilliunits(
      categories
        .filter((category) => category.balance > 0)
        .reduce((sum, category) => sum + category.balance, 0),
    ),
    overspent_total: formatMilliunits(
      overspentCategories.reduce((sum, category) => sum + category.amountMilliunits, 0),
    ),
    underfunded_total: formatMilliunits(
      underfundedCategories.reduce((sum, category) => sum + category.amountMilliunits, 0),
    ),
    ...buildAssignedSpentSummary(monthDetail.budgeted, toSpentMilliunits(monthDetail.activity)),
    overspent_category_count: overspentCategories.length,
    underfunded_category_count: underfundedCategories.length,
    overspent_categories: overspentCategories,
    underfunded_categories: underfundedCategories,
  };
}

export function isCreditCardPaymentCategoryName(categoryGroupName?: string) {
  return typeof categoryGroupName === "string"
    && categoryGroupName.trim().toLowerCase() === "credit card payments";
}

export function isReadyToAssignInflowCategory(categoryName?: string | null) {
  return categoryName === "Inflow: Ready to Assign";
}

export function isTransferTransaction(transaction: { transfer_account_id?: string | null }) {
  return !!transaction.transfer_account_id;
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function incrementScheduledDate(date: Date, frequency?: ScheduledFrequency | null) {
  switch (frequency ?? "never") {
    case "never":
      return null;
    case "daily":
      return addDays(date, 1);
    case "weekly":
      return addDays(date, 7);
    case "everyOtherWeek":
      return addDays(date, 14);
    case "twiceAMonth":
      return addDays(date, 15);
    case "every4Weeks":
      return addDays(date, 28);
    case "monthly":
      return addMonths(date, 1);
    case "everyOtherMonth":
      return addMonths(date, 2);
    case "every3Months":
      return addMonths(date, 3);
    case "every4Months":
      return addMonths(date, 4);
    case "twiceAYear":
      return addMonths(date, 6);
    case "yearly":
      return addMonths(date, 12);
    case "everyOtherYear":
      return addMonths(date, 24);
  }
}

export function expandScheduledOccurrences<T extends ScheduledTransactionLike>(
  transactions: T[],
  asOfDate: string,
  windowDays: number,
) {
  const windowEnd = addDays(new Date(`${asOfDate}T00:00:00.000Z`), windowDays);

  return transactions.flatMap((transaction) => {
    if (isTransferTransaction(transaction)) {
      return [];
    }

    const occurrences: ExpandedScheduledOccurrence<T>[] = [];
    let cursor: Date | null = new Date(`${transaction.date_next}T00:00:00.000Z`);

    while (cursor && cursor <= windowEnd) {
      const occurrenceDate = toIsoDate(cursor);
      if (occurrenceDate >= asOfDate) {
        occurrences.push({
          ...transaction,
          occurrence_date: occurrenceDate,
          days_until_due: Math.floor((cursor.getTime() - new Date(`${asOfDate}T00:00:00.000Z`).getTime()) / 86_400_000),
        });
      }

      cursor = incrementScheduledDate(cursor, transaction.frequency ?? undefined);
    }

    return occurrences;
  });
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

export function isWithinMonthRange(date: string, fromMonth: string, toMonth: string) {
  return date >= fromMonth && date <= toMonthEnd(toMonth);
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
