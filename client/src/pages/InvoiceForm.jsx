import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError, Icon, ProductPicker, TopBar } from '../components.jsx';
import { money, todayGhana, addDaysIso } from '../format';

let lineKey = 0;
const newLine = (over = {}) => ({ key: ++lineKey, productId: null, description: '', quantity: 1, unitPrice: '', ...over });

export default function InvoiceForm() {
  const { invoiceId } = useParams();
  const editing = !!invoiceId;
  const navigate = useNavigate();
  const { business } = useSession();
  const [contacts, setContacts] = useState([]);
  const [products, setProducts] = useState([]);
  const [customer, setCustomer] = useState({ mode: 'existing', contactId: '', name: '', phone: '' });
  const [form, setForm] = useState({
    issueDate: todayGhana(), dueDate: addDaysIso(todayGhana(), 14), discount: '', taxLabel: '', taxRate: '',
    notes: '', paymentTerms: '',
  });
  const [lines, setLines] = useState([]);
  const [picking, setPicking] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const base = `/businesses/${business.id}`;
    Promise.all([api(`${base}/contacts`), api(`${base}/products`), editing ? api(`${base}/invoices/${invoiceId}`) : api(`${base}/invoices/defaults`)])
      .then(([c, p, third]) => {
        setContacts(c.contacts);
        setProducts(p.products);
        if (!c.contacts.length) setCustomer((s) => ({ ...s, mode: 'new' }));
        if (editing) {
          const inv = third.invoice;
          if (inv.status !== 'draft') return navigate(`/invoices/${invoiceId}`, { replace: true });
          setCustomer({ mode: 'existing', contactId: inv.contact?.id || '', name: '', phone: '' });
          setForm({
            issueDate: inv.issueDate, dueDate: inv.dueDate || '', discount: Number(inv.discount) ? inv.discount : '',
            taxLabel: inv.taxLabel || '', taxRate: Number(inv.taxRate) ? Number(inv.taxRate) : '',
            notes: inv.notes || '', paymentTerms: inv.paymentTerms || '',
          });
          setLines(inv.items.map((i) => newLine({ productId: i.productId, description: i.description, quantity: Number(i.quantity), unitPrice: i.unitPrice })));
          if (Number(inv.taxRate) || inv.notes) setShowMore(true);
        } else {
          setForm((f) => ({ ...f, paymentTerms: third.paymentTerms, taxLabel: third.taxLabel, taxRate: third.taxRate || '' }));
          if (third.taxRate) setShowMore(true);
        }
      })
      .catch((err) => setMessage(err.message));
  }, [business.id, editing, invoiceId, navigate]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setLine = (key, k, v) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l)));

  const cents = (n) => Math.round(Number(n || 0) * 100);
  const subtotal = lines.reduce((s, l) => s + cents(Number(l.quantity || 0) * Number(l.unitPrice || 0)), 0);
  const taxable = Math.max(0, subtotal - cents(form.discount));
  const tax = Math.round((taxable * Number(form.taxRate || 0)) / 100);
  const total = (taxable + tax) / 100;

  function addProduct(p) {
    setLines((ls) => [...ls, newLine({ productId: p.id, description: p.name, unitPrice: p.sellingPrice })]);
    setPicking(false);
  }

  async function save(sendAfter) {
    setBusy(true);
    setErrors({});
    setMessage('');
    const body = {
      issueDate: form.issueDate,
      dueDate: form.dueDate || null,
      items: lines.map((l) => ({ productId: l.productId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice || 0 })),
      discount: form.discount || 0,
      taxLabel: form.taxLabel || null,
      taxRate: form.taxRate || 0,
      notes: form.notes || null,
      paymentTerms: form.paymentTerms || null,
    };
    if (customer.mode === 'new') body.newContact = { name: customer.name, phone: customer.phone || null };
    else body.contactId = customer.contactId || null;
    try {
      const { invoice } = editing
        ? await api(`/businesses/${business.id}/invoices/${invoiceId}`, { method: 'PUT', body })
        : await api(`/businesses/${business.id}/invoices`, { method: 'POST', body });
      navigate(`/invoices/${invoice.id}`, { replace: true, state: { justSaved: true, openSend: sendAfter } });
    } catch (err) {
      setErrors(err.fields || {});
      setMessage(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <TopBar title={editing ? 'Edit draft' : 'New invoice'} back={editing ? `/invoices/${invoiceId}` : '/invoices'} />
      <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); save(true); }}>
        <FormError message={message} />

        <fieldset className="field">
          <legend>Customer</legend>
          {contacts.length > 0 && (
            <div className="segmented" role="group" aria-label="Customer">
              <button type="button" aria-pressed={customer.mode === 'existing'} onClick={() => setCustomer({ ...customer, mode: 'existing' })}>Saved customer</button>
              <button type="button" aria-pressed={customer.mode === 'new'} onClick={() => setCustomer({ ...customer, mode: 'new' })}>New customer</button>
            </div>
          )}
          {customer.mode === 'existing' ? (
            <Field label="Choose customer" error={errors.contactId}>
              {(p) => (
                <select {...p} value={customer.contactId} onChange={(e) => setCustomer({ ...customer, contactId: e.target.value })}>
                  <option value="">Choose…</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone.replace('+233', '0')}` : ''}</option>)}
                </select>
              )}
            </Field>
          ) : (
            <div className="grid-2">
              <Field label="Name" error={errors['newContact.name'] || errors.contactId}>
                {(p) => <input {...p} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />}
              </Field>
              <Field label="Phone (for WhatsApp)" error={errors['newContact.phone']}>
                {(p) => <input {...p} type="tel" inputMode="tel" placeholder="024 123 4567" value={customer.phone}
                  onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />}
              </Field>
            </div>
          )}
        </fieldset>

        <section className="field" aria-label="Items">
          <div className="field-label">Items</div>
          {lines.length > 0 && (
            <ul className="lines">
              {lines.map((l, i) => (
                <li key={l.key} className="line">
                  <div className="line-top">
                    {l.productId ? (
                      <span className="line-name">{l.description}</span>
                    ) : (
                      <label className="line-desc">
                        <span className="sr-only">Description of item {i + 1}</span>
                        <input value={l.description} placeholder="Describe the item or service"
                          onChange={(e) => setLine(l.key, 'description', e.target.value)} aria-invalid={!!errors[`items.${i}.description`]} />
                      </label>
                    )}
                    <button type="button" className="icon-btn small-btn" aria-label={`Remove ${l.description || 'item'}`}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Icon name="close" size={16} /></button>
                  </div>
                  <div className="line-controls">
                    <label className="qty-input">
                      <span className="sr-only">Quantity of {l.description || `item ${i + 1}`}</span>
                      <input type="number" inputMode="decimal" min="0" step="any" value={l.quantity}
                        onChange={(e) => setLine(l.key, 'quantity', e.target.value)} />
                    </label>
                    <span className="muted small">×</span>
                    <label className="price-input">
                      <span className="sr-only">Price of one {l.description || `item ${i + 1}`} (GHS)</span>
                      <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={l.unitPrice}
                        onChange={(e) => setLine(l.key, 'unitPrice', e.target.value)} />
                    </label>
                    <span className="line-total">{money(Number(l.quantity || 0) * Number(l.unitPrice || 0))}</span>
                  </div>
                  {(errors[`items.${i}.description`] || errors[`items.${i}.quantity`]) && (
                    <div className="field-error">{errors[`items.${i}.description`] || errors[`items.${i}.quantity`]}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {picking ? (
            <ProductPicker products={products} onPick={addProduct} onClose={() => setPicking(false)} />
          ) : (
            <div className="grid-2">
              <button type="button" className="btn btn-ghost dashed" onClick={() => setPicking(true)} disabled={!products.length}>
                <Icon name="plus" size={18} /> Product
              </button>
              <button type="button" className="btn btn-ghost dashed" onClick={() => setLines((ls) => [...ls, newLine()])}>
                <Icon name="plus" size={18} /> Other item
              </button>
            </div>
          )}
          {errors.items && <div className="field-error">{errors.items}</div>}
        </section>

        <div className="grid-2">
          <Field label="Invoice date" error={errors.issueDate}>
            {(p) => <input {...p} type="date" max={todayGhana()} value={form.issueDate} onChange={set('issueDate')} />}
          </Field>
          <Field label="Pay by" error={errors.dueDate}>
            {(p) => <input {...p} type="date" min={form.issueDate} value={form.dueDate} onChange={set('dueDate')} />}
          </Field>
        </div>

        <Field label="Discount (GHS, optional)" error={errors.discount}>
          {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
            value={form.discount} onChange={set('discount')} />}
        </Field>

        <Field label="How to pay you" error={errors.paymentTerms} hint="Shown on the invoice, e.g. your MoMo number and name">
          {(p) => <textarea {...p} rows={2} value={form.paymentTerms} onChange={set('paymentTerms')}
            placeholder="MoMo 024 123 4567 (Ama Mensah)" />}
        </Field>

        {showMore ? (
          <>
            <div className="grid-2">
              <Field label="Tax name" error={errors.taxLabel} hint="Only if you are registered">
                {(p) => <input {...p} value={form.taxLabel} onChange={set('taxLabel')} placeholder="e.g. VAT" />}
              </Field>
              <Field label="Tax rate (%)" error={errors.taxRate} hint="Ask your tax office">
                {(p) => <input {...p} type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.taxRate}
                  onChange={set('taxRate')} placeholder="0" />}
              </Field>
            </div>
            <Field label="Note to customer (optional)" error={errors.notes}>
              {(p) => <textarea {...p} rows={2} value={form.notes} onChange={set('notes')} placeholder="Thank you for your business." />}
            </Field>
          </>
        ) : (
          <button type="button" className="btn-link align-start" onClick={() => setShowMore(true)}>+ Tax or a note to the customer</button>
        )}

        <div className="totals card">
          <div><span>Subtotal</span><span>{money(subtotal / 100)}</span></div>
          {cents(form.discount) > 0 && <div><span>Discount</span><span>−{money(form.discount)}</span></div>}
          {tax > 0 && <div><span>{form.taxLabel || 'Tax'} ({Number(form.taxRate)}%)</span><span>{money(tax / 100)}</span></div>}
          <div className="totals-grand"><span>Total</span><span>GHS {money(total)}</span></div>
        </div>

        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save and send'}</button>
        <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => save(false)}>Save as draft</button>
      </form>
    </main>
  );
}
