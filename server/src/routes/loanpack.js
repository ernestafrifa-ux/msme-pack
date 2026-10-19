// The loan-ready pack: one summary a lender or support programme can read, built from the
// records: the business, month-by-month results, what it owns and owes, and how well it
// keeps records. Mounted at /api/businesses/:businessId.
const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { requireMember } = require('../auth');
const { validate } = require('../http');
const { todayInGhana } = require('../dates');
const { balanceSheet, accountBalances, debtBalances } = require('./reports');

const router = express.Router({ mergeParams: true });
const money = (n) => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const num = (n) => Number(n || 0);

function monthsBack(today, n) {
  const out = [];
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    const start = d.toISOString().slice(0, 10);
    const e = new Date(d); e.setUTCMonth(e.getUTCMonth() + 1); e.setUTCDate(0);
    const end = e.toISOString().slice(0, 10);
    out.unshift({ month: start.slice(0, 7), start, end: end > today ? today : end });
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

router.get('/reports/loan-pack', requireMember(['owner', 'manager', 'advisor']),
  validate(z.object({ months: z.coerce.number().int().refine((m) => [3, 6, 12].includes(m)).default(6) }), 'query'),
  async (req, res) => {
    const today = todayInGhana();
    const id = req.businessId;
    // Only months since the business started keeping records here, so averages are fair.
    const { rows: started } = await query('SELECT MIN(opening_date) AS d FROM payment_accounts WHERE business_id = $1', [id]);
    const startMonth = (started[0].d || today).slice(0, 7);
    let months = monthsBack(today, req.valid.query.months).filter((m) => m.month >= startMonth);
    if (!months.length) months = monthsBack(today, 1);
    const from = months[0].start;
    const [biz, owners, firstDay, summary, cash, activity, health, bs, debts] = await Promise.all([
      query(
        `SELECT b.*, s.name AS sector, r.name AS region FROM businesses b
           LEFT JOIN sectors s ON s.code = b.sector_code LEFT JOIN regions r ON r.code = b.region_code WHERE b.id = $1`, [id]
      ),
      query(`SELECT u.full_name, u.phone FROM business_members m JOIN users u ON u.id = m.user_id
              WHERE m.business_id = $1 AND m.role = 'owner' ORDER BY m.created_at`, [id]),
      query('SELECT MIN(opening_date) AS d, (SELECT COUNT(*)::int FROM business_members WHERE business_id = $1) AS people FROM payment_accounts WHERE business_id = $1', [id]),
      query(`SELECT to_char(month, 'YYYY-MM') AS month, sales, other_income, cost_of_sales, gross_profit, expenses, momo_fees,
                    stock_losses, net_profit_estimate, owner_pay
               FROM v_monthly_summary WHERE business_id = $1 AND month >= $2::date`, [id, from]),
      query(
        `SELECT to_char(date_trunc('month', txn_date), 'YYYY-MM') AS month,
                COALESCE(SUM(amount - momo_fee) FILTER (WHERE kind IN ('sale','other_income','owner_capital','loan_received')), 0) AS cash_in,
                COALESCE(SUM(amount + momo_fee) FILTER (WHERE kind IN ('expense','purchase','owner_draw','loan_repayment','equipment','vat_payment')), 0) AS cash_out
           FROM transactions WHERE business_id = $1 AND deleted_at IS NULL AND NOT is_credit AND txn_date >= $2::date
          GROUP BY 1`, [id, from]
      ),
      query(
        `SELECT to_char(date_trunc('month', txn_date), 'YYYY-MM') AS month, COUNT(*)::int AS records, COUNT(DISTINCT txn_date)::int AS days
           FROM transactions WHERE business_id = $1 AND deleted_at IS NULL AND txn_date >= $2::date GROUP BY 1`, [id, from]
      ),
      query('SELECT overall_score, completed_at FROM v_latest_health WHERE business_id = $1', [id]),
      balanceSheet(id, today),
      debtBalances(id, today),
    ]);
    const b = biz.rows[0];
    const byMonth = (rows) => Object.fromEntries(rows.map((r) => [r.month, r]));
    const sm = byMonth(summary.rows); const cm = byMonth(cash.rows); const am = byMonth(activity.rows);
    // Cash at the end of each month.
    const closing = await Promise.all(months.map((m) => accountBalances(id, m.end, m.end).then((rows) => rows.reduce((s, r) => s + num(r.closing), 0))));
    const rows = months.map((m, i) => {
      const s = sm[m.month] || {};
      const days = Number(m.end.slice(8, 10));
      return {
        month: m.month,
        sales: money(s.sales), otherIncome: money(s.other_income), costOfSales: money(s.cost_of_sales),
        grossProfit: money(num(s.sales) - num(s.cost_of_sales)),
        expenses: money(num(s.expenses) + num(s.momo_fees) + num(s.stock_losses)),
        netProfit: money(s.net_profit_estimate), ownerPay: money(s.owner_pay),
        cashIn: money(cm[m.month]?.cash_in), cashOut: money(cm[m.month]?.cash_out), closingCash: money(closing[i]),
        records: am[m.month]?.records || 0, daysRecorded: am[m.month]?.days || 0, daysInMonth: days,
      };
    });
    const total = (k) => rows.reduce((s, r) => s + num(r[k]), 0);
    const n = rows.length;
    const half = Math.floor(n / 2);
    const recent = rows.slice(n - half).reduce((s, r) => s + num(r.sales), 0);
    const earlier = rows.slice(0, half).reduce((s, r) => s + num(r.sales), 0);
    const totalSales = total('sales');
    const monthsWithRecords = rows.filter((r) => r.records > 0).length;
    const repayments = await query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0) AS total FROM transactions
        WHERE business_id = $1 AND kind = 'loan_repayment' AND deleted_at IS NULL AND txn_date >= $2::date`, [id, from]
    );
    res.json({
      generatedOn: today, from, to: today, requestedMonths: req.valid.query.months,
      business: {
        name: b.name, logoUrl: b.logo_url, sector: b.sector, region: b.region, town: b.town, legalForm: b.legal_form,
        phone: b.phone, email: b.email, digitalAddress: b.digital_address, tin: b.tin,
        vatNumber: b.vat_registered ? b.vat_number : null, owners: owners.rows.map((o) => ({ name: o.full_name, phone: o.phone })),
        recordsSince: firstDay.rows[0].d, people: firstDay.rows[0].people,
      },
      months: rows,
      totals: {
        sales: money(totalSales), grossProfit: money(total('grossProfit')), expenses: money(total('expenses')),
        netProfit: money(total('netProfit')), ownerPay: money(total('ownerPay')), cashIn: money(total('cashIn')), cashOut: money(total('cashOut')),
      },
      averages: {
        sales: money(totalSales / n), netProfit: money(total('netProfit') / n),
        netMargin: totalSales > 0 ? Math.round((total('netProfit') / totalSales) * 1000) / 10 : null,
        grossMargin: totalSales > 0 ? Math.round((total('grossProfit') / totalSales) * 1000) / 10 : null,
        // Sales in the later half of the period compared with the earlier half.
        salesGrowth: earlier > 0 ? Math.round(((recent - earlier) / earlier) * 1000) / 10 : null,
      },
      recordKeeping: {
        monthsWithRecords, months: n,
        daysRecorded: rows.reduce((s, r) => s + r.daysRecorded, 0),
        records: rows.reduce((s, r) => s + r.records, 0),
      },
      balanceSheet: bs,
      debts: debts.filter((d) => d.balance > 0.004).map((d) => ({ lender: d.lender, kind: d.kind, borrowed: money(d.amount), balance: money(d.balance), since: d.start_date })),
      repayments: { count: repayments.rows[0].n, total: money(repayments.rows[0].total) },
      health: health.rows[0] ? { score: Number(health.rows[0].overall_score), on: health.rows[0].completed_at } : null,
    });
  });

module.exports = { router, monthsBack };
