// Backups.
// - A business backup (owner and manager): every record of this business in one Excel workbook,
//   one sheet per kind of record, to keep safe or give an accountant.
// - A full backup (MSME Pack admin): every table of the app as JSON, gzipped, to keep a copy of
//   all the data outside Railway. It holds password hashes (not passwords), so keep it private.
// Both are downloads only: restoring is done from Railway's own database backups.
const express = require('express');
const zlib = require('zlib');
const ExcelJS = require('exceljs');
const { query } = require('../db');
const { requireMember, requireAdmin } = require('../auth');
const { todayInGhana } = require('../dates');
const dep = require('../depreciation');
const { version } = require('../../../package.json');

const KIND = {
  sale: 'Sale', other_income: 'Other income', expense: 'Expense', purchase: 'Stock bought', transfer: 'Transfer',
  owner_draw: 'Owner pay', owner_capital: 'Money put in by owner', loan_received: 'Loan received',
  loan_repayment: 'Loan repayment', equipment: 'Equipment bought', wht: 'Tax withheld by customer', vat_payment: 'VAT paid to GRA',
};
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const fileSafe = (s) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'business';

function addSheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map(([header, key, width = 16, fmt]) => ({ header, key, width, style: fmt ? { numFmt: fmt } : {} }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D5C45' } };
  rows.forEach((r) => ws.addRow(r));
  return ws;
}
const MONEY = '#,##0.00';

async function businessWorkbook(businessId, who) {
  const today = todayInGhana();
  const q = (sql) => query(sql, [businessId]).then((r) => r.rows);
  const [[biz], accounts, starts, records, items, moves, contacts, invoices, lines, debts, assets] = await Promise.all([
    q(`SELECT b.*, r.name AS region, s.name AS sector FROM businesses b
         LEFT JOIN regions r ON r.code = b.region_code LEFT JOIN sectors s ON s.code = b.sector_code WHERE b.id = $1`),
    require('./reports').accountBalances(businessId, today, today),
    q('SELECT id, opening_balance FROM payment_accounts WHERE business_id = $1'),
    q(`SELECT t.*, a.name AS account, ta.name AS to_account, c.name AS category, ct.name AS contact,
              inv.number AS invoice_no, u.full_name AS recorded_by, d.lender, ast.name AS asset
         FROM transactions t
         LEFT JOIN payment_accounts a ON a.id = t.account_id LEFT JOIN payment_accounts ta ON ta.id = t.to_account_id
         LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN contacts ct ON ct.id = t.contact_id
         LEFT JOIN invoices inv ON inv.id = t.invoice_id LEFT JOIN users u ON u.id = t.created_by
         LEFT JOIN debts d ON d.id = t.debt_id LEFT JOIN assets ast ON ast.id = t.asset_id
        WHERE t.business_id = $1 AND t.deleted_at IS NULL ORDER BY t.txn_date, t.created_at`),
    q(`SELECT p.*, COALESCE((SELECT SUM(m.quantity) FROM stock_movements m WHERE m.product_id = p.id), 0) AS on_hand
         FROM products p WHERE p.business_id = $1 AND p.deleted_at IS NULL ORDER BY p.name`),
    q(`SELECT m.*, p.name AS item, p.unit, u.full_name AS recorded_by FROM stock_movements m
         JOIN products p ON p.id = m.product_id LEFT JOIN users u ON u.id = m.created_by
        WHERE m.business_id = $1 ORDER BY m.movement_date, m.created_at`),
    q(`SELECT * FROM contacts WHERE business_id = $1 AND deleted_at IS NULL ORDER BY name`),
    q(`SELECT i.*, c.name AS customer,
              COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.invoice_id = i.id AND t.deleted_at IS NULL
                         AND t.kind IN ('sale', 'wht')), 0) AS paid
         FROM invoices i LEFT JOIN contacts c ON c.id = i.contact_id
        WHERE i.business_id = $1 AND i.deleted_at IS NULL ORDER BY i.issue_date, i.number`),
    q(`SELECT ii.*, i.number FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
        WHERE i.business_id = $1 AND i.deleted_at IS NULL ORDER BY i.issue_date, i.number, ii.sort_order`),
    q(`SELECT d.*, COALESCE((SELECT SUM(t.amount - t.interest_amount) FROM transactions t
                              WHERE t.debt_id = d.id AND t.kind = 'loan_repayment' AND t.deleted_at IS NULL), 0) AS repaid
         FROM debts d WHERE d.business_id = $1 AND d.deleted_at IS NULL ORDER BY d.start_date`),
    q(`SELECT * FROM assets WHERE business_id = $1 AND deleted_at IS NULL ORDER BY bought_on, name`),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MSME Pack';
  wb.created = new Date();
  const about = addSheet(wb, 'About', [['', 'k', 28], ['', 'v', 60]], [
    { k: 'Business', v: biz.name },
    { k: 'Town', v: [biz.town, biz.region].filter(Boolean).join(', ') },
    { k: 'Sector', v: biz.sector || '' },
    { k: 'Phone', v: biz.phone || '' },
    { k: 'TIN', v: biz.tin || '' },
    { k: 'Backup made', v: `${today} by ${who}` },
    { k: 'App version', v: version },
    { k: 'Sheets', v: 'Money records, Accounts, Stock items, Stock changes, Customers, Invoices, Invoice lines, Loans, Equipment' },
    { k: 'Note', v: 'A copy to keep safe. It cannot be loaded back into the app; records stay in the app.' },
  ]);
  about.getRow(1).values = ['MSME Pack backup', ''];

  addSheet(wb, 'Money records', [
    ['Date', 'date', 12], ['Kind', 'kind', 20], ['Amount (GHS)', 'amount', 14, MONEY], ['MoMo fee', 'fee', 10, MONEY],
    ['From / to account', 'account', 18], ['To account (transfer)', 'to', 18], ['Category', 'category', 20],
    ['Customer / supplier', 'contact', 20], ['Invoice', 'invoice', 12], ['Loan from', 'lender', 18], ['Equipment', 'asset', 18],
    ['Interest (GHS)', 'interest', 12, MONEY], ['Tax (GHS)', 'tax', 10, MONEY], ['Paid later', 'credit', 10],
    ['MoMo ID / reference', 'ref', 18], ['Receipt no.', 'receipt', 10], ['Note', 'note', 30], ['Recorded by', 'by', 18],
  ], records.map((t) => ({
    date: t.txn_date, kind: KIND[t.kind] || t.kind, amount: num(t.amount), fee: num(t.momo_fee) || null,
    account: t.account, to: t.to_account, category: t.category, contact: t.contact, invoice: t.invoice_no, lender: t.lender,
    asset: t.asset, interest: num(t.interest_amount) || null, tax: num(t.tax_amount) || null, credit: t.is_credit ? 'Yes' : '',
    ref: t.payment_ref, receipt: t.receipt_no, note: t.note, by: t.recorded_by,
  })));

  addSheet(wb, 'Accounts', [
    ['Account', 'name', 22], ['Kind', 'kind', 16], ['Started on', 'date', 12], ['Balance at start (GHS)', 'opening', 18, MONEY],
    ['Balance today (GHS)', 'closing', 18, MONEY],
  ], accounts.map((a) => ({ name: a.name, kind: a.kind.replace('_', ' '), date: a.opening_date,
    opening: num(starts.find((x) => x.id === a.id)?.opening_balance), closing: num(a.closing) })));

  addSheet(wb, 'Stock items', [
    ['Item', 'name', 26], ['Type', 'kind', 14], ['Unit', 'unit', 10], ['Cost of one (GHS)', 'cost', 14, MONEY],
    ['Selling price (GHS)', 'price', 14, MONEY], ['In stock', 'qty', 10], ['Warn me below', 'low', 12], ['Value at cost (GHS)', 'value', 16, MONEY],
  ], items.map((p) => ({
    name: p.name, kind: { product: 'For sale', service: 'Service', supply: 'Used in work' }[p.kind] || p.kind, unit: p.unit,
    cost: num(p.cost_price), price: p.kind === 'supply' ? null : num(p.selling_price),
    qty: p.track_stock ? num(p.on_hand) : null, low: num(p.reorder_level),
    value: p.track_stock ? Math.round(Math.max(0, num(p.on_hand)) * num(p.cost_price) * 100) / 100 : null,
  })));

  addSheet(wb, 'Stock changes', [
    ['Date', 'date', 12], ['Item', 'item', 24], ['Reason', 'reason', 18], ['Quantity', 'qty', 10], ['Unit', 'unit', 10],
    ['Cost of one (GHS)', 'cost', 14, MONEY], ['Note', 'note', 30], ['Recorded by', 'by', 18],
  ], moves.map((m) => ({ date: m.movement_date, item: m.item, reason: m.reason.replace(/_/g, ' '), qty: num(m.quantity), unit: m.unit,
    cost: num(m.unit_cost), note: m.note, by: m.recorded_by })));

  addSheet(wb, 'Customers', [
    ['Name', 'name', 24], ['Kind', 'kind', 12], ['Phone', 'phone', 16], ['Email', 'email', 22], ['Address', 'address', 24], ['Notes', 'notes', 30],
  ], contacts.map((c) => ({ name: c.name, kind: c.kind, phone: c.phone, email: c.email, address: c.address, notes: c.notes })));

  addSheet(wb, 'Invoices', [
    ['Number', 'number', 12], ['Customer', 'customer', 22], ['Date', 'date', 12], ['Pay by', 'due', 12], ['Status', 'status', 12],
    ['Subtotal (GHS)', 'subtotal', 14, MONEY], ['Discount (GHS)', 'discount', 12, MONEY], ['Tax (GHS)', 'tax', 12, MONEY],
    ['Total (GHS)', 'total', 14, MONEY], ['Paid (GHS)', 'paid', 14, MONEY], ['Still owed (GHS)', 'owed', 14, MONEY],
  ], invoices.map((i) => ({ number: i.number, customer: i.customer, date: i.issue_date, due: i.due_date, status: i.status,
    subtotal: num(i.subtotal), discount: num(i.discount), tax: num(i.tax_amount), total: num(i.total), paid: num(i.paid),
    owed: i.status === 'cancelled' || i.status === 'draft' ? null : Math.round((num(i.total) - num(i.paid)) * 100) / 100 })));

  addSheet(wb, 'Invoice lines', [
    ['Invoice', 'number', 12], ['Description', 'desc', 30], ['Quantity', 'qty', 10], ['Price of one (GHS)', 'price', 14, MONEY],
    ['Line total (GHS)', 'total', 14, MONEY],
  ], lines.map((l) => ({ number: l.number, desc: l.description, qty: num(l.quantity), price: num(l.unit_price), total: num(l.line_total) })));

  addSheet(wb, 'Loans', [
    ['Lender / supplier', 'lender', 24], ['Kind', 'kind', 14], ['Started', 'date', 12], ['Pay by', 'due', 12],
    ['Amount (GHS)', 'amount', 14, MONEY], ['Repaid (GHS)', 'repaid', 14, MONEY], ['Still owed (GHS)', 'owed', 14, MONEY], ['Note', 'note', 30],
  ], debts.map((d) => ({ lender: d.lender, kind: d.kind, date: d.start_date, due: d.due_date, amount: num(d.amount),
    repaid: num(d.repaid), owed: Math.round((num(d.amount) - num(d.repaid)) * 100) / 100, note: d.note })));

  addSheet(wb, 'Equipment', [
    ['Item', 'name', 24], ['Bought', 'date', 12], ['Paid (GHS)', 'cost', 14, MONEY], ['Depreciation % a year', 'rate', 12],
    ['Value today (GHS)', 'value', 16, MONEY], ['Sold or thrown away', 'gone', 14], ['Note', 'note', 30],
  ], assets.map((a) => ({ name: a.name, date: a.bought_on, cost: num(a.cost), rate: num(a.depreciation_rate),
    value: a.disposed_on ? 0 : dep.valueOn(a, today), gone: a.disposed_on || '', note: a.note })));

  return { wb, name: `MSME-Pack-backup-${fileSafe(biz.name)}-${today}.xlsx` };
}

// ---- Business backup: /api/businesses/:businessId/backup --------------------------
const router = express.Router({ mergeParams: true });
router.get('/backup', requireMember(['owner', 'manager']), async (req, res) => {
  const { wb, name } = await businessWorkbook(req.businessId, req.user.full_name);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
  await wb.xlsx.write(res);
  res.end();
});

// ---- Full backup for the admin: /api/admin/backup ---------------------------------
const adminRouter = express.Router();
adminRouter.get('/backup', requireAdmin, async (req, res) => {
  const { rows: tables } = await query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  const today = todayInGhana();
  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="MSME-Pack-full-backup-${today}.json.gz"`);
  res.setHeader('Cache-Control', 'no-store');
  const gz = zlib.createGzip();
  gz.pipe(res);
  const write = (s) => new Promise((resolve) => { if (gz.write(s)) resolve(); else gz.once('drain', resolve); });
  await write(`{"app":"MSME Pack","version":${JSON.stringify(version)},"madeAt":${JSON.stringify(new Date().toISOString())},` +
    `"madeBy":${JSON.stringify(req.user.full_name)},"tables":{`);
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i].table_name;
    const { rows } = await query(`SELECT * FROM "${t.replace(/"/g, '')}"`);
    await write(`${i ? ',' : ''}${JSON.stringify(t)}:[`);
    for (let j = 0; j < rows.length; j++) await write((j ? ',' : '') + JSON.stringify(rows[j]));
    await write(']');
  }
  await write('}}');
  gz.end();
});

module.exports = { router, adminRouter, businessWorkbook };
