// Customers and invoices. Mounted at /api/businesses/:businessId.
//
// Life of an invoice:
//   draft  → can be edited or deleted; no effect on stock or money
//   sent   → goods leave stock (database trigger); customer gets a share link
//   part_paid / paid → each payment is a 'sale' in the cash book, linked to the invoice
//   void   → goods return to stock; only allowed while nothing has been paid
const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { todayInGhana, addDays } = require('../dates');
const { normaliseGhanaPhone } = require('../phone');
const { refreshInvoiceStatus } = require('../invoiceStatus');
const { insertTransaction, checkAccounts, checkDate, TXN_SELECT, publicTxn } = require('./cashbook');

const router = express.Router({ mergeParams: true });

const canView = requireMember();
const canRecord = requireMember(['owner', 'manager', 'staff']);
const canManage = requireMember(['owner', 'manager']);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15.');
const money = z.coerce.number().min(0, 'Cannot be negative.').max(1e11).transform((n) => Math.round(n * 100) / 100);
const isUuid = (id) => /^[0-9a-f-]{36}$/i.test(id || '');

const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    const p = normaliseGhanaPhone(v);
    if (!p) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid Ghana phone number, or leave it empty.' });
      return z.NEVER;
    }
    return p;
  });

// ---- Customers ---------------------------------------------------------------

const contactSchema = z.object({
  kind: z.enum(['customer', 'supplier', 'both']).default('customer'),
  name: z.string().trim().min(2, 'Enter the name.').max(120),
  phone: optionalPhone,
  email: z.email('Enter a valid email, or leave it empty.').optional().nullable().or(z.literal('')),
  address: z.string().trim().max(200).optional().nullable(),
});

function publicContact(c) {
  return { id: c.id, kind: c.kind, name: c.name, phone: c.phone, email: c.email, address: c.address };
}

router.get('/contacts', canView, validate(z.object({ q: z.string().trim().max(80).optional() }), 'query'), async (req, res) => {
  const params = [req.businessId];
  let filter = '';
  if (req.valid.query.q) {
    params.push(`%${req.valid.query.q}%`);
    filter = `AND (name ILIKE $2 OR phone ILIKE $2)`;
  }
  const { rows } = await query(
    `SELECT * FROM contacts WHERE business_id = $1 AND deleted_at IS NULL ${filter} ORDER BY lower(name) LIMIT 200`,
    params
  );
  res.json({ contacts: rows.map(publicContact) });
});

async function createContact(db, businessId, c) {
  const { rows } = await db.query(
    `INSERT INTO contacts (business_id, kind, name, phone, email, address) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [businessId, c.kind || 'customer', c.name, c.phone || null, c.email || null, c.address || null]
  );
  return rows[0];
}

router.post('/contacts', canRecord, validate(contactSchema), async (req, res) => {
  const c = await createContact({ query }, req.businessId, req.valid.body);
  res.status(201).json({ contact: publicContact(c) });
});

// ---- Invoice helpers -------------------------------------------------------------

const lineSchema = z.object({
  productId: z.uuid().optional().nullable(),
  description: z.string().trim().min(1, 'Describe the item.').max(200),
  quantity: z.coerce.number().positive('Must be more than zero.').max(1e9).transform((n) => Math.round(n * 1000) / 1000),
  unitPrice: money,
});

const invoiceSchema = z
  .object({
    contactId: z.uuid().optional().nullable(),
    newContact: z.object({ name: z.string().trim().min(2, 'Enter the customer name.').max(120), phone: optionalPhone })
      .optional().nullable(),
    issueDate: isoDate.optional(),
    dueDate: isoDate.optional().nullable(),
    items: z.array(lineSchema).min(1, 'Add at least one item.').max(100),
    discount: money.default(0),
    taxLabel: z.string().trim().max(40).optional().nullable(),
    taxRate: z.coerce.number().min(0).max(100).default(0),
    notes: z.string().trim().max(1000).optional().nullable(),
    paymentTerms: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (!v.contactId && !v.newContact) {
      ctx.addIssue({ code: 'custom', path: ['contactId'], message: 'Choose or add a customer.' });
    }
    if (v.dueDate && v.issueDate && v.dueDate < v.issueDate) {
      ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'Due date is before the invoice date.' });
    }
  });

// All money is worked out here, never trusted from the phone.
function computeTotals(items, discount, taxRate) {
  const cents = (n) => Math.round(n * 100);
  const subtotal = items.reduce((s, i) => s + cents(i.quantity * i.unitPrice), 0);
  if (cents(discount) > subtotal) {
    throw new HttpError(400, 'The discount is more than the invoice total.', { discount: 'Too large.' });
  }
  const taxable = subtotal - cents(discount);
  const tax = Math.round((taxable * taxRate) / 100);
  return {
    subtotal: subtotal / 100,
    discount: cents(discount) / 100,
    taxAmount: tax / 100,
    total: (taxable + tax) / 100,
  };
}

async function checkLineProducts(db, businessId, items) {
  const ids = [...new Set(items.map((i) => i.productId).filter(Boolean))];
  if (!ids.length) return;
  const { rows } = await db.query(
    `SELECT id FROM products WHERE business_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
    [businessId, ids]
  );
  if (rows.length !== ids.length) throw new HttpError(400, 'One of the products was not found.', { items: 'Check the products.' });
}

async function resolveContact(db, businessId, v) {
  if (v.contactId) {
    const { rows } = await db.query('SELECT id FROM contacts WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL',
      [v.contactId, businessId]);
    if (!rows[0]) throw new HttpError(400, 'That customer was not found.', { contactId: 'Choose another customer.' });
    return rows[0].id;
  }
  return (await createContact(db, businessId, { ...v.newContact, kind: 'customer' })).id;
}

async function replaceItems(db, invoiceId, items) {
  await db.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
  let order = 0;
  for (const it of items) {
    await db.query(
      `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [invoiceId, it.productId || null, it.description, it.quantity, it.unitPrice, order++]
    );
  }
}

async function loadInvoice(businessId, id, db = { query }) {
  if (!isUuid(id)) throw new HttpError(404, 'Invoice not found.');
  const { rows } = await db.query(
    `SELECT i.*, c.name AS contact_name, c.phone AS contact_phone, c.email AS contact_email, c.address AS contact_address,
            COALESCE(p.paid, 0) AS paid
       FROM invoices i
       LEFT JOIN contacts c ON c.id = i.contact_id
       LEFT JOIN LATERAL (SELECT SUM(amount) AS paid FROM transactions
                           WHERE invoice_id = i.id AND deleted_at IS NULL) p ON TRUE
      WHERE i.id = $1 AND i.business_id = $2 AND i.deleted_at IS NULL`,
    [id, businessId]
  );
  if (!rows[0]) throw new HttpError(404, 'Invoice not found.');
  return rows[0];
}

function displayStatus(inv, today = todayInGhana()) {
  const outstanding = Number(inv.total) - Number(inv.paid);
  if (inv.status === 'draft' || inv.status === 'void') return inv.status;
  if (outstanding <= 0) return 'paid';
  if (inv.due_date && inv.due_date < today) return 'overdue';
  return Number(inv.paid) > 0 ? 'part_paid' : 'sent';
}

async function invoiceDetail(businessId, id) {
  const inv = await loadInvoice(businessId, id);
  const [items, payments] = await Promise.all([
    query(
      `SELECT ii.id, ii.product_id, ii.description, ii.quantity, ii.unit_price, ii.line_total, p.unit
         FROM invoice_items ii LEFT JOIN products p ON p.id = ii.product_id
        WHERE ii.invoice_id = $1 ORDER BY ii.sort_order`,
      [inv.id]
    ),
    query(`${TXN_SELECT} WHERE t.invoice_id = $1 AND t.deleted_at IS NULL ORDER BY t.txn_date, t.created_at`, [inv.id]),
  ]);
  return {
    id: inv.id,
    number: inv.number,
    status: displayStatus(inv),
    contact: inv.contact_id
      ? { id: inv.contact_id, name: inv.contact_name, phone: inv.contact_phone, email: inv.contact_email, address: inv.contact_address }
      : null,
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    items: items.rows.map((r) => ({
      id: r.id, productId: r.product_id, description: r.description, quantity: r.quantity,
      unitPrice: r.unit_price, lineTotal: r.line_total, unit: r.unit,
    })),
    subtotal: inv.subtotal,
    discount: inv.discount,
    taxLabel: inv.tax_label,
    taxRate: inv.tax_rate,
    taxAmount: inv.tax_amount,
    total: inv.total,
    paid: Number(inv.paid).toFixed(2),
    outstanding: Math.max(0, Number(inv.total) - Number(inv.paid)).toFixed(2),
    notes: inv.notes,
    paymentTerms: inv.payment_terms,
    sentAt: inv.sent_at,
    sentVia: inv.sent_via,
    shareToken: inv.share_token,
    payments: payments.rows.map(publicTxn),
  };
}

// ---- Invoices ------------------------------------------------------------------

const listSchema = z.object({
  status: z.enum(['all', 'draft', 'unpaid', 'overdue', 'paid', 'void']).default('all'),
  contactId: z.uuid().optional(),
});

router.get('/invoices', canView, validate(listSchema, 'query'), async (req, res) => {
  const { status, contactId } = req.valid.query;
  const params = [req.businessId];
  let extra = '';
  if (contactId) {
    params.push(contactId);
    extra = `AND i.contact_id = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT i.id, i.number, i.status, i.issue_date, i.due_date, i.total, i.contact_id,
            c.name AS contact_name, COALESCE(p.paid, 0) AS paid
       FROM invoices i
       LEFT JOIN contacts c ON c.id = i.contact_id
       LEFT JOIN LATERAL (SELECT SUM(amount) AS paid FROM transactions
                           WHERE invoice_id = i.id AND deleted_at IS NULL) p ON TRUE
      WHERE i.business_id = $1 AND i.deleted_at IS NULL AND i.doc_type = 'invoice' ${extra}
      ORDER BY i.issue_date DESC, i.created_at DESC
      LIMIT 300`,
    params
  );
  const today = todayInGhana();
  let invoices = rows.map((r) => ({
    id: r.id,
    number: r.number,
    status: displayStatus(r, today),
    contactName: r.contact_name,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    total: r.total,
    paid: Number(r.paid).toFixed(2),
    outstanding: Math.max(0, Number(r.total) - Number(r.paid)).toFixed(2),
  }));
  const open = invoices.filter((i) => ['sent', 'part_paid', 'overdue'].includes(i.status));
  const summary = {
    owed: open.reduce((s, i) => s + Number(i.outstanding), 0).toFixed(2),
    overdueCount: open.filter((i) => i.status === 'overdue').length,
    draftCount: invoices.filter((i) => i.status === 'draft').length,
  };
  if (status === 'unpaid') invoices = open;
  else if (status !== 'all') invoices = invoices.filter((i) => i.status === status);
  res.json({ invoices, summary });
});

// The payment details on the last invoice, so a new one can start with them.
router.get('/invoices/defaults', canView, async (req, res) => {
  const { rows } = await query(
    `SELECT payment_terms, tax_label, tax_rate FROM invoices
      WHERE business_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [req.businessId]
  );
  const today = todayInGhana();
  res.json({
    issueDate: today,
    dueDate: addDays(today, 14),
    paymentTerms: rows[0]?.payment_terms || '',
    taxLabel: rows[0]?.tax_label || '',
    taxRate: rows[0] ? Number(rows[0].tax_rate) : 0,
  });
});

router.post('/invoices', canRecord, validate(invoiceSchema), async (req, res) => {
  const v = req.valid.body;
  const issueDate = v.issueDate || todayInGhana();
  checkDate(issueDate);
  const totals = computeTotals(v.items, v.discount, v.taxRate);
  const id = await withTransaction(async (db) => {
    await checkLineProducts(db, req.businessId, v.items);
    const contactId = await resolveContact(db, req.businessId, v);
    // Next number, locked so two phones can't get the same one.
    const { rows: biz } = await db.query(
      `UPDATE businesses SET next_invoice_no = next_invoice_no + 1 WHERE id = $1
       RETURNING invoice_prefix, next_invoice_no - 1 AS n`,
      [req.businessId]
    );
    const number = `${biz[0].invoice_prefix}-${String(biz[0].n).padStart(4, '0')}`;
    const { rows } = await db.query(
      `INSERT INTO invoices (business_id, doc_type, number, contact_id, issue_date, due_date, status,
                             subtotal, discount, tax_label, tax_rate, tax_amount, total, notes, payment_terms,
                             share_token, created_by)
       VALUES ($1,'invoice',$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [req.businessId, number, contactId, issueDate, v.dueDate || null, totals.subtotal, totals.discount,
       v.taxRate > 0 ? v.taxLabel || 'Tax' : null, v.taxRate, totals.taxAmount, totals.total,
       v.notes || null, v.paymentTerms || null, crypto.randomBytes(16).toString('base64url'), req.user.id]
    );
    await replaceItems(db, rows[0].id, v.items);
    await db.query(
      `INSERT INTO audit_log (business_id, user_id, action, entity, entity_id, changes)
       VALUES ($1,$2,'create','invoice',$3,$4)`,
      [req.businessId, req.user.id, rows[0].id, JSON.stringify({ number, total: totals.total })]
    );
    return rows[0].id;
  });
  res.status(201).json({ invoice: await invoiceDetail(req.businessId, id) });
});

router.get('/invoices/:invoiceId', canView, async (req, res) => {
  res.json({ invoice: await invoiceDetail(req.businessId, req.params.invoiceId) });
});

// Edit a draft (replaces customer, dates, items and extras).
router.put('/invoices/:invoiceId', canRecord, validate(invoiceSchema), async (req, res) => {
  const v = req.valid.body;
  const totals = computeTotals(v.items, v.discount, v.taxRate);
  await withTransaction(async (db) => {
    const inv = await loadInvoice(req.businessId, req.params.invoiceId, db);
    if (inv.status !== 'draft') throw new HttpError(409, 'Only draft invoices can be edited.');
    await checkLineProducts(db, req.businessId, v.items);
    const contactId = await resolveContact(db, req.businessId, v);
    await db.query(
      `UPDATE invoices SET contact_id = $2, issue_date = $3, due_date = $4, subtotal = $5, discount = $6,
              tax_label = $7, tax_rate = $8, tax_amount = $9, total = $10, notes = $11, payment_terms = $12,
              updated_at = now()
        WHERE id = $1`,
      [inv.id, contactId, v.issueDate || inv.issue_date, v.dueDate || null, totals.subtotal, totals.discount,
       v.taxRate > 0 ? v.taxLabel || 'Tax' : null, v.taxRate, totals.taxAmount, totals.total,
       v.notes || null, v.paymentTerms || null]
    );
    await replaceItems(db, inv.id, v.items);
  });
  res.json({ invoice: await invoiceDetail(req.businessId, req.params.invoiceId) });
});

// Mark as sent (takes the goods out of stock). Safe to call again to log a re-send.
router.post('/invoices/:invoiceId/send',
  canRecord,
  validate(z.object({ via: z.enum(['whatsapp', 'sms', 'email', 'print']).default('whatsapp') })),
  async (req, res) => {
    await withTransaction(async (db) => {
      const inv = await loadInvoice(req.businessId, req.params.invoiceId, db);
      if (inv.status === 'void') throw new HttpError(409, 'This invoice was cancelled.');
      await db.query(
        `UPDATE invoices SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
                sent_via = $2, sent_at = now(), updated_at = now() WHERE id = $1`,
        [inv.id, req.valid.body.via]
      );
    });
    res.json({ invoice: await invoiceDetail(req.businessId, req.params.invoiceId) });
  }
);

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Enter the amount received.').max(1e11).transform((n) => Math.round(n * 100) / 100),
  accountId: z.uuid('Choose where the money went.'),
  date: isoDate.optional(),
  paymentRef: z.string().trim().max(80).optional().nullable(),
  momoFee: z.coerce.number().min(0).max(1e6).optional().default(0),
  note: z.string().trim().max(500).optional().nullable(),
  clientRef: z.uuid().optional().nullable(),
});

// Record money received against an invoice: a sale in the cash book, linked to it.
router.post('/invoices/:invoiceId/payments', canRecord, validate(paymentSchema), async (req, res) => {
  const p = req.valid.body;
  const date = p.date || todayInGhana();
  checkDate(date);
  if (p.clientRef) {
    const { rows } = await query('SELECT id FROM transactions WHERE client_ref = $1 AND business_id = $2',
      [p.clientRef, req.businessId]);
    if (rows[0]) return res.json({ invoice: await invoiceDetail(req.businessId, req.params.invoiceId), duplicate: true });
  }
  await withTransaction(async (db) => {
    // Lock the invoice so two payments at once can't overpay it.
    const { rows: locked } = await db.query(
      'SELECT id FROM invoices WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL FOR UPDATE',
      [isUuid(req.params.invoiceId) ? req.params.invoiceId : null, req.businessId]
    );
    if (!locked[0]) throw new HttpError(404, 'Invoice not found.');
    const inv = await loadInvoice(req.businessId, req.params.invoiceId, db);
    if (inv.status === 'draft') throw new HttpError(409, 'Send the invoice before recording a payment.');
    if (inv.status === 'void') throw new HttpError(409, 'This invoice was cancelled.');
    const outstanding = Math.round((Number(inv.total) - Number(inv.paid)) * 100) / 100;
    if (outstanding <= 0) throw new HttpError(409, 'This invoice is already fully paid.');
    if (p.amount > outstanding) {
      throw new HttpError(400, `Only GHS ${outstanding.toFixed(2)} is still owed.`, { amount: `At most ${outstanding.toFixed(2)}.` });
    }
    if (date < inv.issue_date) {
      throw new HttpError(400, 'The payment date is before the invoice date.', { date: `On or after ${inv.issue_date}.` });
    }
    await checkAccounts(db, req.businessId, [p.accountId], date);
    const { rows: cat } = await db.query(
      `SELECT id FROM categories WHERE business_id IS NULL AND kind = 'income' AND name = 'Product sales'`
    );
    await insertTransaction(db, {
      businessId: req.businessId, userId: req.user.id, kind: 'sale', date, amount: p.amount,
      accountId: p.accountId, categoryId: cat[0]?.id, contactId: inv.contact_id, invoiceId: inv.id,
      paymentRef: p.paymentRef, momoFee: p.momoFee, note: p.note || `Payment for ${inv.number}`,
      clientRef: p.clientRef,
    });
    await refreshInvoiceStatus(db, inv.id);
  });
  res.status(201).json({ invoice: await invoiceDetail(req.businessId, req.params.invoiceId) });
});

// Cancel a sent invoice: goods go back into stock. Not allowed once money was received.
router.post('/invoices/:invoiceId/void', canManage, async (req, res) => {
  await withTransaction(async (db) => {
    const inv = await loadInvoice(req.businessId, req.params.invoiceId, db);
    if (inv.status === 'void') return;
    if (inv.status === 'draft') throw new HttpError(409, 'Drafts can simply be deleted.');
    if (Number(inv.paid) > 0) {
      throw new HttpError(409, 'Money has been received for this invoice. Delete those payments in Records first.');
    }
    await db.query(`UPDATE invoices SET status = 'void', updated_at = now() WHERE id = $1`, [inv.id]);
    await db.query(
      `INSERT INTO audit_log (business_id, user_id, action, entity, entity_id) VALUES ($1,$2,'void','invoice',$3)`,
      [req.businessId, req.user.id, inv.id]
    );
  });
  res.json({ invoice: await invoiceDetail(req.businessId, req.params.invoiceId) });
});

router.delete('/invoices/:invoiceId', canRecord, async (req, res) => {
  const inv = await loadInvoice(req.businessId, req.params.invoiceId);
  if (inv.status !== 'draft') throw new HttpError(409, 'Only drafts can be deleted. Cancel a sent invoice instead.');
  await query('UPDATE invoices SET deleted_at = now() WHERE id = $1', [inv.id]);
  res.status(204).end();
});

// ---- Public, read-only view for the customer (no login) -----------------------

const publicRouter = express.Router();

publicRouter.get('/invoices/:token', async (req, res) => {
  const token = req.params.token;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new HttpError(404, 'Invoice not found.');
  const { rows } = await query(
    `SELECT i.id, i.business_id FROM invoices i
      WHERE i.share_token = $1 AND i.deleted_at IS NULL AND i.status <> 'draft'`,
    [token]
  );
  if (!rows[0]) throw new HttpError(404, 'Invoice not found.');
  const d = await invoiceDetail(rows[0].business_id, rows[0].id);
  const { rows: biz } = await query(
    `SELECT b.name, b.phone, b.email, b.town, r.name AS region, b.digital_address, b.tin, b.logo_url
       FROM businesses b LEFT JOIN regions r ON r.code = b.region_code WHERE b.id = $1`,
    [rows[0].business_id]
  );
  // Only what the customer needs: no internal ids, payment accounts or staff names.
  res.set('Cache-Control', 'no-store');
  res.json({
    business: biz[0],
    invoice: {
      number: d.number, status: d.status, issueDate: d.issueDate, dueDate: d.dueDate,
      customer: d.contact ? { name: d.contact.name, phone: d.contact.phone, address: d.contact.address } : null,
      items: d.items.map(({ description, quantity, unitPrice, lineTotal, unit }) => ({ description, quantity, unitPrice, lineTotal, unit })),
      subtotal: d.subtotal, discount: d.discount, taxLabel: d.taxLabel, taxAmount: d.taxAmount,
      total: d.total, paid: d.paid, outstanding: d.outstanding,
      notes: d.notes, paymentTerms: d.paymentTerms,
    },
  });
});

module.exports = { router, publicRouter };
