import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError, Icon, ProductPicker, TopBar } from '../components.jsx';
import { money, todayGhana, addDaysIso } from '../format';
import { vatOn } from '../tax';
import { useT } from '../i18n.jsx';

let lineKey = 0;
const newLine = (over = {}) => ({ key: ++lineKey, productId: null, description: '', quantity: 1, unitPrice: '', ...over });

export default function InvoiceForm() {
  const { tt } = useT();
  const { invoiceId } = useParams();
  const editing = !!invoiceId;
  const navigate = useNavigate();
  const { business } = useSession();
  const [contacts, setContacts] = useState([]);
  const [products, setProducts] = useState([]);
  const [customer, setCustomer] = useState({ mode: 'existing', contactId: '', name: '', phone: '' });
  const [form, setForm] = useState({
    issueDate: todayGhana(), dueDate: addDaysIso(todayGhana(), 14), discount: '', taxLabel: '', taxRate: '',
    notes: '', paymentTerms: '', taxScheme: 'none',
  });
  const [vatRegistered, setVatRegistered] = useState(false);
  const [lines, setLines] = useState([]);
  const [picking, setPicking] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const base = `/businesses/${business.id}`;
    Promise.all([api(`${base}/contacts`), api(`${base}/products`), editing ? api(`${base}/invoices/${invoiceId}`) : null, api(`${base}/invoices/defaults`)])
      .then(([c, p, detail, defaults]) => {
        const third = editing ? detail : defaults;
        setVatRegistered(!!defaults.vatRegistered || (editing && detail.invoice.taxScheme === 'vat'));
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
            taxScheme: inv.taxScheme || (Number(inv.taxRate) ? 'custom' : 'none'),
          });
          setLines(inv.items.map((i) => newLine({ productId: i.productId, description: i.description, quantity: Number(i.quantity), unitPrice: i.unitPrice })));
          if (inv.taxScheme === 'custom' || inv.notes) setShowMore(true);
        } else {
          const scheme = third.taxScheme || (third.taxRate ? 'custom' : 'none');
          setForm((f) => ({ ...f, paymentTerms: third.paymentTerms, taxScheme: scheme,
            taxLabel: scheme === 'custom' ? third.taxLabel : '', taxRate: scheme === 'custom' ? third.taxRate || '' : '' }));
          if (scheme === 'custom') setShowMore(true);
        }
      })
      .catch((err) => setMessage(err.message));
  }, [business.id, editing, invoiceId, navigate]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setLine = (key, k, v) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l)));

  const cents = (n) => Math.round(Number(n || 0) * 100);
  const subtotal = lines.reduce((s, l) => s + cents(Number(l.quantity || 0) * Number(l.unitPrice || 0)), 0);
  const taxable = Math.max(0, subtotal - cents(form.discount));
  const vat = form.taxScheme === 'vat' ? vatOn(taxable / 100) : null;
  const customRate = form.taxScheme === 'custom' ? Number(form.taxRate || 0) : 0;
  const tax = vat ? cents(vat.tax) : Math.round((taxable * customRate) / 100);
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
      taxScheme: form.taxScheme,
      taxLabel: form.taxScheme === 'custom' ? form.taxLabel || null : null,
      taxRate: form.taxScheme === 'custom' ? form.taxRate || 0 : 0,
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
      <TopBar title={editing ? tt('Edit draft') : tt('New invoice')} back={editing ? `/invoices/${invoiceId}` : '/invoices'} />
      <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); save(true); }}>
        <FormError message={message} />

        <fieldset className="field">
          <legend>{tt('Customer')}</legend>
          {contacts.length > 0 && (
            <div className="segmented" role="group" aria-label={tt('Customer')}>
              <button type="button" aria-pressed={customer.mode === 'existing'} onClick={() => setCustomer({ ...customer, mode: 'existing' })}>{tt('Saved customer')}</button>
              <button type="button" aria-pressed={customer.mode === 'new'} onClick={() => setCustomer({ ...customer, mode: 'new' })}>{tt('New customer')}</button>
            </div>
          )}
          {customer.mode === 'existing' ? (
            <Field label={tt('Choose customer')} error={errors.contactId}>
              {(p) => (
                <select {...p} value={customer.contactId} onChange={(e) => setCustomer({ ...customer, contactId: e.target.value })}>
                  <option value="">{tt('Choose…')}</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone.replace('+233', '0')}` : ''}</option>)}
                </select>
              )}
            </Field>
          ) : (
            <div className="grid-2">
              <Field label={tt('Name')} error={errors['newContact.name'] || errors.contactId}>
                {(p) => <input {...p} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />}
              </Field>
              <Field label={tt('Phone (for WhatsApp)')} error={errors['newContact.phone']}>
                {(p) => <input {...p} type="tel" inputMode="tel" placeholder="024 123 4567" value={customer.phone}
                  onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />}
              </Field>
            </div>
          )}
        </fieldset>

        <section className="field" aria-label={tt('Items')}>
          <div className="field-label">{tt('Items')}</div>
          {lines.length > 0 && (
            <ul className="lines">
              {lines.map((l, i) => (
                <li key={l.key} className="line">
                  <div className="line-top">
                    {l.productId ? (
                      <span className="line-name">{l.description}</span>
                    ) : (
                      <label className="line-desc">
                        <span className="sr-only">{tt('Description of item {i}', { i: i + 1 })}</span>
                        <input value={l.description} placeholder={tt('Describe the item or service')}
                          onChange={(e) => setLine(l.key, 'description', e.target.value)} aria-invalid={!!errors[`items.${i}.description`]} />
                      </label>
                    )}
                    <button type="button" className="icon-btn small-btn" aria-label={tt('Remove {item}', { item: l.description || 'item' })}
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Icon name="close" size={16} /></button>
                  </div>
                  <div className="line-controls">
                    <label className="qty-input">
                      <span className="sr-only">{tt('Quantity of {item}', { item: l.description || tt('item {i}', { i: i + 1 }) })}</span>
                      <input type="number" inputMode="decimal" min="0" step="any" value={l.quantity}
                        onChange={(e) => setLine(l.key, 'quantity', e.target.value)} />
                    </label>
                    <span className="muted small">×</span>
                    <label className="price-input">
                      <span className="sr-only">{tt('Price of one {item} (GHS)', { item: l.description || tt('item {i}', { i: i + 1 }) })}</span>
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
                <Icon name="plus" size={18} /> {tt('Product')}</button>
              <button type="button" className="btn btn-ghost dashed" onClick={() => setLines((ls) => [...ls, newLine()])}>
                <Icon name="plus" size={18} /> {tt('Other item')}</button>
            </div>
          )}
          {errors.items && <div className="field-error">{errors.items}</div>}
        </section>

        <div className="grid-2">
          <Field label={tt('Invoice date')} error={errors.issueDate}>
            {(p) => <input {...p} type="date" max={todayGhana()} value={form.issueDate} onChange={set('issueDate')} />}
          </Field>
          <Field label={tt('Pay by')} error={errors.dueDate}>
            {(p) => <input {...p} type="date" min={form.issueDate} value={form.dueDate} onChange={set('dueDate')} />}
          </Field>
        </div>

        <Field label={tt('Discount (GHS, optional)')} error={errors.discount}>
          {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
            value={form.discount} onChange={set('discount')} />}
        </Field>

        <Field label={tt('How to pay you')} error={errors.paymentTerms} hint={tt('Shown on the invoice, e.g. your MoMo number and name')}>
          {(p) => <textarea {...p} rows={2} value={form.paymentTerms} onChange={set('paymentTerms')}
            placeholder={tt('MoMo 024 123 4567 (Ama Mensah)')} />}
        </Field>

        {vatRegistered && (
          <label className="check-row top">
            <input type="checkbox" checked={form.taxScheme === 'vat'}
              onChange={(e) => setForm({ ...form, taxScheme: e.target.checked ? 'vat' : 'none' })} />
            <span>{tt('Add VAT, NHIL & GETFund (20%)')}
              <span className="small muted block">{tt('NHIL 2.5% + GETFund 2.5% + VAT 15% on the price before tax. You pay this to GRA.')}</span>
            </span>
          </label>
        )}

        {showMore ? (
          <>
            {form.taxScheme !== 'vat' && <div className="grid-2">
              <Field label={tt('Tax name')} error={errors.taxLabel} hint={tt('Only if you are registered')}>
                {(p) => <input {...p} value={form.taxLabel} onChange={set('taxLabel')} placeholder={tt('e.g. VAT')} />}
              </Field>
              <Field label={tt('Tax rate (%)')} error={errors.taxRate} hint={tt('Ask your tax office')}>
                {(p) => <input {...p} type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.taxRate}
                  onChange={(e) => setForm({ ...form, taxRate: e.target.value, taxScheme: Number(e.target.value) > 0 ? 'custom' : 'none' })} placeholder="0" />}
              </Field>
            </div>}
            <Field label={tt('Note to customer (optional)')} error={errors.notes}>
              {(p) => <textarea {...p} rows={2} value={form.notes} onChange={set('notes')} placeholder={tt('Thank you for your business.')} />}
            </Field>
          </>
        ) : (
          <button type="button" className="btn-link align-start" onClick={() => setShowMore(true)}>{vatRegistered ? '+ A note to the customer, or another tax' : '+ Tax or a note to the customer'}</button>
        )}

        <div className="totals card">
          <div><span>{tt('Subtotal')}</span><span>{money(subtotal / 100)}</span></div>
          {cents(form.discount) > 0 && <div><span>{tt('Discount')}</span><span>−{money(form.discount)}</span></div>}
          {vat ? (
            <>
              <div><span>{tt('NHIL (2.5%)')}</span><span>{money(vat.nhil)}</span></div>
              <div><span>{tt('GETFund (2.5%)')}</span><span>{money(vat.getfund)}</span></div>
              <div><span>{tt('VAT (15%)')}</span><span>{money(vat.vat)}</span></div>
            </>
          ) : tax > 0 && <div><span>{form.taxLabel || 'Tax'} ({Number(form.taxRate)}%)</span><span>{money(tax / 100)}</span></div>}
          <div className="totals-grand"><span>{tt('Total')}</span><span>GHS {money(total)}</span></div>
        </div>

        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? tt('Saving…') : tt('Save and send')}</button>
        <button type="button" className="btn btn-ghost btn-block" disabled={busy} onClick={() => save(false)}>{tt('Save as draft')}</button>
      </form>
    </main>
  );
}
