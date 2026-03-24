import { compactObject, formatMilliunits } from "./financeToolUtils.js";
const DEFAULT_LIMIT = 50;
export function formatAmountMilliunits(value) {
    return formatMilliunits(value);
}
export function projectRecord(entry, allFields, options = {}) {
    const requestedFields = options.fields?.length ? options.fields : allFields;
    const projected = Object.fromEntries(requestedFields
        .filter((field) => field in entry)
        .map((field) => [field, entry[field]]));
    if (options.includeIds !== false && entry["id"] !== undefined) {
        projected["id"] = entry["id"];
    }
    return compactObject(projected);
}
export function paginateEntries(entries, options = {}) {
    const offset = Math.max(options.offset ?? 0, 0);
    const limit = Math.max(options.limit ?? DEFAULT_LIMIT, 1);
    const pagedEntries = entries.slice(offset, offset + limit);
    const nextOffset = offset + pagedEntries.length;
    return {
        entries: pagedEntries,
        metadata: compactObject({
            returned_count: pagedEntries.length,
            offset,
            limit,
            has_more: nextOffset < entries.length,
            next_offset: nextOffset < entries.length ? nextOffset : undefined,
        }),
    };
}
export function hasPaginationControls(input) {
    return input.limit !== undefined
        || input.offset !== undefined;
}
export function hasProjectionControls(input) {
    return input.includeIds !== undefined
        || input.fields !== undefined;
}
