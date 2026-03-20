import type { Brand } from "./typeUtils.js";

export type PlanId = Brand<string, "PlanId">;
export type AccountId = Brand<string, "AccountId">;
export type CategoryId = Brand<string, "CategoryId">;
export type PayeeId = Brand<string, "PayeeId">;
export type TransactionId = Brand<string, "TransactionId">;

function hasIdentifierValue(value: string) {
  return value.trim().length > 0;
}

export function isPlanId(value: string): value is PlanId {
  return hasIdentifierValue(value);
}

export function isAccountId(value: string): value is AccountId {
  return hasIdentifierValue(value);
}

export function isCategoryId(value: string): value is CategoryId {
  return hasIdentifierValue(value);
}

export function isPayeeId(value: string): value is PayeeId {
  return hasIdentifierValue(value);
}

export function isTransactionId(value: string): value is TransactionId {
  return hasIdentifierValue(value);
}

export function toPlanId(value: string | undefined): PlanId | undefined {
  const trimmed = value?.trim();

  if (!trimmed || !isPlanId(trimmed)) {
    return undefined;
  }

  return trimmed;
}
