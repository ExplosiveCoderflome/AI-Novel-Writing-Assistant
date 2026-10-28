export type ProductionJson = null | boolean | number | string | ProductionJson[] | { [key: string]: ProductionJson };

export class InvalidProductionDataError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidProductionDataError"; }
}

/** Clone only JSON data; never silently lose undefined, non-finite numbers, classes or cycles. */
export function cloneProductionData<T>(value: T): T {
  const ancestors = new Set<object>();
  function visit(item: unknown, depth: number): unknown {
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item !== "object" || depth > 100 || ancestors.has(item)) {
      throw new InvalidProductionDataError("Production data must be finite, acyclic JSON");
    }
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new InvalidProductionDataError("Production data cannot contain class instances");
    }
    ancestors.add(item);
    const result = Array.isArray(item)
      ? Array.from(item, (entry) => visit(entry, depth + 1))
      : Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, visit(entry, depth + 1)]));
    ancestors.delete(item);
    return result;
  }
  return visit(value, 0) as T;
}

export function canonicalProductionJson(value: unknown): string {
  const data = cloneProductionData(value);
  function order(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(order);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, entry]) => [key, order(entry)]));
    }
    return item;
  }
  return JSON.stringify(order(data));
}
