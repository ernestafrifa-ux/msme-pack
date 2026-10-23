// Straight-line depreciation charged at each year end (31 December).
// - Yearly charge = cost × rate%. The year the item was bought gets the months owned
//   (bought in October: 3 of 12 months), counting the month it was bought.
// - Nothing is charged for a year end after the item was sold or thrown away.
// - The value never goes below zero.
// Dates are 'YYYY-MM-DD' strings in Ghana time.

const cents = (n) => Math.round(n * 100) / 100;

function iso(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  // pg returns DATE columns as local-midnight Date objects
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The year-end charges up to and including `until`: [{ yearEnd: '2026-12-31', charge: 123.45 }]
function charges(asset, until) {
  const rate = Number(asset.depreciation_rate ?? asset.depreciationRate ?? 0);
  const cost = Number(asset.cost);
  const bought = iso(asset.bought_on ?? asset.boughtOn);
  const disposed = iso(asset.disposed_on ?? asset.disposedOn);
  const out = [];
  if (!rate || !cost || !bought) return out;
  const yearly = cost * rate / 100;
  let left = cost;
  const firstYear = Number(bought.slice(0, 4));
  const lastYear = Number(until.slice(0, 4));
  for (let y = firstYear; y <= lastYear && left > 0.004; y++) {
    const yearEnd = `${y}-12-31`;
    if (yearEnd > until) break;
    if (disposed && disposed <= yearEnd) break;
    const months = y === firstYear ? 12 - Number(bought.slice(5, 7)) + 1 : 12;
    const charge = cents(Math.min(left, yearly * months / 12));
    left = cents(left - charge);
    out.push({ yearEnd, charge });
  }
  return out;
}

// What it is worth on a date: cost less the year-end charges so far (or the owner's estimate when
// no rate is set).
function valueOn(asset, date) {
  if (!Number(asset.depreciation_rate ?? asset.depreciationRate)) return Number(asset.current_value ?? asset.currentValue);
  const taken = charges(asset, date).reduce((s, c) => s + c.charge, 0);
  return cents(Math.max(0, Number(asset.cost) - taken));
}

// The depreciation charged in a period (year ends that fall between from and to).
function chargedBetween(asset, from, to) {
  return cents(charges(asset, to).filter((c) => c.yearEnd >= from).reduce((s, c) => s + c.charge, 0));
}

// The charge this item will get at the coming year end (for the equipment screen).
function nextCharge(asset, today) {
  const y = today.slice(0, 4);
  const all = charges(asset, `${y}-12-31`);
  const last = all[all.length - 1];
  return last && last.yearEnd === `${y}-12-31` ? last.charge : 0;
}

module.exports = { charges, valueOn, chargedBetween, nextCharge, iso };
