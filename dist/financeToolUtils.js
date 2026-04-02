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
function sortDescendingByAmount(entries) {
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
export function toSpentMilliunits(activityMilliunits) {
    return activityMilliunits < 0 ? Math.abs(activityMilliunits) : 0;
}
export function buildBudgetHealthMonthSummary(monthDetail) {
    const categories = monthDetail.categories.filter((category) => !category.deleted && !category.hidden);
    const overspentCategories = sortDescendingByAmount(categories
        .filter((category) => category.balance < 0)
        .map((category) => ({
        id: category.id,
        name: category.name,
        categoryGroupName: category.category_group_name,
        amountMilliunits: Math.abs(category.balance),
    })));
    const underfundedCategories = sortDescendingByAmount(categories
        .filter((category) => (category.goal_under_funded ?? 0) > 0)
        .map((category) => ({
        id: category.id,
        name: category.name,
        categoryGroupName: category.category_group_name,
        amountMilliunits: category.goal_under_funded ?? 0,
    })));
    return {
        ready_to_assign: formatMilliunits(monthDetail.to_be_budgeted),
        available_total: formatMilliunits(categories
            .filter((category) => category.balance > 0)
            .reduce((sum, category) => sum + category.balance, 0)),
        overspent_total: formatMilliunits(overspentCategories.reduce((sum, category) => sum + category.amountMilliunits, 0)),
        underfunded_total: formatMilliunits(underfundedCategories.reduce((sum, category) => sum + category.amountMilliunits, 0)),
        ...buildAssignedSpentSummary(monthDetail.budgeted, toSpentMilliunits(monthDetail.activity)),
        overspent_category_count: overspentCategories.length,
        underfunded_category_count: underfundedCategories.length,
        overspent_categories: overspentCategories,
        underfunded_categories: underfundedCategories,
    };
}
export function buildVisibleCategoryHealthSummary(categories) {
    const summary = {
        overspentCategories: [],
        underfundedCategories: [],
        availableTotalMilliunits: 0,
    };
    for (const category of categories) {
        if (category.deleted || category.hidden) {
            continue;
        }
        if (category.balance > 0) {
            summary.availableTotalMilliunits += category.balance;
        }
        if (category.balance < 0) {
            summary.overspentCategories.push(category);
        }
        if ((category.goal_under_funded ?? 0) > 0) {
            summary.underfundedCategories.push(category);
        }
    }
    return summary;
}
export function buildCleanupTransactionSummary(transactions) {
    const summary = {
        uncategorizedTransactions: [],
        unapprovedTransactions: [],
        unclearedTransactions: [],
    };
    for (const transaction of transactions) {
        if (!transaction.category_id) {
            summary.uncategorizedTransactions.push(transaction);
        }
        if (!transaction.approved) {
            summary.unapprovedTransactions.push(transaction);
        }
        if (transaction.cleared === "uncleared") {
            summary.unclearedTransactions.push(transaction);
        }
    }
    return summary;
}
export function buildAccountSnapshotSummary(accounts) {
    const summary = {
        activeAccounts: [],
        positiveAccounts: [],
        negativeAccounts: [],
        netWorthMilliunits: 0,
        liquidCashMilliunits: 0,
        onBudgetAccountCount: 0,
    };
    for (const account of accounts) {
        if (account.deleted || account.closed) {
            continue;
        }
        addAccountToSnapshotSummary(summary, account);
    }
    return summary;
}
function addAccountToSnapshotSummary(summary, account) {
    summary.activeAccounts.push(account);
    summary.netWorthMilliunits += account.balance;
    if (account.on_budget) {
        summary.onBudgetAccountCount += 1;
        if (account.balance > 0) {
            summary.liquidCashMilliunits += account.balance;
        }
    }
    if (account.balance > 0) {
        summary.positiveAccounts.push(account);
    }
    else if (account.balance < 0) {
        summary.negativeAccounts.push(account);
    }
}
export function buildCategorySpentLookup(responses) {
    return responses.map((response) => new Map(response.data.month.categories.map((category) => [category.id, toSpentMilliunits(category.activity)])));
}
export function buildSpendingAnomalies(options) {
    const { baselineSpentLookups, categories, formatAmount, formatPercent, minimumDifference, thresholdMultiplier, topN, } = options;
    return categories
        .map((category) => {
        const latestSpent = toSpentMilliunits(category.activity);
        const baselineValues = baselineSpentLookups.map((lookup) => lookup.get(category.id) ?? 0);
        const baselineAverage = baselineValues.length === 0
            ? 0
            : baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length;
        if (baselineAverage <= 0
            || latestSpent < baselineAverage * thresholdMultiplier
            || latestSpent - baselineAverage < minimumDifference) {
            return undefined;
        }
        return {
            category_id: category.id,
            category_name: category.name,
            latest_spent: formatAmount(latestSpent),
            baseline_average: formatAmount(Math.round(baselineAverage)),
            change_percent: formatPercent(((latestSpent - baselineAverage) / baselineAverage) * 100),
            sort_difference: latestSpent - baselineAverage,
        };
    })
        .filter((anomaly) => !!anomaly)
        .sort((left, right) => right.sort_difference - left.sort_difference)
        .slice(0, topN)
        .map(({ sort_difference: _sortDifference, ...anomaly }) => anomaly);
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
function buildActiveAccountBalances(accounts) {
    return new Map(accounts
        .filter((account) => !account.deleted)
        .map((account) => [account.id, account.balance]));
}
function buildDescendingTrackedTransactions(transactions, balances) {
    return transactions
        .filter((transaction) => !transaction.deleted && typeof transaction.account_id === "string" && balances.has(transaction.account_id))
        .slice()
        .sort((left, right) => right.date.localeCompare(left.date));
}
function applyTransactionsAfterMonthEnd(balances, transactionsDescending, monthEnd, transactionIndex) {
    let nextTransactionIndex = transactionIndex;
    while (nextTransactionIndex < transactionsDescending.length) {
        const transaction = transactionsDescending[nextTransactionIndex];
        if (!transaction || transaction.date <= monthEnd) {
            break;
        }
        const accountId = transaction.account_id;
        if (!accountId) {
            nextTransactionIndex += 1;
            continue;
        }
        const currentBalance = balances.get(accountId);
        if (typeof currentBalance === "number") {
            balances.set(accountId, currentBalance - transaction.amount);
        }
        nextTransactionIndex += 1;
    }
    return nextTransactionIndex;
}
function buildHistoricalSnapshot(accounts, balances) {
    return accounts
        .filter((account) => !account.deleted)
        .map((account) => ({
        ...account,
        balance: balances.get(account.id) ?? account.balance,
    }));
}
export function reconstructHistoricalAccountBalances(accounts, transactions, months) {
    const balances = buildActiveAccountBalances(accounts);
    const snapshots = new Map();
    const transactionsDescending = buildDescendingTrackedTransactions(transactions, balances);
    let transactionIndex = 0;
    const sortedMonths = months.slice().sort((left, right) => right.localeCompare(left));
    for (const month of sortedMonths) {
        const monthEnd = toMonthEnd(month);
        transactionIndex = applyTransactionsAfterMonthEnd(balances, transactionsDescending, monthEnd, transactionIndex);
        snapshots.set(month, buildHistoricalSnapshot(accounts, balances));
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
