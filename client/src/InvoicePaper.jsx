import { money, qty, longDate } from './format';

// The invoice as the customer sees it. Used in the app and on the public link.
export default function InvoicePaper({ business, invoice, customer }) {
  const showPhone = (p) => (p ? p.replace(/^\+233/, '0') : '');
  return (
    <article className="paper" aria-label={`Invoice ${invoice.number}`}>
      <header className="paper-head">
        <div>
          <div className="paper-biz">{business.name}</div>
          <div className="paper-muted">
            {[business.town, business.region].filter(Boolean).join(', ')}
            {business.digitalAddress || business.digital_address ? ` · ${business.digitalAddress || business.digital_address}` : ''}
          </div>
          <div className="paper-muted">
            {[showPhone(business.phone), business.email].filter(Boolean).join(' · ')}
          </div>
          {business.tin && <div className="paper-muted">TIN {business.tin}</div>}
        </div>
        <div className="paper-right">
          <div className="paper-label">INVOICE</div>
          <div>{invoice.number}</div>
        </div>
      </header>

      <div className="paper-meta">
        <div>
          <div className="paper-muted">Bill to</div>
          <div className="paper-strong">{customer?.name || '—'}</div>
          {customer?.phone && <div className="paper-muted">{showPhone(customer.phone)}</div>}
          {customer?.address && <div className="paper-muted">{customer.address}</div>}
        </div>
        <div className="paper-right">
          <div className="paper-muted">Date</div>
          <div>{longDate(invoice.issueDate)}</div>
          {invoice.dueDate && (<><div className="paper-muted">Pay by</div><div>{longDate(invoice.dueDate)}</div></>)}
        </div>
      </div>

      <table className="paper-table">
        <thead>
          <tr><th scope="col">Item</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Price</th><th scope="col" className="num">Amount</th></tr>
        </thead>
        <tbody>
          {invoice.items.map((it, i) => (
            <tr key={i}>
              <td>{it.description}</td>
              <td className="num">{qty(it.quantity)}</td>
              <td className="num">{money(it.unitPrice)}</td>
              <td className="num">{money(it.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="paper-totals">
        <div><span>Subtotal</span><span>{money(invoice.subtotal)}</span></div>
        {Number(invoice.discount) > 0 && <div><span>Discount</span><span>−{money(invoice.discount)}</span></div>}
        {invoice.taxScheme === 'vat' ? (
          <>
            {Number(invoice.discount) > 0 && <div><span>Before tax</span><span>{money(invoice.taxable)}</span></div>}
            <div><span>NHIL (2.5%)</span><span>{money(invoice.nhil)}</span></div>
            <div><span>GETFund (2.5%)</span><span>{money(invoice.getfund)}</span></div>
            <div><span>VAT (15%)</span><span>{money(invoice.vat)}</span></div>
          </>
        ) : Number(invoice.taxAmount) > 0 && <div><span>{invoice.taxLabel || 'Tax'}</span><span>{money(invoice.taxAmount)}</span></div>}
        <div className="paper-grand"><span>Total (GHS)</span><span>{money(invoice.total)}</span></div>
        {Number(invoice.paid) > 0 && <div><span>Paid</span><span>−{money(invoice.paid)}</span></div>}
        {Number(invoice.paid) > 0 && <div className="paper-strong"><span>Still to pay</span><span>{money(invoice.outstanding)}</span></div>}
      </div>

      {invoice.paymentTerms && (
        <div className="paper-note"><div className="paper-muted">How to pay</div><div className="pre">{invoice.paymentTerms}</div></div>
      )}
      {invoice.notes && <div className="paper-note pre">{invoice.notes}</div>}
      {invoice.status === 'paid' && <div className="paper-stamp" aria-label="Paid in full">PAID</div>}
      {invoice.status === 'void' && <div className="paper-stamp paper-stamp-void" aria-label="Cancelled">CANCELLED</div>}
    </article>
  );
}
