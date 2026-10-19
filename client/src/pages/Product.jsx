import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError, Icon, TopBar } from '../components.jsx';
import { money, qty, friendlyDate, STOCK_REASON, todayGhana } from '../format';
import { useT } from '../i18n.jsx';

// Reasons a person records by hand: [value, label, adds to stock?]. Goods made go through
// the "Made some" form instead, so the ingredients used come out of stock with them.
const ADJUST = [
  ['used', 'Used in the work', false],
  ['return_in', 'Returned by customer', true],
  ['damaged', 'Damaged', false],
  ['expired', 'Expired', false],
  ['own_use', 'Own use', false],
  ['return_out', 'Returned to supplier', false],
];
const reasonsFor = (kind) => ADJUST.filter(([v]) => kind !== 'supply' || v !== 'return_in');

// Goods made from ingredients in stock: what was used, and what each one cost to make.
function MakeForm({ product, businessId, onDone, onCancel }) {
  const { tt } = useT();
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ quantity: '', date: todayGhana(), note: '' });
  const [used, setUsed] = useState([{ productId: '', quantity: '' }]);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/businesses/${businessId}/products`)
      .then((d) => setItems(d.products.filter((x) => x.trackStock && x.id !== product.id)))
      .catch((err) => setMessage(err.message));
  }, [businessId, product.id]);
  const byId = Object.fromEntries((items || []).map((x) => [x.id, x]));
  const lines = used.filter((u) => u.productId && Number(u.quantity) > 0);
  const cost = lines.reduce((s, u) => s + Number(u.quantity) * Number(byId[u.productId]?.costPrice || 0), 0);
  const each = Number(form.quantity) > 0 ? cost / Number(form.quantity) : 0;
  const setLine = (i, k, v) => setUsed(used.map((u, j) => (j === i ? { ...u, [k]: v } : u)));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage('');
    try {
      const body = { ...form, used: lines.map((u) => ({ productId: u.productId, quantity: u.quantity })) };
      const r = await api(`/businesses/${businessId}/products/${product.id}/make`, { method: 'POST', body });
      onDone(lines.length
        ? tt('{quantity} {unit} made. They cost GHS {each} each to make (GHS {total} in all).', { quantity: form.quantity, unit: product.unit, each: money(r.unitCost), total: money(r.batchCost) })
        : tt('{quantity} {unit} made.', { quantity: form.quantity, unit: product.unit }));
    } catch (err) {
      setErrors(err.fields || {}); setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={save} noValidate>
      <h2>{tt('Made some')}</h2>
      <FormError message={message} />
      <div className="grid-2">
        <Field label={tt('How many {unit} made', { unit: product.unit })} error={errors.quantity}>
          {(f) => <input {...f} type="number" inputMode="decimal" min="0" step="any" value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />}
        </Field>
        <Field label={tt('Date')} error={errors.date}>
          {(f) => <input {...f} type="date" max={todayGhana()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}
        </Field>
      </div>
      <fieldset className="field">
        <legend>{tt('What did you use from stock?')}</legend>
        <div className="stack-tight">
          {used.map((u, i) => (
            <div key={i} className="grid-2">
              <select aria-label={tt('Ingredient {n}', { n: i + 1 })} value={u.productId} onChange={(e) => setLine(i, 'productId', e.target.value)}>
                <option value="">{tt('Choose…')}</option>
                {(items || []).map((x) => <option key={x.id} value={x.id}>{x.name} ({qty(x.onHand)} {x.unit})</option>)}
              </select>
              <input type="number" inputMode="decimal" min="0" step="any" aria-label={tt('How much of ingredient {n}', { n: i + 1 })}
                placeholder={u.productId ? byId[u.productId]?.unit : tt('How much')} value={u.quantity}
                onChange={(e) => setLine(i, 'quantity', e.target.value)} />
            </div>
          ))}
          <button type="button" className="btn-link" onClick={() => setUsed([...used, { productId: '', quantity: '' }])}>{tt('+ Add another')}</button>
        </div>
        {errors.used && <p className="field-error">{errors.used}</p>}
      </fieldset>
      {lines.length > 0 && (
        <div className="statement-row small">
          <span>{tt('Cost of what you used')}</span>
          <span className="strong">GHS {money(cost)}{Number(form.quantity) > 0 ? ` · ${tt('GHS {each} each', { each: money(each) })}` : ''}</span>
        </div>
      )}
      <p className="muted small">{lines.length
        ? tt('The ingredients come out of stock now. Their cost counts in your profit when the goods are sold.')
        : tt('Ingredients kept in stock (as “Used in work”)? Choose them above and the app works out what each one cost to make. If you bought them as expenses, leave this empty.')}</p>
      <Field label={tt('Note (optional)')} error={errors.note}>
        {(f) => <input {...f} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}
      </Field>
      <div className="grid-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{tt('Cancel')}</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? tt('Saving…') : tt('Save')}</button>
      </div>
    </form>
  );
}

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
  const [making, setMaking] = useState(false);
  const [adj, setAdj] = useState({ reason: 'used', quantity: '', date: todayGhana(), note: '' });
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
      <TopBar title={p?.kind === 'service' ? tt('Service') : p?.kind === 'supply' ? tt('Used in work') : tt('Product')} back="/stock"
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
                {p.kind === 'supply'
                  ? <div className="money-account"><div className="money-label">{tt('Value')}</div><div className="money-acc-val">{money(p.valueAtCost)}</div></div>
                  : <div className="money-account"><div className="money-label">{tt('Sells for')}</div><div className="money-acc-val">{money(p.sellingPrice)}</div></div>}
              </div>
            </section>
          ) : (
            <p className="lead">{tt('Service · GHS {amount}. Add it to invoices; it has no stock.', { amount: money(p.sellingPrice) })}</p>
          )}

          {p.kind === 'supply' && <p className="muted small">{tt('Kept for use in your work, not for sale. Record what you use, or count it now and then: what is gone was used, and its cost counts in your profit.')}</p>}

          {p.trackStock && !adjusting && !making && (
            <div className="grid-2 actions">
              <Link to="/record/purchase" state={{ productId: p.id }} className="btn btn-ghost">{tt('Bought more')}</Link>
              <button className="btn btn-ghost" onClick={() => { setAdj({ ...adj, reason: 'used' }); setAdjusting(true); }}>{tt('Used in work')}</button>
              {p.kind === 'product' && <button className="btn btn-ghost" onClick={() => setMaking(true)}>{tt('Made some')}</button>}
              <button className="btn btn-ghost" onClick={() => { setAdj({ ...adj, reason: 'damaged' }); setAdjusting(true); }}>{tt('Other change')}</button>
            </div>
          )}

          {making && (
            <MakeForm product={p} businessId={business.id} onCancel={() => setMaking(false)}
              onDone={(msg) => { setMaking(false); setFlash(msg); load(); }} />
          )}

          {adjusting && (
            <form className="card stack" onSubmit={saveAdjustment} noValidate>
              <h2>{tt('Change the stock')}</h2>
              <FormError message={adjMessage} />
              <fieldset className="field">
                <legend>{tt('What happened?')}</legend>
                <div className="chips">
                  {reasonsFor(p.kind).map(([value, label, adds]) => (
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
              {adj.reason === 'used' && <p className="muted small">{tt('Used up doing the work, like relaxer on a client. Its cost counts as a cost of your sales, not a loss.')}</p>}
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
                          {tt(STOCK_REASON[m.reason])}{m.invoiceNumber ? ` · ${m.invoiceNumber}` : ''}
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
            <button className="btn-link danger-link" onClick={remove}>{p.kind === 'service' ? tt('Remove this service') : p.kind === 'supply' ? tt('Remove this supply') : tt('Remove this product')}</button>
          )}
        </>
      )}
    </main>
  );
}
