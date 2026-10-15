// Normalise a Ghanaian mobile number to +233XXXXXXXXX.
// Accepts 0241234567, 241234567, 233241234567, +233 24 123 4567.
// Returns null if it doesn't look like a valid Ghana number.
function normaliseGhanaPhone(input) {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('233')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[235]\d{8}$/.test(digits)) return null;
  return '+233' + digits;
}

module.exports = { normaliseGhanaPhone };
