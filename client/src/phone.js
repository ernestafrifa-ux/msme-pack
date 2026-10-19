// "024 123 4567" or "+233 24 123 4567" -> "233241234567" (for WhatsApp links); null if not a Ghana number.
export function normalisePhone(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (/^0\d{9}$/.test(d)) return `233${d.slice(1)}`;
  if (/^233\d{9}$/.test(d)) return d;
  return null;
}
