import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { BottomNav, Icon, StatusPill } from '../components.jsx';
import { money, longDate, INVOICE_STATUS } from '../format';

const FILTERS = [
  ['all', 'All'],
  ['unpaid', 'Unpaid'],
  ['paid', 'Paid'],
  ['draft', 'Drafts'],
];

export default function Invoices() {
  const { business } = useSession();
  const location = useLocation();
  const [status, setStatus] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const flash = location.state?.flash;

  useEffect(() => {
    api(`/businesses/${business.id}/invoices`, { query: { status } }).then(setData).catch((err) => setError(err.message));
  }, [business.id, status]);

  return (
    <>
      <main className="screen with-nav">
        <header className="page-head">
          <h1>Invoices</h1>
          <Link to="/invoices/new" className="btn btn-primary btn-small"><Icon name="plus" size={18} />Invoice</Link>
        </header>
        {flash && <div className="flash" role="status">{flash}</div>}
        {error && <div className="form-error" role="alert">{error}</div>}

        {data && (
          <section className="money-card" aria-label="Owed to you">
            <div className="money-label">Customers owe you</div>
            <div className="money-total">GHS {money(data.summary.owed)}</div>
            {data.summary.overdueCount > 0 && (
              <div className="low-note"><Icon name="alert" size={18} /> {data.summary.overdueCount} overdue</div>
            )}
          </section>
        )}

        <div className="segmented" role="group" aria-label="Show">
          {FILTERS.map(([value, label]) => (
            <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>
              {label}{value === 'draft' && data?.summary.draftCount ? ` ${data.summary.draftCount}` : ''}
            </button>
          ))}
        </div>

        {data && data.invoices.length === 0 && (
          <div className="empty">
            {status === 'all'
              ? <>No invoices yet. Use an invoice when a customer will pay later, or wants a written bill.</>
              : 'Nothing here.'}
          </div>
        )}
        <ul className="txn-list">
          {data?.invoices.map((inv) => (
            <li key={inv.id}>
              <Link to={`/invoices/${inv.id}`} className="product-row">
                <div className="txn-main">
                  <div className="txn-title">{inv.contactName || 'No customer'}</div>
                  <div className="muted small">
                    {inv.number} · {inv.status === 'paid' ? `Issued ${longDate(inv.issueDate)}` : inv.dueDate ? `Due ${longDate(inv.dueDate)}` : longDate(inv.issueDate)}
                  </div>
                </div>
                <div className="qty-col">
                  <div className="txn-amt">{money(['paid', 'draft', 'void'].includes(inv.status) ? inv.total : inv.outstanding)}</div>
                  <StatusPill status={inv.status} label={INVOICE_STATUS[inv.status]} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
        <p className="center small"><Link to="/settings">Business details on your invoices</Link></p>
      </main>
      <BottomNav />
    </>
  );
}
