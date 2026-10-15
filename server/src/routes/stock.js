// Products and stock. Mounted at /api/businesses/:businessId.
// Stock on hand is never stored: it is the sum of the stock_movements ledger.
const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireMember } = require('../auth');
const { HttpError, validate } = require('../http');
const { todayInGhana, addDays } = require('../dates');

const router = express.Router({ mergeParams: true });

const canView = requireMember();
const canRecord = requireMember(['owner', 'manager', 'staff']);
const canManage = requireMember(['owner', 'manager']);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15.');
const price = z.coerce.number().min(0, 'Cannot be negative.').max(1e9).transform((n) => Math.round(n * 100) / 100);
const qty = z.coerce.number().max(1e9).transform((n) => Math.round(n * 1000) / 1000);
const uuidParam = (id) => /^[0-9a-f-]{36}$/i.test(id || '');

const PRODUCT_SELECT = `
  SELECT p.*,
         COALESCE((SELECT SUM(m.quantity) FROM stock_movements m WHERE m.product_id = p.id), 0) AS on_hand
    FROM products p`;

function publicProduct(p) {
  const onHand = Number(p.on_hand);
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    kind: p.kind,
    unit: p.unit,
    costPrice: p.cost_price,
    sellingPrice: p.selling_price,
    trackStock: p.track_stock,
    reorderLevel: p.reorder_level,
    onHand: p.track_stock ? p.on_hand : null,
    valueAtCost: p.track_stock ? (onHand * Number(p.cost_price)).toFixed(2) : null,
    isLow: p.track_stock ? onHand <= Number(p.reorder_level) : false,
    isActive: p.is_active,
  };
}

async function loadProduct(businessId, id, db = { query }) {
  if (!uuidParam(id)) throw new HttpError(404, 'Product not found.');
  const { rows } = await db.query(
    `${PRODUCT_SELECT} WHERE p.id = $1 AND p.business_id = $2 AND p.deleted_at IS NULL`,
    [id, businessId]
  );
  if (!rows[0]) throw new HttpError(404, 'Product not found.');
  return rows[0];
}

// ---- Products ---------------------------------------------------------------

const listSchema = z.object({
  q: z.string().trim().max(80).optional(),
  lowOnly: z.enum(['true', 'false']).optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
});

router.get('/products', canView, validate(listSchema, 'query'), async (req, res) => {
  const q = req.valid.query;
  const params = [req.businessId];
  const where = ['p.business_id = $1', 'p.deleted_at IS NULL'];
  if (q.includeInactive !== 'true') where.push('p.is_active');
  if (q.q) {
    params.push(`%${q.q}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
  }
  const { rows } = await query(`${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY lower(p.name)`, params);
  let products = rows.map(publicProduct);
  if (q.lowOnly === 'true') products = products.filter((p) => p.isLow);
  const tracked = products.filter((p) => p.trackStock);
  res.json({
    products,
    summary: {
      count: products.length,
      lowCount: tracked.filter((p) => p.isLow).length,
      valueAtCost: tracked.reduce((s, p) => s + Math.max(0, Number(p.valueAtCost)), 0).toFixed(2),
    },
  });
});

const productSchema = z.object({
  name: z.string().trim().min(2, 'Enter the product name.').max(120),
  sku: z.string().trim().max(40).optional().nullable(),
  kind: z.enum(['product', 'service']).default('product'),
  unit: z.string().trim().min(1).max(30).default('piece'),
  costPrice: price.default(0),
  sellingPrice: price.default(0),
  reorderLevel: qty.refine((n) => n >= 0, 'Cannot be negative.').default(0),
});

const createProductSchema = productSchema.extend({
  openingQty: qty.refine((n) => n >= 0, 'Cannot be negative.').default(0),
});

router.post('/products', canManage, validate(createProductSchema), async (req, res) => {
  const p = req.valid.body;
  const trackStock = p.kind === 'product';
  const id = await withTransaction(async (db) => {
    let rows;
    try {
      ({ rows } = await db.query(
        `INSERT INTO products (business_id, name, sku, kind, unit, cost_price, selling_price, track_stock, reorder_level)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [req.businessId, p.name, p.sku || null, p.kind, p.unit, p.costPrice, p.sellingPrice, trackStock, p.reorderLevel]
      ));
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'Another product already uses that code.', { sku: 'Already used.' });
      throw err;
    }
    if (trackStock && p.openingQty > 0) {
      await db.query(
        `INSERT INTO stock_movements (business_id, product_id, movement_date, reason, quantity, unit_cost, note, created_by)
         VALUES ($1, $2, $3, 'opening', $4, $5, 'Opening stock', $6)`,
        [req.businessId, rows[0].id, todayInGhana(), p.openingQty, p.costPrice, req.user.id]
      );
    }
    return rows[0].id;
  });
  res.status(201).json({ product: publicProduct(await loadProduct(req.businessId, id)) });
});

router.get('/products/:productId', canView, async (req, res) => {
  const p = await loadProduct(req.businessId, req.params.productId);
  const { rows } = await query(
    `SELECT m.id, m.movement_date, m.reason, m.quantity, m.unit_cost, m.note, m.created_at,
            u.full_name AS by_name, inv.number AS invoice_number, t.kind AS txn_kind
       FROM stock_movements m
       JOIN users u ON u.id = m.created_by
       LEFT JOIN invoice_items ii ON ii.id = m.invoice_item_id
       LEFT JOIN invoices inv ON inv.id = ii.invoice_id
       LEFT JOIN transaction_items ti ON ti.id = m.transaction_item_id
       LEFT JOIN transactions t ON t.id = ti.transaction_id
      WHERE m.product_id = $1
      ORDER BY m.movement_date DESC, m.created_at DESC
      LIMIT 100`,
    [p.id]
  );
  res.json({
    product: publicProduct(p),
    movements: rows.map((m) => ({
      id: m.id,
      date: m.movement_date,
      reason: m.reason,
      quantity: m.quantity,
      unitCost: m.unit_cost,
      note: m.note,
      invoiceNumber: m.invoice_number,
      by: m.by_name,
    })),
  });
});

router.patch('/products/:productId', canManage, validate(productSchema.partial().extend({ isActive: z.boolean().optional() })), async (req, res) => {
  const existing = await loadProduct(req.businessId, req.params.productId);
  const p = req.valid.body;
  const cols = {
    name: p.name, sku: p.sku, unit: p.unit, cost_price: p.costPrice, selling_price: p.sellingPrice,
    reorder_level: p.reorderLevel, is_active: p.isActive,
  };
  const sets = [];
  const params = [];
  for (const [col, val] of Object.entries(cols)) {
    if (val === undefined) continue;
    params.push(val === '' ? null : val);
    sets.push(`${col} = $${params.length}`);
  }
  if (sets.length) {
    params.push(existing.id);
    try {
      await query(`UPDATE products SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'Another product already uses that code.', { sku: 'Already used.' });
      throw err;
    }
  }
  res.json({ product: publicProduct(await loadProduct(req.businessId, existing.id)) });
});

// Remove from lists. History stays, so past sales and invoices still show it.
router.delete('/products/:productId', canManage, async (req, res) => {
  const p = await loadProduct(req.businessId, req.params.productId);
  await query('UPDATE products SET deleted_at = now(), is_active = FALSE, updated_at = now() WHERE id = $1', [p.id]);
  res.status(204).end();
});

// ---- Adjustments and stock counts ----------------------------------------------

// Reasons a person records by hand, and whether they add (+1) or remove (-1) stock.
const ADJUST_SIGN = { produced: 1, return_in: 1, damaged: -1, expired: -1, own_use: -1, return_out: -1 };

const adjustSchema = z.object({
  reason: z.enum(Object.keys(ADJUST_SIGN)),
  quantity: qty.refine((n) => n > 0, 'Enter how many.'),
  date: isoDate.optional(),
  note: z.string().trim().max(300).optional().nullable(),
});

router.post('/products/:productId/adjust', canRecord, validate(adjustSchema), async (req, res) => {
  const p = await loadProduct(req.businessId, req.params.productId);
  if (!p.track_stock) throw new HttpError(400, 'Stock is not tracked for this item.');
  const a = req.valid.body;
  const date = a.date || todayInGhana();
  if (date > addDays(todayInGhana(), 1)) throw new HttpError(400, 'The date cannot be in the future.', { date: 'Date is in the future.' });
  await query(
    `INSERT INTO stock_movements (business_id, product_id, movement_date, reason, quantity, unit_cost, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [req.businessId, p.id, date, a.reason, ADJUST_SIGN[a.reason] * a.quantity, p.cost_price, a.note || null, req.user.id]
  );
  res.status(201).json({ product: publicProduct(await loadProduct(req.businessId, p.id)) });
});

const countSchema = z.object({
  date: isoDate.optional(),
  counts: z
    .array(z.object({ productId: z.uuid(), counted: qty.refine((n) => n >= 0, 'Cannot be negative.') }))
    .min(1, 'Count at least one item.')
    .max(500),
});

// Physical count: records the difference between what's on the shelf and the books.
router.post('/stock-count', canRecord, validate(countSchema), async (req, res) => {
  const { counts } = req.valid.body;
  const date = req.valid.body.date || todayInGhana();
  const ids = counts.map((c) => c.productId);
  const changed = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `${PRODUCT_SELECT} WHERE p.business_id = $1 AND p.id = ANY($2::uuid[]) AND p.deleted_at IS NULL AND p.track_stock
       FOR UPDATE OF p`,
      [req.businessId, ids]
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const result = [];
    for (const c of counts) {
      const p = byId.get(c.productId);
      if (!p) throw new HttpError(400, 'One of the items was not found.');
      const diff = Math.round((c.counted - Number(p.on_hand)) * 1000) / 1000;
      if (diff === 0) continue;
      await db.query(
        `INSERT INTO stock_movements (business_id, product_id, movement_date, reason, quantity, unit_cost, note, created_by)
         VALUES ($1,$2,$3,'count_adjustment',$4,$5,$6,$7)`,
        [req.businessId, p.id, date, diff, p.cost_price, `Counted ${c.counted}, books said ${Number(p.on_hand)}`, req.user.id]
      );
      result.push({ productId: p.id, name: p.name, before: Number(p.on_hand), counted: c.counted, difference: diff });
    }
    return result;
  });
  res.status(201).json({ changed });
});

module.exports = { router, loadProduct, publicProduct };
