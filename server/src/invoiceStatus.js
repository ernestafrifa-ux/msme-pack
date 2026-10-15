// Keeps an invoice's stored status in step with the payments recorded against it.
// Drafts and void invoices are left alone. ('Overdue' is worked out when read, from the due date.)
async function refreshInvoiceStatus(db, invoiceId) {
  await db.query(
    `UPDATE invoices inv
        SET status = CASE
              WHEN paid.total >= inv.total THEN 'paid'
              WHEN paid.total > 0 THEN 'part_paid'
              ELSE 'sent' END,
            updated_at = now()
       FROM (SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
              WHERE invoice_id = $1 AND deleted_at IS NULL) paid
      WHERE inv.id = $1 AND inv.status NOT IN ('draft', 'void')`,
    [invoiceId]
  );
}

module.exports = { refreshInvoiceStatus };
