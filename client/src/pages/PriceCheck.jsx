import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Field, TopBar } from '../components.jsx';
import { money } from '../format';
import { useT } from '../i18n.jsx';

const n = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v));

// Check a price before setting it: profit per item, margin, markup, and how many to sell to cover monthly costs.
export default function PriceCheck() {
  const { tt } = useT();
  const { business } = useSession();
  const canManage = ['owner', 'manager'].includes(business.role);
  const [products, setProducts] = useState([]);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [productId, setProductId] = useState('');
  const [f, setF] = useState({ cost: '', extra: '', mode: 'margin', margin: '30', price: '', fixed: '' });
  const [flash, setFlash] = useState('');

  useEffect(() => {
    api(`/businesses/${business.id}/products`).then((d) => setProducts(d.products)).catch(() => {});
    api(`/businesses/${business.id}`).then((d) => setVatRegistered(!!d.business.vatRegistered)).catch(() => {});
  }, [business.id]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  function pick(id) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) setF({ ...f, cost: Number(p.costPrice) ? p.costPrice : '', price: Number(p.sellingPrice) ? p.sellingPrice : '', mode: Number(p.sellingPrice) ? 'price' : f.mode });
  }

  const unitCost = n(f.cost) + n(f.extra);
  // Suggested price: cost ÷ (1 − margin), to the pesewa, then up to the next 50 pesewas.
  const exact = n(f.margin) < 100 && unitCost > 0 ? Math.round((unitCost / (1 - n(f.margin) / 100)) * 100) / 100 : 0;
  const rounded = Math.ceil(exact * 2 - 1e-9) / 2;
  const price = f.mode === 'margin' ? rounded : n(f.price);
  const profit = price - unitCost;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const markup = unitCost > 0 ? (profit / unitCost) * 100 : 0;
  const breakEven = profit > 0 && n(f.fixed) > 0 ? Math.ceil(n(f.fixed) / profit) : null;
  const product = products.find((x) => x.id === productId);

  async function usePrice() {
    await api(`/businesses/${business.id}/products/${productId}`, { method: 'PATCH', body: { sellingPrice: rounded } });
    setProducts(products.map((p) => (p.id === productId ? { ...p, sellingPrice: rounded.toFixed(2) } : p)));
    setFlash(tt('{name} now sells at GHS {amount}.', { name: product.name, amount: money(rounded) }));
  }

  return (
    <main className="screen">
      <TopBar title={tt('Price checker')} back="/reports" />
      <p className="lead">{tt('See what you really make on each item before you set a price.')} <Link to="/learn/price-for-profit">{tt('How to price for profit')}</Link></p>
      {flash && <div className="flash" role="status">{flash}</div>}
      <form className="card stack" onSubmit={(e) => e.preventDefault()}>
        {products.length > 0 && (
          <Field label={tt('Product (optional)')}>
            {(p) => (
              <select {...p} value={productId} onChange={(e) => pick(e.target.value)}>
                <option value="">{tt('Type the numbers yourself')}</option>
                {products.filter((x) => x.kind === 'product').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            )}
          </Field>
        )}
        <div className="grid-2">
          <Field label={tt('Cost of one (GHS)')} hint={tt('What you pay the supplier')}>
            {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" value={f.cost} onChange={set('cost')} />}
          </Field>
          <Field label={tt('Other costs per one (GHS)')} hint={tt('Transport, packaging…')}>
            {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" value={f.extra} onChange={set('extra')} placeholder="0.00" />}
          </Field>
        </div>
        <div className="segmented" role="group" aria-label={tt('How do you want to check?')}>
          <button type="button" aria-pressed={f.mode === 'margin'} onClick={() => setF({ ...f, mode: 'margin' })}>{tt('Suggest a price')}</button>
          <button type="button" aria-pressed={f.mode === 'price'} onClick={() => setF({ ...f, mode: 'price' })}>{tt('Check my price')}</button>
        </div>
        {f.mode === 'margin' ? (
          <Field label={tt('Margin you want (%)')} hint={tt('The share of the price you keep. 30% is common for shops.')}>
            {(p) => <input {...p} type="number" inputMode="decimal" min="0" max="95" step="1" value={f.margin} onChange={set('margin')} />}
          </Field>
        ) : (
          <Field label={tt('Your selling price (GHS)')}>
            {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" value={f.price} onChange={set('price')} />}
          </Field>
        )}
        <Field label={tt('Monthly running costs (GHS, optional)')} hint={tt('Rent, wages, electricity… to see how many you must sell')}>
          {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" value={f.fixed} onChange={set('fixed')} />}
        </Field>
      </form>

      {unitCost > 0 && price > 0 && (
        <section className="card stack-tight price-result" aria-live="polite">
          <div className="statement-row"><span>{f.mode === 'margin' ? tt('Sell at') : tt('Selling price')}</span><span className="stat">GHS {money(price)}</span></div>
          {f.mode === 'margin' && rounded !== exact && <div className="small muted">{tt('({amount} rounded up to the next 50 pesewas)', { amount: money(exact) })}</div>}
          {vatRegistered && <div className="statement-row small"><span>{tt('With VAT, NHIL & GETFund (20%)')}</span><span>GHS {money(price * 1.2)}</span></div>}
          <div className="statement-row"><span>{tt('Profit on each')}</span><span className={profit < 0 ? 'neg strong' : 'pos-text strong'}>GHS {money(profit)}</span></div>
          <div className="statement-row small"><span>{tt('Margin (share of the price you keep)')}</span><span>{margin.toFixed(1)}%</span></div>
          <div className="statement-row small"><span>{tt('Markup (added on top of cost)')}</span><span>{markup.toFixed(1)}%</span></div>
          {breakEven && <div className="statement-row small"><span>{tt('To cover monthly costs, sell at least')}</span><span className="strong">{tt('{n} a month', { n: breakEven.toLocaleString() })}</span></div>}
          {profit <= 0 && <p className="warn-text small">{tt('At this price you lose money on every sale.')}</p>}
          {product && canManage && f.mode === 'margin' && (
            <button type="button" className="btn btn-ghost btn-block" onClick={usePrice}>{tt('Use GHS {amount} as {name}’s price', { amount: money(rounded), name: product.name })}</button>
          )}
        </section>
      )}
    </main>
  );
}
