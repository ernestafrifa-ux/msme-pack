// Ghana VAT and withholding tax, as from 1 January 2026 (VAT Act 2025, Act 1151).
// NHIL 2.5%, GETFund 2.5% and VAT 15% are all charged on the same tax-exclusive value: 20% in total.
// Withholding tax on payments above GHS 2,000 (tax-exclusive): goods 3%, services 7.5%.
// The same rules are in client/src/tax.js; keep both in step.
const RATES = { nhil: 2.5, getfund: 2.5, vat: 15 };
const TOTAL_RATE = RATES.nhil + RATES.getfund + RATES.vat; // 20
const WHT = { goods: 3, services: 7.5, threshold: 2000 };

const cents = (n) => Math.round(Number(n) * 100);

// Tax on a tax-exclusive amount, each part rounded to the pesewa.
function vatOn(exclusive) {
  const base = cents(exclusive);
  const nhil = Math.round((base * RATES.nhil) / 100);
  const getfund = Math.round((base * RATES.getfund) / 100);
  const vat = Math.round((base * RATES.vat) / 100);
  return { exclusive: base / 100, nhil: nhil / 100, getfund: getfund / 100, vat: vat / 100,
    tax: (nhil + getfund + vat) / 100, inclusive: (base + nhil + getfund + vat) / 100 };
}

// From a tax-inclusive amount: exclusive = 100/120 of it.
// The total stays exactly what was entered; any pesewa of rounding goes on the VAT line.
function vatFromInclusive(inclusive) {
  const total = cents(inclusive);
  const v = vatOn(Math.round((total * 100) / (100 + TOTAL_RATE)) / 100);
  const gap = total - cents(v.inclusive);
  return { ...v, vat: (cents(v.vat) + gap) / 100, tax: (cents(v.tax) + gap) / 100, inclusive: total / 100 };
}

function whtOn(exclusive, kind) {
  if (Number(exclusive) <= WHT.threshold) return 0;
  return Math.round((cents(exclusive) * WHT[kind]) / 100) / 100;
}

module.exports = { RATES, TOTAL_RATE, WHT, vatOn, vatFromInclusive, whtOn };
