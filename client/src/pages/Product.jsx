import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError, Icon, TopBar } from '../components.jsx';
import { money, qty, friendlyDate, STOCK_REASON, todayGhana } from '../format';

// Reasons a person records by hand: [value, label, adds to stock?]
const ADJUST = [
  ['produced', 'Made / produced', true],
  ['return_in', 'Returned by customer', true],
  ['damaged', 'Damaged', false],
  ['expired', 'Expired', false],
  ['own_use', 'Own use', false],
  ['return_out', 'Returned to supplier', false],
];

export default function Product() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { business } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(location.state?.flash || '');
  const [adjusting, setAdjusting] = useState(false);
  const [adj, setAdj] = useState({ reason: 'produced', quantity: '', date: todayGhana(), note: '' });
  const [adjErrors, setAdjErrors] = useState({});
  const [adjMessage, setAdjMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const canManage = ['owner', 'manager'].includes(business.role);

  const load = useCallback(() => {
    api(`/businesses/${business.id}/products/${productId}`).then(setData).catch((err) => setError(err.message));
  }, [business.id, productId]);
  useEffect(load, [load]);

  async function saveAdjustment(e) {
    e.preventDefault();
    setBusy(true);
    setAdjErrors({});
    setAdjMessage('');
    try {
      await api(`/businesses/${business.id}/products/${productId}/adjust`, { method: 'POST', body: adj });
      const label = ADJUST.find(([v]) => v === adj.reason)[1];
      setFlash(`${label}: ${adj.quantity} ${data.product.unit} recorded.`);
      setAdjusting(false);
      setAdj({ ...adj, quantity: '', note: '' });
      load();
    } catch (err) {
      setAdjErrors(err.fields || {});
      setAdjMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${data.product.name}? Past sales and invoices will still show it.`)) return;
    try {
      await api(`/businesses/${business.id}/products/${productId}`, { method: 'DELETE' });
      navigate('/stock', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  const p = data?.product;
  return (
    <main className="screen">
      <TopBar title={p?.kind === 'service' ? 'Service' : 'Product'} back="/stock"
        right={canManage && p ? <Link to={`/stock/${productId}/edit`} className="btn-link">Edit</Link> : null} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {flash && <div className="flash" role="status">{flash}</div>}
      {p && (
        <>
          <h1>{p.name}</h1>
          {p.trackStock ? (
            <section className={'money-card' + (p.isLow ? ' money-card-warn' : '')} aria-label="Stock on hand">
              <div className="money-label">In stock now</div>
              <div className="money-total">{qty(p.onHand)} <span className="unit">{p.unit}</span></div>
              {p.isLow && <div className="low-note"><Icon name="alert" size={18} /> At or below your warning level of {qty(p.reorderLevel)}</div>}
              <div className="money-accounts">
                <div className="money-account"><div className="money-label">Cost each</div><div className="money-acc-val">{money(p.costPrice)}</div></div>
                <div className="money-account"><div className="money-label">Sells for</div><div className="money-acc-val">{money(p.sellingPrice)}</div></div>
              </div>
            </section>
          ) : (
            <p className="lead">Service · GHS {money(p.sellingPrice)}. Add it to invoices; it has no stock.</p>
          )}

          {p.trackStock && !adjusting && (
            <div className="grid-2 actions">
              <Link to="/record/purchase" state={{ productId: p.id }} className="btn btn-ghost">Bought more</Link>
              <button className="btn btn-ghost" onClick={() => setAdjusting(true)}>Other change</button>
            </div>
          )}

          {adjusting && (
            <form className="card stack" onSubmit={saveAdjustment} noValidate>
              <h2>Change the stock</h2>
              <FormError message={adjMessage} />
              <fieldset className="field">
                <legend>What happened?</legend>
                <div className="chips">
                  {ADJUST.map(([value, label, adds]) => (
                    <label key={value} className={'chip' + (adj.reason === value ? ' chip-on' : '')}>
                      <input type="radio" name="reason" value={value} checked={adj.reason === value}
                        onChange={() => setAdj({ ...adj, reason: value })} />
                      {adds ? '+' : '−'} {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid-2">
                <Field label={`How many ${p.unit}`} error={adjErrors.quantity}>
                  {(f) => <input {...f} type="number" inputMode="decimal" min="0" step="any" value={adj.quantity}
                    onChange={(e) => setAdj({ ...adj, quantity: e.target.value })} required />}
                </Field>
                <Field label="Date" error={adjErrors.date}>
                  {(f) => <input {...f} type="date" max={todayGhana()} value={adj.date}
                    onChange={(e) => setAdj({ ...adj, date: e.target.value })} />}
                </Field>
              </div>
              <Field label="Note (optional)" error={adjErrors.note}>
                {(f) => <input {...f} value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} />}
              </Field>
              <div className="grid-2">
                <button type="button" className="btn btn-ghost" onClick={() => setAdjusting(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              </div>
              <p className="muted small">Sales and stock you buy are recorded from the Record button, so they also count in your money.</p>
            </form>
          )}

          {p.trackStock && (
            <section>
              <div className="card-head"><h2>History</h2></div>
              <ul className="txn-list">
                {data.movements.map((m) => {
                  const n = Number(m.quantity);
                  return (
                    <li key={m.id} className="txn">
                      <div className={'txn-dot ' + (n > 0 ? 'in' : 'out')} aria-hidden="true">
                        <Icon name={n > 0 ? 'plus' : 'minus'} size={18} />
                      </div>
                      <div className="txn-main">
                        <div className="txn-title">
                          {STOCK_REASON[m.reason]}{m.invoiceNumber ? ` · ${m.invoiceNumber}` : ''}
                        </div>
                        <div className="muted small">{friendlyDate(m.date)} · {m.by}{m.note ? ` · ${m.note}` : ''}</div>
                      </div>
                      <div className={'txn-amt ' + (n > 0 ? 'pos' : 'neg')}>
                        <span className="sr-only">{n > 0 ? 'In' : 'Out'} </span>{n > 0 ? '+' : '−'}{qty(Math.abs(n))}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {!data.movements.length && <div className="empty">No stock changes yet.</div>}
            </section>
          )}

          {canManage && (
            <button className="btn-link danger-link" onClick={remove}>Remove this {p.kind}</button>
          )}
        </>
      )}
    </main>
  );
}
