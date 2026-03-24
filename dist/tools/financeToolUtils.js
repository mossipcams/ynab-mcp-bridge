export function formatMilliunits(value) {
    return (value / 1000).toFixed(2);
}
export function buildAssignedSpentSummary(assignedMilliunits, spentMilliunits) {
    return {
        assigned: formatMilliunits(assignedMilliunits),
        spent: formatMilliunits(spentMilliunits),
        assigned_vs_spent: formatMilliunits(assignedMilliunits - spentMilliunits),
    };
}
export function toSpentMilliunits(activityMilliunits) {
    return activityMilliunits < 0 ? Math.abs(activityMilliunits) : 0;
}
export function isCreditCardPaymentCategoryName(categoryGroupName) {
    return typeof categoryGroupName === "string"
        && categoryGroupName.trim().toLowerCase() === "credit card payments";
}
export function isReadyToAssignInflowCategory(categoryName) {
    return categoryName === "Inflow: Ready to Assign";
}
export function isTransferTransaction(transaction) {
    return !!transaction.transfer_account_id;
}
function addDays(date, days) {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}
function addMonths(date, months) {
    const next = new Date(date.getTime());
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
}
function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
}
function incrementScheduledDate(date, frequency) {
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
export function expandScheduledOccurrences(transactions, asOfDate, windowDays) {
    const windowEnd = addDays(new Date(`${asOfDate}T00:00:00.000Z`), windowDays);
    return transactions.flatMap((transaction) => {
        if (isTransferTransaction(transaction)) {
            return [];
        }
        const occurrences = [];
        let cursor = new Date(`${transaction.date_next}T00:00:00.000Z`);
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
export function normalizeMonthInput(month) {
    return !month || month === "current" ? getCurrentMonthStartIsoDate() : month;
}
export function normalizeMonthRange(fromMonth, toMonth) {
    const normalizedFromMonth = normalizeMonthInput(fromMonth);
    const normalizedToMonth = normalizeMonthInput(toMonth ?? normalizedFromMonth);
    return {
        fromMonth: normalizedFromMonth,
        toMonth: normalizedToMonth,
    };
}
export function toMonthEnd(month) {
    const [yearValue, monthValue] = month.split("-");
    const year = Number.parseInt(yearValue ?? "", 10);
    const monthNumber = Number.parseInt(monthValue ?? "", 10);
    if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) {
        throw new Error(`Invalid month value: ${month}`);
    }
    return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}
export function isWithinMonthRange(date, fromMonth, toMonth) {
    return date >= fromMonth && date <= toMonthEnd(toMonth);
}
export function listMonthsInRange(fromMonth, toMonth) {
    const months = [];
    const normalizedRange = normalizeMonthRange(fromMonth, toMonth);
    const cursor = new Date(`${normalizedRange.fromMonth}T00:00:00.000Z`);
    const end = new Date(`${normalizedRange.toMonth}T00:00:00.000Z`);
    while (cursor <= end) {
        months.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return months;
}
export function buildAllocationBreakdown(amountMilliunits, totalMilliunits, targetPercent) {
    const actualPercent = totalMilliunits === 0 ? 0 : (amountMilliunits / totalMilliunits) * 100;
    return {
        amount: formatMilliunits(amountMilliunits),
        actual_percent: actualPercent.toFixed(2),
        target_percent: targetPercent.toFixed(2),
        variance_percent: (actualPercent - targetPercent).toFixed(2),
    };
}
export function buildUpcomingWindowSummary(inflowMilliunits, outflowMilliunits) {
    const normalizedOutflow = Math.abs(outflowMilliunits);
    return {
        upcoming_inflows: formatMilliunits(inflowMilliunits),
        upcoming_outflows: formatMilliunits(normalizedOutflow),
        net_upcoming: formatMilliunits(inflowMilliunits - normalizedOutflow),
    };
}
export function liquidCashMilliunits(accounts) {
    return accounts
        .filter((account) => !account.deleted && account.on_budget && account.balance > 0)
        .reduce((sum, account) => sum + account.balance, 0);
}
export function debtMilliunits(accounts) {
    return accounts
        .filter((account) => !account.deleted && account.balance < 0)
        .reduce((sum, account) => sum + Math.abs(account.balance), 0);
}
export function netWorthMilliunits(accounts) {
    return accounts
        .filter((account) => !account.deleted)
        .reduce((sum, account) => sum + account.balance, 0);
}
export function reconstructHistoricalAccountBalances(accounts, transactions, months) {
    const balances = new Map(accounts
        .filter((account) => !account.deleted)
        .map((account) => [account.id, account.balance]));
    const snapshots = new Map();
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
        snapshots.set(month, accounts
            .filter((account) => !account.deleted)
            .map((account) => ({
            ...account,
            balance: balances.get(account.id) ?? account.balance,
        })));
    }
    return snapshots;
}
export function compactObject(input) {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => {
        if (value === undefined || value === null) {
            return false;
        }
        if (Array.isArray(value) && value.length === 0) {
            return false;
        }
        return true;
    }));
}
export function toTopRollups(entries, limit) {
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
