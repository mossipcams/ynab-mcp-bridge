export function isRecord(value) {
    return typeof value === "object" && value !== null;
}
export function getRecordValue(record, key) {
    return record[key];
}
export function getStringValue(record, key) {
    const value = getRecordValue(record, key);
    return typeof value === "string" ? value : undefined;
}
export function getNumberValue(record, key) {
    const value = getRecordValue(record, key);
    return typeof value === "number" ? value : undefined;
}
export function getBooleanValue(record, key) {
    const value = getRecordValue(record, key);
    return typeof value === "boolean" ? value : undefined;
}
export function getArrayValue(record, key) {
    const value = getRecordValue(record, key);
    return Array.isArray(value) ? value : undefined;
}
export function getRecordValueIfObject(record, key) {
    const value = getRecordValue(record, key);
    return isRecord(value) ? value : undefined;
}
