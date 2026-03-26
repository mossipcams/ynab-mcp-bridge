type CompactObjectValue = unknown;

type RollupEntry = {
  id?: string;
  name: string;
  amountMilliunits: number;
  transactionCount?: number;
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
  const [year, monthNumber] = month.split("-").map((value) => Number.parseInt(value, 10));
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

export function compactObject<T extends Record<string, CompactObjectValue>>(input: T) {
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
  ) as {
    [K in keyof T as T[K] extends undefined | null ? never : K]: Exclude<T[K], undefined | null>;
  };
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
