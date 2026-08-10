export function makeId(prefix: string, count: number) {
  return `${prefix}-${Date.now()}-${count + 1}`;
}

export function listToText(items: string[] | undefined) {
  return (items ?? []).join("\n");
}

export function textToList(value: string) {
  return value
    .split(/[\n,，;；、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function updateItem<T>(items: T[], index: number, patch: Partial<T>) {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

export function removeItem<T>(items: T[], index: number) {
  return items.filter((_, itemIndex) => itemIndex !== index);
}
