/**
 * Parses pipe-delimited key|value text back into a nested object.
 * Used by tests to assert on tool output.
 */
export function parsePipeDelimited(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const line of text.split("\n")) {
    const separatorIndex = line.indexOf("|");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);

    setNestedValue(result, key.split("."), value);
  }

  return result;
}

function setNestedValue(obj: Record<string, unknown>, keys: string[], value: string) {
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];
    const isNextArray = /^\d+$/.test(nextKey);

    if (!(key in current)) {
      current[key] = isNextArray ? [] : {};
    }

    current = current[key] as Record<string, unknown>;
  }

  const finalKey = keys[keys.length - 1];
  current[finalKey] = tryParseValue(value);
}

function tryParseValue(value: string): unknown {
  if (value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}
