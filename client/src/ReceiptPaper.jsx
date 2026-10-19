import { money, qty, longDate } from './format';

const PAID_BY = { cash: 'Cash', mobile_money: 'Mobile Money', bank: 'Bank' };

// A receipt as the customer sees it. Used in the app and on the public link.
export default function ReceiptPaper({ business, receipt }) {
  const showPhone = (p) => (p ? p.replace(/^\+233/, '0') : '');
  const tax = Number(receipt.tax || 0);
  return (
    <article className="paper receipt" aria-label={`Receipt ${receipt.number}`}>
      <header className="receipt-head">
        {business.logoUrl && <img className="paper-logo" src={business.logoUrl} alt="" />}
        <div className="paper-biz">{business.name}</div>
        <div className="paper-muted">{[business.town, business.region].filter(Boolean).join(', ')}</div>
        <div className="paper-muted">{showPhone(business.phone)}</div>
        {business.vatNumber ? <div className="paper-muted">VAT no. {business.vatNumber}</div>
          : business.tin && <div className="paper-muted">TIN {business.tin}</div>}
        <div className="paper-label">RECEIPT</div>
        <div className="paper-muted">No. {String(receipt.number).padStart(4, '0')} · {longDate(receipt.date)}</div>
      </header>
      {receipt.customer && <div className="receipt-line"><span>Received from</span><span className="paper-strong">{receipt.customer}</span></div>}
      {receipt.items.length > 0 ? (
        <table className="paper-table">
          <tbody>
            {receipt.items.map((it, i) => (
              <tr key={i}>
                <td>{it.name}<div className="paper-muted">{qty(it.quantity)} × {money(it.unitPrice)}</div></td>
                <td className="num">{money(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="receipt-line"><span>{receipt.invoiceNumber ? `Payment for invoice ${receipt.invoiceNumber}` : receipt.note || 'Sale'}</span></div>
      )}
      <div className="paper-totals">
        {tax > 0 && <div><span>Includes VAT, NHIL &amp; GETFund</span><span>{money(tax)}</span></div>}
        <div className="paper-grand"><span>Total paid (GHS)</span><span>{money(receipt.amount)}</span></div>
        <div><span>Paid by</span><span>{PAID_BY[receipt.paidBy] || '—'}{receipt.paymentRef ? ` · ${receipt.paymentRef}` : ''}</span></div>
      </div>
      <p className="paper-muted receipt-thanks">Thank you for your business.</p>
    </article>
  );
}
