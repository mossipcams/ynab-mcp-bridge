import { compactObject, formatMilliunits } from "./financeToolUtils.js";

type ProjectionOptions<FieldName extends string> = {
  fields?: readonly FieldName[];
  includeIds?: boolean;
};

type PaginationOptions = {
  limit?: number;
  offset?: number;
};

const DEFAULT_LIMIT = 50;

function normalizePaginationNumber(value: number | undefined, fallback: number, minimum: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(Math.trunc(value), minimum);
}

export function formatAmountMilliunits(value: number) {
  return formatMilliunits(value);
}

export function projectRecord<
  FieldName extends string,

>(
  entry: Record<string, unknown> & { id?: string },
  allFields: readonly FieldName[],
  options: ProjectionOptions<FieldName> = {},
) {
  const requestedFields = options.fields?.length ? options.fields : allFields;
  const projected = Object.fromEntries(
    requestedFields
      .filter((field) => field in entry)
      .map((field) => [field, entry[field]]),
  );

  if (options.includeIds !== false && entry["id"] !== undefined) {
    projected["id"] = entry["id"];
  }

  return compactObject(projected);
}

export function paginateEntries<Entry>(
  entries: Entry[],
  options: PaginationOptions = {},
) {
  const offset = normalizePaginationNumber(options.offset, 0, 0);
  const limit = normalizePaginationNumber(options.limit, DEFAULT_LIMIT, 1);
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

export function hasPaginationControls(input: {
  limit?: number;
  offset?: number;
}) {
  return input.limit !== undefined
    || input.offset !== undefined;
}

export function hasProjectionControls(input: {
  includeIds?: boolean;
  fields?: unknown[];
}) {
  return input.includeIds !== undefined
    || input.fields !== undefined;
}
