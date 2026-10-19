import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError, Icon, TopBar } from '../components.jsx';
import { money, qty, friendlyDate, STOCK_REASON, todayGhana } from '../format';
import { useT } from '../i18n.jsx';

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
  const { tt } = useT();
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
      const label = tt(ADJUST.find(([v]) => v === adj.reason)[1]);
      setFlash(tt('{label}: {quantity} {unit} recorded.', { label, quantity: adj.quantity, unit: data.product.unit }));
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
    if (!window.confirm(tt('Remove {name}? Past sales and invoices will still show it.', { name: data.product.name }))) return;
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
      <TopBar title={p?.kind === 'service' ? tt('Service') : tt('Product')} back="/stock"
        right={canManage && p ? <Link to={`/stock/${productId}/edit`} className="btn-link">{tt('Edit')}</Link> : null} />
      {error && <div className="form-error" role="alert">{error}</div>}
      {flash && <div className="flash" role="status">{flash}</div>}
      {p && (
        <>
          <h1>{p.name}</h1>
          {p.trackStock ? (
            <section className={'money-card' + (p.isLow ? ' money-card-warn' : '')} aria-label={tt('Stock on hand')}>
              <div className="money-label">{tt('In stock now')}</div>
              <div className="money-total">{qty(p.onHand)} <span className="unit">{p.unit}</span></div>
              {p.isLow && <div className="low-note"><Icon name="alert" size={18} /> {tt('At or below your warning level of {n}', { n: qty(p.reorderLevel) })}</div>}
              <div className="money-accounts">
                <div className="money-account"><div className="money-label">{tt('Cost each')}</div><div className="money-acc-val">{money(p.costPrice)}</div></div>
                <div className="money-account"><div className="money-label">{tt('Sells for')}</div><div className="money-acc-val">{money(p.sellingPrice)}</div></div>
              </div>
            </section>
          ) : (
            <p className="lead">{tt('Service · GHS {amount}. Add it to invoices; it has no stock.', { amount: money(p.sellingPrice) })}</p>
          )}

          {p.trackStock && !adjusting && (
            <div className="grid-2 actions">
              <Link to="/record/purchase" state={{ productId: p.id }} className="btn btn-ghost">{tt('Bought more')}</Link>
              <button className="btn btn-ghost" onClick={() => setAdjusting(true)}>{tt('Other change')}</button>
            </div>
          )}

          {adjusting && (
            <form className="card stack" onSubmit={saveAdjustment} noValidate>
              <h2>{tt('Change the stock')}</h2>
              <FormError message={adjMessage} />
              <fieldset className="field">
                <legend>{tt('What happened?')}</legend>
                <div className="chips">
                  {ADJUST.map(([value, label, adds]) => (
                    <label key={value} className={'chip' + (adj.reason === value ? ' chip-on' : '')}>
                      <input type="radio" name="reason" value={value} checked={adj.reason === value}
                        onChange={() => setAdj({ ...adj, reason: value })} />
                      {adds ? '+' : '−'} {tt(label)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid-2">
                <Field label={tt('How many {unit}', { unit: p.unit })} error={adjErrors.quantity}>
                  {(f) => <input {...f} type="number" inputMode="decimal" min="0" step="any" value={adj.quantity}
                    onChange={(e) => setAdj({ ...adj, quantity: e.target.value })} required />}
                </Field>
                <Field label={tt('Date')} error={adjErrors.date}>
                  {(f) => <input {...f} type="date" max={todayGhana()} value={adj.date}
                    onChange={(e) => setAdj({ ...adj, date: e.target.value })} />}
                </Field>
              </div>
              <Field label={tt('Note (optional)')} error={adjErrors.note}>
                {(f) => <input {...f} value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} />}
              </Field>
              <div className="grid-2">
                <button type="button" className="btn btn-ghost" onClick={() => setAdjusting(false)}>{tt('Cancel')}</button>
                <button className="btn btn-primary" disabled={busy}>{busy ? tt('Saving…') : tt('Save')}</button>
              </div>
              <p className="muted small">{tt('Sales and stock you buy are recorded from the Record button, so they also count in your money.')}</p>
            </form>
          )}

          {p.trackStock && (
            <section>
              <div className="card-head"><h2>{tt('History')}</h2></div>
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
                        <span className="sr-only">{n > 0 ? tt('In') : tt('Out')} </span>{n > 0 ? '+' : '−'}{qty(Math.abs(n))}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {!data.movements.length && <div className="empty">{tt('No stock changes yet.')}</div>}
            </section>
          )}

          {canManage && (
            <button className="btn-link danger-link" onClick={remove}>{p.kind === 'service' ? tt('Remove this service') : tt('Remove this product')}</button>
          )}
        </>
      )}
    </main>
  );
}
