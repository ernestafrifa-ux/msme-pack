import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { BottomNav, Icon } from '../components.jsx';
import { money, qty } from '../format';
import { useT } from '../i18n.jsx';

export default function Stock() {
  const { tt } = useT();
  const { business } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const canManage = ['owner', 'manager'].includes(business.role);
  const flash = useLocation().state?.flash;

  useEffect(() => {
    api(`/businesses/${business.id}/products`).then(setData).catch((err) => setError(err.message));
  }, [business.id]);

  const products = (data?.products || []).filter(
    (p) => (!lowOnly || p.isLow) && p.name.toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <>
      <main className="screen with-nav">
        <header className="page-head">
          <h1>{tt('Stock')}</h1>
          {canManage && (
            <Link to="/stock/new" className="btn btn-primary btn-small"><Icon name="plus" size={18} />{tt('Product')}</Link>
          )}
        </header>
        {flash && <div className="flash" role="status">{flash}</div>}
        {error && <div className="form-error" role="alert">{error}</div>}

        {data && (
          <div className="grid-2 tiles">
            <div className="tile">
              <div className="muted small">{tt('Stock value (at cost)')}</div>
              <div className="tile-val">GHS {money(data.summary.valueAtCost)}</div>
            </div>
            <div className={'tile' + (data.summary.lowCount ? ' tile-warn' : '')}>
              <div className="small">{tt('Running low')}</div>
              <div className="tile-val">{data.summary.lowCount === 1 ? tt('1 item') : tt('{n} items', { n: data.summary.lowCount })}</div>
            </div>
          </div>
        )}

        {data && data.products.length === 0 ? (
          <div className="empty">
            <p><strong>{tt('No products yet.')}</strong></p>
            <p>{tt('Add what you sell, with how many you have now. Sales and invoices will then keep the count for you.')}</p>
            {canManage && <Link to="/stock/new" className="btn btn-primary">{tt('Add your first product')}</Link>}
          </div>
        ) : (
          <>
            <label className="search search-field">
              <Icon name="search" size={20} />
              <span className="sr-only">{tt('Search products')}</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt('Search products')} />
            </label>
            <div className="segmented" role="group" aria-label={tt('Show')}>
              <button aria-pressed={!lowOnly} onClick={() => setLowOnly(false)}>{tt('All')} {data?.summary.count ?? ''}</button>
              <button aria-pressed={lowOnly} onClick={() => setLowOnly(true)}>{tt('Running low')} {data?.summary.lowCount ?? ''}</button>
            </div>
            <ul className="txn-list product-list">
              {products.map((p) => {
                const pct = p.trackStock
                  ? Math.max(0, Math.min(100, (Number(p.onHand) / Math.max(1, Number(p.reorderLevel) * 2)) * 100))
                  : 0;
                return (
                  <li key={p.id}>
                    <Link to={`/stock/${p.id}`} className="product-row">
                      <div className="txn-main">
                        <div className="txn-title">
                          {p.name} {p.kind === 'supply' && <span className="pill pill-draft">{tt('Used in work')}</span>} {p.isLow && <span className="pill pill-overdue">{tt('Low')}</span>}
                        </div>
                        {p.trackStock ? (
                          <div className="bar" aria-hidden="true"><div className={p.isLow ? 'bar-low' : ''} style={{ width: pct + '%' }} /></div>
                        ) : (
                          <div className="muted small">{tt('Service')} · GHS {money(p.sellingPrice)}</div>
                        )}
                      </div>
                      {p.trackStock && (
                        <div className="qty-col">
                          <div className="txn-amt">{qty(p.onHand)}</div>
                          <div className="muted small">{p.unit}</div>
                        </div>
                      )}
                      <Icon name="chevron" size={18} />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {data && !products.length && <div className="empty">{tt('No products match.')}</div>}
            {data && data.products.some((p) => p.trackStock) && (
              <Link to="/stock/count" className="btn btn-ghost btn-block dashed">{tt('Do a stock count')}</Link>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}
