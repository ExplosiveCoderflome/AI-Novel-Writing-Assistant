export function parseEstimatedChapterCountInput(value: string): number | null {
  const parsedValue = Number(value);
  return value.trim() !== "" && Number.isInteger(parsedValue) && parsedValue >= 1 && parsedValue <= 2000
    ? parsedValue
    : null;
}
