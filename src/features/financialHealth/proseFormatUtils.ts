import { getStringValue, isRecord } from "../../typeUtils.js";

type ProseList = {
  heading: string;
  items: string[];
};

type ProseValue = number | string | undefined | null;

function hasValue(value: ProseValue): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function proseItem(...parts: ProseValue[]): string {
  return parts
    .filter(hasValue)
    .map((part) => String(part))
    .join(" ");
}

export function proseRecordItem(record: unknown, ...keys: string[]): string {
  if (!isRecord(record)) {
    return "";
  }

  return proseItem(...keys.map((key) => getStringValue(record, key)));
}

export function buildProse(
  title: string,
  pairs: Array<[string, ProseValue]>,
  lists: ProseList[] = [],
): string {
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
