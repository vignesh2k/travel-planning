export function formatLocal(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-GB")} ${currency}`;
  }
}

export function formatGbp(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function combined(local: number, currency: string, gbp_rate: number): string {
  const gbp = Math.round(local * gbp_rate);
  return `${formatLocal(local, currency)} (${formatGbp(gbp)})`;
}

export function dayTotal(day: {
  estimated: number;
  override: number | null;
  items: { amount: number }[];
}): number {
  const base = day.override ?? day.estimated;
  const items = day.items.reduce((sum, it) => sum + it.amount, 0);
  return base + items;
}
