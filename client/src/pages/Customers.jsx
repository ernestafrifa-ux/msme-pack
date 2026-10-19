import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Icon, TopBar } from '../components.jsx';
import { money, friendlyDate } from '../format';

// Customers and what each one owes: sales paid later and unpaid invoices.
export default function Customers() {
  const { business } = useSession();
  const { t, tt } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    api(`/businesses/${business.id}/customers`).then(setData).catch((err) => setError(err.message));
  }, [business.id]);
  const list = (data?.customers || []).filter((c) => !q || `${c.name} ${c.phone || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <main className="screen">
      <TopBar title={tt('Customers who owe')} back="/" />
      <p className="lead">{tt('Sales paid later and unpaid invoices. Record a sale as “Paid later” on the Sale screen.')}</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {data && (
        <>
          <section className="money-card small-card">
            <div className="money-label">{tt('Customers owe you')}</div>
            <div className="money-total">GHS {money(data.totalOwed)}</div>
          </section>
          {data.customers.length > 6 && (
            <label className="field"><span className="field-label">{tt('Search')}</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt('Name or phone')} /></label>
          )}
          <ul className="txn-list">
            {list.map((c) => (
              <li key={c.id}>
                <Link to={`/customers/${c.id}`} className="txn report-link">
                  <span className="txn-main">
                    <span className="txn-title wrap">{c.name}</span>
                    <span className="small muted">
                      {Number(c.owes) > 0 ? tt('{openCount} unpaid', { openCount: c.openCount }) : tt('Nothing owed')}
                      {Number(c.overdue) > 0 ? tt(' · GHS {amount} late', { amount: money(c.overdue) }) : ''}
                      {c.lastPaid ? tt(' · last paid {date}', { date: friendlyDate(c.lastPaid, t) }) : ''}
                    </span>
                  </span>
                  <span className={'txn-amt' + (Number(c.overdue) > 0 ? ' neg' : '')}>{money(c.owes)}</span>
                  <Icon name="chevron" size={18} />
                </Link>
              </li>
            ))}
          </ul>
          {!data.customers.length && <p className="muted">{tt('No customers yet. They are added when you sell on credit or send an invoice.')}</p>}
        </>
      )}
    </main>
  );
}
