import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { BottomNav, Icon } from '../components.jsx';
import { money, monthName, qty } from '../format';
import { TxnRow } from './Records.jsx';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Accra' }).format(new Date()));
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const { user, business } = useSession();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const flash = location.state?.flash;

  useEffect(() => {
    api(`/businesses/${business.id}/dashboard`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [business.id]);

  return (
    <>
      <main className="screen with-nav">
        <header className="home-head">
          <div>
            <div className="muted">{greeting()}, {user.fullName.split(' ')[0]}</div>
            <h1 className="biz-name">{business.name}</h1>
          </div>
          <Link to="/settings" className="icon-btn" aria-label="Business details and log out"><Icon name="settings" /></Link>
        </header>

        {flash && <div className="flash" role="status">{flash}</div>}
        {error && <div className="form-error" role="alert">{error}</div>}

        <section className="money-card" aria-label="Money you have now">
          <div className="money-label">Money you have now</div>
          <div className="money-total">GHS {data ? money(data.totalBalance) : '…'}</div>
          <div className="money-accounts">
            {data?.accounts.map((a) => (
              <div key={a.id} className="money-account">
                <div className="money-label">{a.name}</div>
                <div className="money-acc-val">{money(a.balance)}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="quick">
          <Link to="/record/sale" className="quick-btn"><span className="q-in"><Icon name="plus" size={26} /></span>Sale</Link>
          <Link to="/record/expense" className="quick-btn"><span className="q-out"><Icon name="minus" size={26} /></span>Expense</Link>
          <Link to="/record/purchase" className="quick-btn"><span className="q-move"><Icon name="box" size={26} /></span>Buy stock</Link>
          <Link to="/invoices/new" className="quick-btn"><span className="q-in"><Icon name="file" size={26} /></span>Invoice</Link>
        </div>

        {data && (data.lowStock.length > 0 || Number(data.owed.total) > 0) && (
          <section aria-label="Needs attention">
            <div className="card-head"><h2>Needs attention</h2></div>
            <div className="alerts">
              {Number(data.owed.total) > 0 && (
                <Link to="/invoices" className={'alert' + (data.owed.overdueCount ? ' alert-warn' : '')}>
                  <Icon name="file" size={20} />
                  <span>
                    Customers owe you <strong>GHS {money(data.owed.total)}</strong>
                    {data.owed.overdueCount > 0 && <>, {data.owed.overdueCount} overdue</>}
                  </span>
                </Link>
              )}
              {data.lowStock.map((p) => (
                <Link key={p.id} to={`/stock/${p.id}`} className="alert alert-warn">
                  <Icon name="alert" size={20} />
                  <span><strong>{p.name}</strong> is running low: {qty(p.onHand)} {p.unit} left</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <div className="card-head">
            <h2>This month</h2>
            <span className="muted">{data ? monthName(data.month) : ''}</span>
          </div>
          <div className="stats">
            <div><div className="muted small">Sales</div><div className="stat">{money(data?.summary.sales)}</div></div>
            <div><div className="muted small">Expenses</div><div className="stat">{money(data?.summary.expenses)}</div></div>
            <div><div className="muted small">Est. profit</div>
              <div className={'stat ' + (Number(data?.summary.netProfitEstimate) < 0 ? 'neg' : 'pos')}>
                {money(data?.summary.netProfitEstimate)}
              </div></div>
          </div>
          <p className="muted small">Money in, minus spending, MoMo charges and the cost of products sold this month.</p>
        </section>

        <section>
          <div className="card-head">
            <h2>Latest records</h2>
            <Link to="/records">See all</Link>
          </div>
          {data && data.recent.length === 0 && (
            <div className="empty">
              No records yet. Tap <strong>Sale</strong> when you sell something.
            </div>
          )}
          <ul className="txn-list">
            {data?.recent.map((t) => <TxnRow key={t.id} t={t} showDate />)}
          </ul>
        </section>
      </main>
      <BottomNav />
    </>
  );
}
