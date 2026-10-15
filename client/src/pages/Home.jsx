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
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const flash = location.state?.flash;

  useEffect(() => {
    api(`/businesses/${business.id}/dashboard`)
      .then(setData)
      .catch((err) => setError(err.message));
    api(`/businesses/${business.id}/health`).then(setHealth).catch(() => {});
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

        {health && (
          health.latest ? (
            <Link to={health.recommendations[0] ? `/learn/${health.recommendations[0].slug}` : '/health'} className="health-card">
              <span className="health-score" aria-hidden="true">{health.latest.overallScore}</span>
              <span className="txn-main">
                <span className="small muted">Business health {health.latest.overallScore}/100{health.recommendations[0] ? ' · your next step' : ''}</span>
                <span className="txn-title wrap">{health.recommendations[0] ? health.recommendations[0].title : 'See your result'}</span>
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          ) : (
            <Link to="/health" className="health-card">
              <span className="health-score health-score-new" aria-hidden="true"><Icon name="pulse" size={22} /></span>
              <span className="txn-main">
                <span className="txn-title wrap">How healthy is your business?</span>
                <span className="small muted">{health.inProgress ? 'Continue your health check' : 'Take the 5-minute check and get your next steps'}</span>
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          )
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
