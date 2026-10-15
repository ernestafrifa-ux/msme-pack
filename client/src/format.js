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

// "2026-10-15" -> "Today", "Yesterday" or "Thu 15 Oct". Pass t() to get the words translated.
export function friendlyDate(iso, t) {
  const today = todayGhana();
  if (iso === today) return t ? t('date.today') : 'Today';
  const y = new Date(today + 'T00:00:00Z');
  y.setUTCDate(y.getUTCDate() - 1);
  if (iso === y.toISOString().slice(0, 10)) return t ? t('date.yesterday') : 'Yesterday';
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
  purchase: 'Bought stock',
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

// "12.000" -> "12", "2.500" -> "2.5"
export function qty(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

export function addDaysIso(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "2026-10-29" -> "29 Oct 2026"
export function longDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export const INVOICE_STATUS = {
  draft: 'Draft',
  sent: 'Sent',
  part_paid: 'Part paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Cancelled',
};

export const STOCK_REASON = {
  opening: 'Opening stock',
  purchase: 'Bought',
  produced: 'Made / produced',
  sale: 'Sold',
  return_in: 'Returned by customer',
  return_out: 'Returned to supplier',
  damaged: 'Damaged',
  expired: 'Expired',
  own_use: 'Own use',
  count_adjustment: 'Stock count',
};

// Turn a Ghana number into WhatsApp's format (digits only, with 233).
export function whatsappLink(phone, text) {
  const digits = (phone || '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
