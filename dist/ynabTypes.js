function hasIdentifierValue(value) {
    return value.trim().length > 0;
}
export function isPlanId(value) {
    return hasIdentifierValue(value);
}
export function isAccountId(value) {
    return hasIdentifierValue(value);
}
export function isCategoryId(value) {
    return hasIdentifierValue(value);
}
export function isPayeeId(value) {
    return hasIdentifierValue(value);
}
export function isTransactionId(value) {
    return hasIdentifierValue(value);
}
export function toPlanId(value) {
    const trimmed = value?.trim();
    if (!trimmed || !isPlanId(trimmed)) {
        return undefined;
    }
    return trimmed;
}
