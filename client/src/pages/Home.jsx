import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { BottomNav, Icon } from '../components.jsx';
import { money, monthName, qty } from '../format';
import { TxnRow } from './Records.jsx';
import { useT, DraftLanguageBanner } from '../i18n.jsx';

function greetingKey() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Accra' }).format(new Date()));
  if (h < 12) return 'home.morning';
  if (h < 17) return 'home.afternoon';
  return 'home.evening';
}

export default function Home() {
  const { user, business } = useSession();
  const { t } = useT();
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
            <div className="muted">{t(greetingKey())}, {user.fullName.split(' ')[0]}</div>
            <h1 className="biz-name">{business.name}</h1>
          </div>
          <Link to="/settings" className="icon-btn" aria-label={t('home.settings')}><Icon name="settings" /></Link>
        </header>

        <DraftLanguageBanner />
        {flash && <div className="flash" role="status">{flash}</div>}
        {error && <div className="form-error" role="alert">{error}</div>}

        <section className="money-card" aria-label={t('home.moneyNow')}>
          <div className="money-label">{t('home.moneyNow')}</div>
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
          <Link to="/record/sale" className="quick-btn"><span className="q-in"><Icon name="plus" size={26} /></span>{t('home.quick.sale')}</Link>
          <Link to="/record/expense" className="quick-btn"><span className="q-out"><Icon name="minus" size={26} /></span>{t('home.quick.expense')}</Link>
          <Link to="/record/purchase" className="quick-btn"><span className="q-move"><Icon name="box" size={26} /></span>{t('home.quick.buy')}</Link>
          <Link to="/invoices/new" className="quick-btn"><span className="q-in"><Icon name="file" size={26} /></span>{t('home.quick.invoice')}</Link>
        </div>

        {data && (data.lowStock.length > 0 || Number(data.owed.total) > 0) && (
          <section aria-label={t('home.attention')}>
            <div className="card-head"><h2>{t('home.attention')}</h2></div>
            <div className="alerts">
              {Number(data.owed.total) > 0 && (
                <Link to="/invoices" className={'alert' + (data.owed.overdueCount ? ' alert-warn' : '')}>
                  <Icon name="file" size={20} />
                  <span>
                    {t('home.owed', { amount: money(data.owed.total) })}
                    {data.owed.overdueCount > 0 && <>, {t('home.overdue', { n: data.owed.overdueCount })}</>}
                  </span>
                </Link>
              )}
              {data.lowStock.map((p) => (
                <Link key={p.id} to={`/stock/${p.id}`} className="alert alert-warn">
                  <Icon name="alert" size={20} />
                  <span>{t('home.low', { name: p.name, qty: qty(p.onHand), unit: p.unit })}</span>
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
                <span className="small muted">{t('home.health', { score: health.latest.overallScore })}{health.recommendations[0] ? ` · ${t('home.nextStep')}` : ''}</span>
                <span className="txn-title wrap">{health.recommendations[0] ? health.recommendations[0].title : t('home.seeResult')}</span>
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          ) : (
            <Link to="/health" className="health-card">
              <span className="health-score health-score-new" aria-hidden="true"><Icon name="pulse" size={22} /></span>
              <span className="txn-main">
                <span className="txn-title wrap">{t('home.healthQ')}</span>
                <span className="small muted">{health.inProgress ? t('home.healthContinue') : t('home.healthTake')}</span>
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          )
        )}

        <section className="card">
          <div className="card-head">
            <h2>{t('home.month')}</h2>
            <span className="muted">{data ? monthName(data.month, t) : ''}</span>
          </div>
          <div className="stats">
            <div><div className="muted small">{t('home.sales')}</div><div className="stat">{money(data?.summary.sales)}</div></div>
            <div><div className="muted small">{t('home.expenses')}</div><div className="stat">{money(data?.summary.expenses)}</div></div>
            <div><div className="muted small">{t('home.profit')}</div>
              <div className={'stat ' + (Number(data?.summary.netProfitEstimate) < 0 ? 'neg' : 'pos')}>
                {money(data?.summary.netProfitEstimate)}
              </div></div>
          </div>
          <p className="muted small">{t('home.profitNote')}</p>
          {Number(data?.summary.ownerPay) > 0 && (
            <p className="owner-pay small">{t('home.ownerPay', { amount: money(data.summary.ownerPay) })}</p>
          )}
        </section>

        <section>
          <div className="card-head">
            <h2>{t('home.latest')}</h2>
            <Link to="/records">{t('home.seeAll')}</Link>
          </div>
          {data && data.recent.length === 0 && (
            <div className="empty">{t('home.empty')}</div>
          )}
          <ul className="txn-list">
            {data?.recent.map((x) => <TxnRow key={x.id} txn={x} showDate />)}
          </ul>
        </section>
      </main>
      <BottomNav />
    </>
  );
}
