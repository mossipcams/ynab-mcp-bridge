import { compactObject, formatMilliunits } from "./financeToolUtils.js";

type ProjectionOptions<FieldName extends string> = {
  fields?: readonly FieldName[];
  includeIds?: boolean;
};

type PaginationOptions = {
  limit?: number;
  offset?: number;
};

type CollectionRenderingOptions<FieldName extends string> = ProjectionOptions<FieldName> & PaginationOptions;

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

export function hasPaginationControls(input: {
  limit?: number;
  offset?: number;
}) {
  return input.limit !== undefined
    || input.offset !== undefined;
}

export function hasProjectionControls(input: {
  includeIds?: boolean;
  fields?: readonly unknown[];
}) {
  return input.includeIds !== undefined
    || input.fields !== undefined;
}

export function renderCollectionResult<
  Entry extends Record<string, unknown> & { id?: string },
  FieldName extends string,
  CollectionKey extends string,
  CountKey extends string,
>(
  entries: Entry[],
  allFields: readonly FieldName[],
  input: CollectionRenderingOptions<FieldName>,
  collectionKey: CollectionKey,
  countKey: CountKey,
) {
  if (!hasPaginationControls(input) && !hasProjectionControls(input)) {
    return {
      [collectionKey]: entries,
      [countKey]: entries.length,
    };
  }

  if (!hasPaginationControls(input)) {
    return {
      [collectionKey]: entries.map((entry) => projectRecord(entry, allFields, input)),
      [countKey]: entries.length,
    };
  }

  const pagedEntries = paginateEntries(entries, input);

  return {
    [collectionKey]: pagedEntries.entries.map((entry) => projectRecord(entry, allFields, input)),
    [countKey]: entries.length,
    ...pagedEntries.metadata,
  };
}

export function buildCollectionResult<
  Entry extends Record<string, unknown> & { id?: string },
  FieldName extends string,
>(options: {
  entries: Entry[];
  entryKey: string;
  countKey: string;
  allFields: readonly FieldName[];
  input?: CollectionRenderingOptions<FieldName>;
}) {
  return renderCollectionResult(
    options.entries,
    options.allFields,
    options.input ?? {},
    options.entryKey,
    options.countKey,
  );
}
