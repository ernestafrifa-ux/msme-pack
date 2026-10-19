// Planning: monthly sales target and spending budget, savings goals.
// Mounted at /api/businesses/:businessId.
const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { todayInGhana } = require('../dates');

const router = express.Router({ mergeParams: true });
const canView = requireMember();
const canManage = requireMember(['owner', 'manager']);
const money = (n) => (n === null || n === undefined ? null : (Math.round(Number(n) * 100) / 100).toFixed(2));
const monthField = z.string().regex(/^\d{4}-\d{2}$/, 'Use a month like 2026-10.');
const amountField = z.coerce.number().min(0).max(1e11).transform((n) => Math.round(n * 100) / 100);

// The plan for a month; without one, last month's carries over.
async function planFor(businessId, month) {
  const { rows } = await query(
    `SELECT * FROM month_plans WHERE business_id = $1 AND month <= $2::date ORDER BY month DESC LIMIT 1`,
    [businessId, `${month}-01`]
  );
  return rows[0] ? { ...rows[0], carried: rows[0].month.slice(0, 7) !== month } : null;
}

async function planSummary(businessId, month) {
  const start = `${month}-01`;
  const [plan, summary, byCat] = await Promise.all([
    planFor(businessId, month),
    query('SELECT sales, expenses, momo_fees, stock_losses FROM v_monthly_summary WHERE business_id = $1 AND month = $2::date', [businessId, start]),
    query(
      `SELECT c.id, c.name, COALESCE(SUM(t.amount - t.tax_amount), 0) AS spent
         FROM categories c
         LEFT JOIN transactions t ON t.category_id = c.id AND t.business_id = $1 AND t.kind = 'expense'
              AND t.deleted_at IS NULL AND date_trunc('month', t.txn_date) = $2::date
        WHERE c.kind = 'expense' AND (c.business_id IS NULL OR c.business_id = $1) AND c.deleted_at IS NULL
        GROUP BY c.id, c.name, c.sort_order ORDER BY c.sort_order, c.name`,
      [businessId, start]
    ),
  ]);
  const s = summary.rows[0] || {};
  const sales = Number(s.sales || 0);
  // Spending = expenses (with loan interest) and MoMo charges: what the budget controls.
  const spent = Number(s.expenses || 0) + Number(s.momo_fees || 0);
  const limits = plan?.category_limits || {};
  // Expected share of the month gone, to say "on track".
  const today = todayInGhana();
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const dayNow = today.slice(0, 7) === month ? Number(today.slice(8, 10)) : today.slice(0, 7) > month ? days : 0;
  return {
    month,
    plan: plan ? { salesTarget: money(plan.sales_target), expenseLimit: money(plan.expense_limit), carriedFrom: plan.carried ? plan.month.slice(0, 7) : null } : null,
    sales: money(sales),
    spent: money(spent),
    monthShare: Math.round((dayNow / days) * 1000) / 10,
    categories: byCat.rows.map((c) => ({ id: c.id, name: c.name, spent: money(c.spent), limit: money(limits[c.id] ?? null) }))
      .filter((c) => Number(c.spent) > 0 || c.limit !== null),
  };
}

router.get('/plan', canView, validate(z.object({ month: monthField.optional() }), 'query'), async (req, res) => {
  res.json(await planSummary(req.businessId, req.valid.query.month || todayInGhana().slice(0, 7)));
});

const planSchema = z.object({
  month: monthField,
  salesTarget: amountField.nullable().optional(),
  expenseLimit: amountField.nullable().optional(),
  categoryLimits: z.record(z.uuid(), amountField).optional(),
});

router.put('/plan', canManage, validate(planSchema), async (req, res) => {
  const v = req.valid.body;
  await query(
    `INSERT INTO month_plans (business_id, month, sales_target, expense_limit, category_limits, updated_by)
     VALUES ($1, $2::date, $3, $4, $5, $6)
     ON CONFLICT (business_id, month) DO UPDATE SET sales_target = EXCLUDED.sales_target, expense_limit = EXCLUDED.expense_limit,
       category_limits = EXCLUDED.category_limits, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [req.businessId, `${v.month}-01`, v.salesTarget ?? null, v.expenseLimit ?? null, JSON.stringify(v.categoryLimits || {}), req.user.id]
  );
  res.json(await planSummary(req.businessId, v.month));
});

// ---- Savings goals ----------------------------------------------------------------

async function listGoals(businessId) {
  const { rows } = await query(
    `SELECT g.*, a.name AS account_name, b.balance
       FROM savings_goals g JOIN payment_accounts a ON a.id = g.account_id
       JOIN v_account_balances b ON b.account_id = g.account_id
      WHERE g.business_id = $1 AND g.deleted_at IS NULL ORDER BY g.created_at`,
    [businessId]
  );
  const today = todayInGhana();
  return rows.map((g) => {
    const saved = Math.max(0, Number(g.balance));
    const left = Math.max(0, Number(g.target_amount) - saved);
    let perMonth = null;
    if (g.target_date && left > 0 && g.target_date > today) {
      const months = Math.max(1, (Number(g.target_date.slice(0, 4)) - Number(today.slice(0, 4))) * 12
        + Number(g.target_date.slice(5, 7)) - Number(today.slice(5, 7)));
      perMonth = left / months;
    }
    return {
      id: g.id, name: g.name, target: money(g.target_amount), targetDate: g.target_date, accountId: g.account_id,
      accountName: g.account_name, saved: money(saved), left: money(left),
      pct: Math.min(100, Math.round((saved / Number(g.target_amount)) * 1000) / 10),
      perMonth: money(perMonth), reached: left <= 0,
    };
  });
}

router.get('/goals', canView, async (req, res) => {
  res.json({ goals: await listGoals(req.businessId) });
});

const goalSchema = z.object({
  name: z.string().trim().min(2, 'Name the goal, e.g. New photocopier.').max(80),
  target: z.coerce.number().positive('Enter the amount to save.').max(1e11),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  accountId: z.uuid('Choose where the savings are kept.'),
});

router.post('/goals', canManage, validate(goalSchema), async (req, res) => {
  const v = req.valid.body;
  const { rows } = await query('SELECT 1 FROM payment_accounts WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL', [v.accountId, req.businessId]);
  if (!rows[0]) throw new HttpError(400, 'That account was not found.', { accountId: 'Choose one of your accounts.' });
  await query(
    `INSERT INTO savings_goals (business_id, name, target_amount, target_date, account_id, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [req.businessId, v.name, v.target, v.targetDate || null, v.accountId, req.user.id]
  );
  res.status(201).json({ goals: await listGoals(req.businessId) });
});

router.delete('/goals/:goalId', canManage, async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.goalId)) throw new HttpError(404, 'Goal not found.');
  const { rowCount } = await query('UPDATE savings_goals SET deleted_at = now() WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
    [req.params.goalId, req.businessId]);
  if (!rowCount) throw new HttpError(404, 'Goal not found.');
  res.json({ goals: await listGoals(req.businessId) });
});

module.exports = { router, planSummary };
