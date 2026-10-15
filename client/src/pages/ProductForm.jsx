import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError, TopBar } from '../components.jsx';

const UNITS = ['piece', 'jar', 'bottle', 'sachet', 'pack', 'bag', 'crate', 'carton', 'kg', 'litre', 'yard', 'tray'];

export default function ProductForm() {
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
      sellingPrice: form.sellingPrice || 0,
      reorderLevel: form.reorderLevel || 0,
    };
    try {
      if (editing) {
        await api(`/businesses/${business.id}/products/${productId}`, { method: 'PATCH', body });
        navigate(`/stock/${productId}`, { replace: true });
      } else {
        const { product } = await api(`/businesses/${business.id}/products`, {
          method: 'POST',
          body: { ...body, kind: form.kind, openingQty: isService ? 0 : form.openingQty || 0 },
        });
        navigate(`/stock/${product.id}`, { replace: true, state: { flash: `${product.name} added.` } });
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
      <TopBar title={editing ? 'Edit product' : 'New product'} back={editing ? `/stock/${productId}` : '/stock'} />
      <form onSubmit={submit} className="stack" noValidate>
        <FormError message={message} />
        {!editing && (
          <div className="segmented" role="group" aria-label="Type">
            <button type="button" aria-pressed={!isService} onClick={() => setForm({ ...form, kind: 'product' })}>Product</button>
            <button type="button" aria-pressed={isService} onClick={() => setForm({ ...form, kind: 'service' })}>Service</button>
          </div>
        )}
        <Field label={isService ? 'Service name' : 'Product name'} error={errors.name}>
          {(p) => <input {...p} value={form.name} onChange={set('name')} placeholder={isService ? 'e.g. Catering per tray' : 'e.g. Shito 250ml jar'} required />}
        </Field>

        {!isService && (
          <Field label="Counted in" error={errors.unit}>
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
            <Field label="Cost price (GHS)" error={errors.costPrice} hint="What one costs you">
              {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                value={form.costPrice} onChange={set('costPrice')} />}
            </Field>
          )}
          <Field label="Selling price (GHS)" error={errors.sellingPrice} hint={isService ? undefined : 'What you charge'}>
            {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
              value={form.sellingPrice} onChange={set('sellingPrice')} />}
          </Field>
        </div>
        {!isService && form.costPrice !== '' && form.sellingPrice !== '' && (
          <p className={'small ' + (margin < 0 ? 'neg' : 'muted')}>
            {margin < 0 ? 'You would lose' : 'You make'} GHS {Math.abs(margin).toFixed(2)} on each one
            {Number(form.sellingPrice) > 0 && margin >= 0 ? ` (${Math.round((margin / Number(form.sellingPrice)) * 100)}% of the price)` : ''}.
          </p>
        )}

        {!isService && (
          <div className="grid-2">
            {!editing && (
              <Field label="How many you have now" error={errors.openingQty}>
                {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="any" placeholder="0"
                  value={form.openingQty} onChange={set('openingQty')} />}
              </Field>
            )}
            <Field label="Warn me below" error={errors.reorderLevel} hint={editing ? 'Shows "Low" at or below this' : undefined}>
              {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="any" placeholder="0"
                value={form.reorderLevel} onChange={set('reorderLevel')} />}
            </Field>
          </div>
        )}

        <Field label="Product code (optional)" error={errors.sku}>
          {(p) => <input {...p} value={form.sku} onChange={set('sku')} />}
        </Field>

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : isService ? 'Add service' : 'Add product'}
        </button>
      </form>
    </main>
  );
}
