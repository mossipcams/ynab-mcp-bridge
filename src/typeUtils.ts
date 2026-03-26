declare const BRAND: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [BRAND]: Name;
};

export type ReadonlyArrayOf<Value> = readonly Value[];

export type ReadonlyObject<ObjectType extends object> = {
  readonly [Key in keyof ObjectType]: ObjectType[Key];
};

export type ReadonlyRecord<Key extends PropertyKey, Value> = Readonly<Record<Key, Value>>;

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function getRecordValue(record: UnknownRecord, key: string) {
  return record[key];
}

export function getStringValue(record: UnknownRecord, key: string) {
  const value = getRecordValue(record, key);
  return typeof value === "string" ? value : undefined;
}

export function getNumberValue(record: UnknownRecord, key: string) {
  const value = getRecordValue(record, key);
  return typeof value === "number" ? value : undefined;
}

export function getBooleanValue(record: UnknownRecord, key: string) {
  const value = getRecordValue(record, key);
  return typeof value === "boolean" ? value : undefined;
}

export function getArrayValue(record: UnknownRecord, key: string) {
  const value = getRecordValue(record, key);
  return Array.isArray(value) ? value : undefined;
}

export function getRecordValueIfObject(record: UnknownRecord, key: string) {
  const value = getRecordValue(record, key);
  return isRecord(value) ? value : undefined;
}
