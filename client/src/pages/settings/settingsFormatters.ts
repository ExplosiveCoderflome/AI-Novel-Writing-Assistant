export function formatBalanceAmount(amount: number | null | undefined, currency: string | null | undefined): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "-";
  }
  if (currency) {
    try {
      return new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // Fall through to plain numeric output for unsupported currency codes.
    }
  }
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatBalanceTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("zh-CN", {
    hour12: false,
  });
}
