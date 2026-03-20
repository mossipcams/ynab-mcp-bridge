type CompactObjectValue = unknown;

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

export function listMonthsInRange(fromMonth: string, toMonth: string) {
  const months: string[] = [];
  const cursor = new Date(`${fromMonth}T00:00:00.000Z`);
  const end = new Date(`${toMonth}T00:00:00.000Z`);

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
