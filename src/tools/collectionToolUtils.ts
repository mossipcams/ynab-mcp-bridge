import { compactObject, formatMilliunits } from "./financeToolUtils.js";

type ProjectionOptions<FieldName extends string> = {
  fields?: FieldName[];
  includeIds?: boolean;
};

type PaginationOptions = {
  limit?: number;
  offset?: number;
};

type PageMetadata = {
  returned_count: number;
  offset: number;
  limit: number;
  has_more: boolean;
  next_offset?: number;
};

const DEFAULT_LIMIT = 50;

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
  const requestedFields = (options.fields?.length ? options.fields : allFields) as readonly string[];
  const projected = Object.fromEntries(
    requestedFields
      .filter((field) => field in entry)
      .map((field) => [field, entry[field]]),
  );

  if (options.includeIds !== false && entry.id !== undefined) {
    projected.id = entry.id;
  }

  return compactObject(projected);
}

export function paginateEntries<Entry>(
  entries: Entry[],
  options: PaginationOptions = {},
) {
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
    }) as PageMetadata,
  };
}

export function hasCollectionControls(input: {
  limit?: number;
  offset?: number;
  includeIds?: boolean;
  fields?: unknown[];
}) {
  return input.limit !== undefined
    || input.offset !== undefined
    || input.includeIds !== undefined
    || input.fields !== undefined;
}
