import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError, TopBar } from '../components.jsx';
import { useT } from '../i18n.jsx';

const UNITS = ['piece', 'jar', 'bottle', 'tub', 'tube', 'sachet', 'pack', 'bag', 'crate', 'carton', 'kg', 'litre', 'yard', 'tray'];

const KIND_HINT = {
  product: 'Something you sell. Keep count of it in stock.',
  service: 'Work you charge for, like braiding or a manicure. No stock.',
  supply: 'Bought and used in your work, not sold: relaxer, shampoo, flour, packaging. Its cost counts when it is used.',
};

export default function ProductForm() {
  const { tt } = useT();
  const { productId } = useParams();
  const editing = !!productId;
  const navigate = useNavigate();
  const { business } = useSession();
  const [form, setForm] = useState({
    name: '', kind: 'product', unit: 'piece', costPrice: '', sellingPrice: '', reorderLevel: '', openingQty: '', sku: '',
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api(`/businesses/${business.id}/products/${productId}`)
      .then(({ product: p }) => setForm({
        name: p.name, kind: p.kind, unit: p.unit, costPrice: p.costPrice, sellingPrice: p.sellingPrice,
        reorderLevel: Number(p.reorderLevel), openingQty: '', sku: p.sku || '',
      }))
      .catch((err) => setMessage(err.message));
  }, [editing, business.id, productId]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isService = form.kind === 'service';
  const isSupply = form.kind === 'supply';
  const margin = Number(form.sellingPrice) - Number(form.costPrice);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    const body = {
      name: form.name,
      unit: form.unit,
      sku: form.sku || null,
      costPrice: form.costPrice || 0,
      sellingPrice: isSupply ? 0 : form.sellingPrice || 0,
      reorderLevel: form.reorderLevel || 0,
    };
    if (editing && !isService) body.kind = form.kind;
    try {
      if (editing) {
        await api(`/businesses/${business.id}/products/${productId}`, { method: 'PATCH', body });
        navigate(`/stock/${productId}`, { replace: true });
      } else {
        const { product } = await api(`/businesses/${business.id}/products`, {
          method: 'POST',
          body: { ...body, kind: form.kind, openingQty: isService ? 0 : form.openingQty || 0 },
        });
        navigate(`/stock/${product.id}`, { replace: true, state: { flash: tt('{name} added.', { name: product.name }) } });
      }
    } catch (err) {
      setErrors(err.fields || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <TopBar title={editing ? (isSupply ? tt('Edit supply') : tt('Edit product')) : tt('New product')} back={editing ? `/stock/${productId}` : '/stock'} />
      <form onSubmit={submit} className="stack" noValidate>
        <FormError message={message} />
        {(!editing || !isService) && (
          <div className="stack-tight">
            <div className="segmented" role="group" aria-label={tt('Type')}>
              <button type="button" aria-pressed={form.kind === 'product'} onClick={() => setForm({ ...form, kind: 'product' })}>{tt('For sale')}</button>
              {!editing && <button type="button" aria-pressed={isService} onClick={() => setForm({ ...form, kind: 'service' })}>{tt('Service')}</button>}
              <button type="button" aria-pressed={isSupply} onClick={() => setForm({ ...form, kind: 'supply' })}>{tt('Used in work')}</button>
            </div>
            <p className="small muted">{tt(KIND_HINT[form.kind])}</p>
          </div>
        )}
        <Field label={isService ? tt('Service name') : isSupply ? tt('Item name') : tt('Product name')} error={errors.name}>
          {(p) => <input {...p} value={form.name} onChange={set('name')} placeholder={isService ? tt('e.g. Braiding') : isSupply ? tt('e.g. Relaxer, or Flour') : tt('e.g. Shito 250ml jar')} required />}
        </Field>

        {!isService && (
          <Field label={tt('Counted in')} error={errors.unit}>
            {(p) => (
              <select {...p} value={form.unit} onChange={set('unit')}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                {!UNITS.includes(form.unit) && <option value={form.unit}>{form.unit}</option>}
              </select>
            )}
          </Field>
        )}

        <div className="grid-2">
          {!isService && (
            <Field label={tt('Cost price (GHS)')} error={errors.costPrice} hint={tt('What one costs you')}>
              {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                value={form.costPrice} onChange={set('costPrice')} />}
            </Field>
          )}
          {!isSupply && (
            <Field label={tt('Selling price (GHS)')} error={errors.sellingPrice} hint={isService ? undefined : tt('What you charge')}>
              {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                value={form.sellingPrice} onChange={set('sellingPrice')} />}
            </Field>
          )}
        </div>
        {form.kind === 'product' && form.costPrice !== '' && form.sellingPrice !== '' && (
          <p className={'small ' + (margin < 0 ? 'neg' : 'muted')}>
            {margin < 0
              ? tt('You would lose GHS {amount} on each one.', { amount: Math.abs(margin).toFixed(2) })
              : Number(form.sellingPrice) > 0
                ? tt('You make GHS {amount} on each one ({pct}% of the price).', { amount: margin.toFixed(2), pct: Math.round((margin / Number(form.sellingPrice)) * 100) })
                : tt('You make GHS {amount} on each one.', { amount: margin.toFixed(2) })}
          </p>
        )}

        {!isService && (
          <div className="grid-2">
            {!editing && (
              <Field label={tt('How many you have now')} error={errors.openingQty}>
                {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="any" placeholder="0"
                  value={form.openingQty} onChange={set('openingQty')} />}
              </Field>
            )}
            <Field label={tt('Warn me below')} error={errors.reorderLevel} hint={editing ? tt('Shows "Low" at or below this') : undefined}>
              {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="any" placeholder="0"
                value={form.reorderLevel} onChange={set('reorderLevel')} />}
            </Field>
          </div>
        )}

        <Field label={tt('Product code (optional)')} error={errors.sku}>
          {(p) => <input {...p} value={form.sku} onChange={set('sku')} />}
        </Field>

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? tt('Saving…') : editing ? tt('Save changes') : isService ? tt('Add service') : isSupply ? tt('Add supply') : tt('Add product')}
        </button>
      </form>
    </main>
  );
}
