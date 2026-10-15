const cedis = new Intl.NumberFormat('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "1234.5" -> "1,234.50"
export function money(value) {
  const n = Number(value || 0);
  return cedis.format(Number.isFinite(n) ? n : 0);
}

// Today's date in Ghana as YYYY-MM-DD.
export function todayGhana() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Accra' }).format(new Date());
}

// "2026-10-15" -> "Today", "Yesterday" or "Thu 15 Oct"
export function friendlyDate(iso) {
  const today = todayGhana();
  if (iso === today) return 'Today';
  const y = new Date(today + 'T00:00:00Z');
  y.setUTCDate(y.getUTCDate() - 1);
  if (iso === y.toISOString().slice(0, 10)) return 'Yesterday';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
}

export function monthName(yyyyMm) {
  return new Date(yyyyMm + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
}

export const KIND_LABEL = {
  sale: 'Sale',
  other_income: 'Other income',
  expense: 'Expense',
  purchase: 'Stock purchase',
  transfer: 'Transfer',
  owner_draw: 'Owner pay',
  owner_capital: 'Money put in',
};

// +1 money in, -1 money out, 0 moved between accounts.
export function direction(kind) {
  if (['sale', 'other_income', 'owner_capital'].includes(kind)) return 1;
  if (kind === 'transfer') return 0;
  return -1;
}
