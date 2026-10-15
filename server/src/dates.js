// Business dates are Ghana dates (Africa/Accra, UTC+0, no daylight saving),
// whatever time zone the server or database happens to run in.
const TZ = 'Africa/Accra';

function todayInGhana(now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
}

function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

module.exports = { todayInGhana, addDays };
