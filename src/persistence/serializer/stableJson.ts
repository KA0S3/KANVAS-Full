export function stableSortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableSortValue);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) {
      sorted[key] = stableSortValue(child);
    }
  }

  return sorted;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableSortValue(value), null, 2);
}
