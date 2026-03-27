import { getStringValue, isRecord } from "../typeUtils.js";
function hasValue(value) {
    return value !== undefined && value !== null && value !== "";
}
export function proseItem(...parts) {
    return parts
        .filter(hasValue)
        .map((part) => String(part))
        .join(" ");
}
export function proseRecordItem(record, ...keys) {
    if (!isRecord(record)) {
        return "";
    }
    return proseItem(...keys.map((key) => getStringValue(record, key)));
}
export function buildProse(title, pairs, lists = []) {
    const summary = pairs
        .filter(([, value]) => hasValue(value))
        .map(([label, value]) => `${label} ${value}`)
        .join(" | ");
    const lines = [summary ? `${title}: ${summary}` : title];
    for (const list of lists) {
        if (list.items.length === 0) {
            continue;
        }
        lines.push(`${list.heading}: ${list.items.join(", ")}`);
    }
    return lines.join("\n");
}
