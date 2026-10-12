export const SELECT_CONTROL_EMPTY_VALUE = "__select_control_empty__";

export interface SelectControlOptionLike {
  value: string;
}

export function toSelectControlItemValue(value: string): string {
  return value === "" ? SELECT_CONTROL_EMPTY_VALUE : value;
}

export function deduplicateSelectControlOptions<T extends SelectControlOptionLike>(options: T[]): T[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    const itemValue = toSelectControlItemValue(option.value);
    if (seen.has(itemValue)) {
      return false;
    }
    seen.add(itemValue);
    return true;
  });
}
