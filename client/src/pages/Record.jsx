import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, cachedGet, addToOutbox, newClientRef } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError, Icon, ProductPicker, SearchSelect } from '../components.jsx';
import { money, qty, todayGhana } from '../format';
import { useT } from '../i18n.jsx';
import { vatFromInclusive } from '../tax';

const TABS = ['sale', 'expense', 'purchase', 'transfer', 'owner_draw'];
const CATEGORY_KIND = { sale: 'income', expense: 'expense' };

function emptyForm(accounts) {
  const def = accounts.find((a) => a.isDefault) || accounts[0];
  const other = accounts.find((a) => a.id !== def?.id);
  return {
    amount: '', accountId: def?.id || '', toAccountId: other?.id || '', categoryId: '',
    date: todayGhana(), paymentRef: '', momoFee: '', note: '',
  };
}

export default function Record() {
  const { kind } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { business } = useSession();
  const { t } = useT();
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm([]));
  // Products on this sale or purchase: [{ productId, name, unit, onHand, trackStock, quantity, unitPrice }]
  const [lines, setLines] = useState([]);
  const [picking, setPicking] = useState(false);
  // One id per record being entered, so a retried save after a dropped connection isn't saved twice.
  const [clientRef, setClientRef] = useState(newClientRef);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  // Buy stock now, pay the supplier later.
  const [credit, setCredit] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [payBy, setPayBy] = useState('');
  // Sell now, the customer pays later.
  const [contacts, setContacts] = useState(null);
  const [customer, setCustomer] = useState({ contactId: '', name: '', phone: '' });
  // VAT-registered businesses: does this amount include VAT, NHIL and GETFund?
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatChoice, setVatChoice] = useState(null); // null = the default for this kind

  const isPurchase = kind === 'purchase';
  const usesProducts = kind === 'sale' || isPurchase;
  const priceField = isPurchase ? 'costPrice' : 'sellingPrice';

  useEffect(() => {
    Promise.all([
      cachedGet(`/businesses/${business.id}/accounts`),
      cachedGet(`/businesses/${business.id}/categories`),
      cachedGet(`/businesses/${business.id}/products`),
      cachedGet(`/businesses/${business.id}`),
    ])
      .then(([a, c, p, b]) => {
        setVatRegistered(!!b.business.vatRegistered);
        setAccounts(a.accounts);
        setCategories(c.categories);
        setProducts(p.products);
        // Only fill in the default accounts: keep anything typed while this was loading.
        const defaults = emptyForm(a.accounts);
        setForm((f) => ({
          ...f,
          accountId: f.accountId || defaults.accountId,
          toAccountId: location.state?.toAccountId || f.toAccountId || defaults.toAccountId,
        }));
        // Opened from a product's "Bought more" button: start with that product.
        const startWith = p.products.find((x) => x.id === location.state?.productId);
        if (startWith) setLines((l) => (l.length ? l : [lineFrom(startWith, 'costPrice')]));
      })
      .catch((err) => setMessage(err.message));
  }, [business.id, location.state?.productId, location.state?.toAccountId]);

  // Sales can include services (photocopying, repairs); buying stock is for products only.
  const pickable = useMemo(
    // Stock bought: products and supplies. A sale: products and services, not supplies.
    () => products.filter((x) => (isPurchase ? x.kind !== 'service' : x.kind !== 'supply')),
    [products, isPurchase]
  );
  const cats = useMemo(() => categories.filter((c) => c.kind === CATEGORY_KIND[kind]), [categories, kind]);
  const account = accounts.find((a) => a.id === form.accountId);
  const isMomo = account?.kind === 'mobile_money';
  const itemTotal = lines.reduce((s, l) => s + Math.round(Number(l.quantity || 0) * Number(l.unitPrice || 0) * 100), 0) / 100;
  const hasLines = usesProducts && lines.length > 0;

  if (!TABS.includes(kind)) return <Navigate to="/record/sale" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function lineFrom(p, field) {
    return {
      productId: p.id, name: p.name, unit: p.unit, onHand: Number(p.onHand), trackStock: p.trackStock,
      quantity: 1, unitPrice: p[field],
    };
  }
  function addProduct(p) {
    setLines((ls) => {
      const existing = ls.find((l) => l.productId === p.id);
      if (existing) return ls.map((l) => (l === existing ? { ...l, quantity: Number(l.quantity || 0) + 1 } : l));
      return [...ls, lineFrom(p, priceField)];
    });
  }
  const setLine = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const step = (i, d) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, quantity: Math.max(0, Number(l.quantity || 0) + d) } : l)).filter((l) => Number(l.quantity) > 0 || d > 0));

  function switchTab(k) {
    navigate(`/record/${k}`, { replace: true });
    setErrors({});
    setMessage('');
    setLines([]);
    setPicking(false);
    setCredit(false);
    setVatChoice(null);
    setPayBy('');
  }

  async function submit(e, again) {
    e?.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    setSaved('');
    try {
      const body = { kind, accountId: form.accountId, date: form.date, note: form.note || null, clientRef };
      if (kind === 'transfer') body.toAccountId = form.toAccountId;
      if (kind === 'sale' || kind === 'expense') body.categoryId = form.categoryId || null;
      if (hasLines) {
        body.items = lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice }));
      } else {
        body.amount = form.amount;
      }
      if (kind === 'sale' && credit) {
        const cs = { date: form.date, dueDate: payBy || null, note: form.note || null, vat: vatApplies ? vatOn : false };
        if (customer.contactId) cs.contactId = customer.contactId;
        else cs.newContact = { name: customer.name, phone: customer.phone || null };
        if (hasLines) cs.items = body.items; else cs.amount = form.amount;
        const { invoice } = await api(`/businesses/${business.id}/credit-sales`, { method: 'POST', body: cs });
        navigate(`/customers/${invoice.contact.id}`, { state: { flash: t('record.saved.creditSale', { amount: money(invoice.total), name: invoice.contact.name }) } });
        return;
      }
      const onCredit = isPurchase && credit;
      if (onCredit) body.onCredit = { supplier, dueDate: payBy || null };
      if (vatApplies) body.vat = vatOn;
      if (isMomo && !onCredit) {
        body.paymentRef = form.paymentRef || null;
        body.momoFee = form.momoFee || 0;
      }
      let transaction;
      try {
        ({ transaction } = await api(`/businesses/${business.id}/transactions`, { method: 'POST', body }));
      } catch (err) {
        if (err.status !== 0) throw err;
        // No connection: keep it on the phone and send it later.
        const total = hasLines ? itemTotal : Number(form.amount || 0);
        addToOutbox({ path: `/businesses/${business.id}/transactions`, body,
          label: `${t(`kind.${kind}`)} GHS ${money(total)}` });
        const offlineMsg = t('record.savedOffline', { amount: money(total) });
        if (again) {
          setForm({ ...emptyForm(accounts), accountId: form.accountId, date: form.date });
          setLines([]); setClientRef(newClientRef()); setSaved(offlineMsg);
        } else {
          navigate('/', { state: { flash: offlineMsg } });
        }
        return;
      }
      const msg = onCredit
        ? t('record.saved.purchase_credit', { amount: money(transaction.amount), supplier })
        : t(`record.saved.${kind}`, { amount: money(transaction.amount) });
      if (again) {
        setForm({ ...emptyForm(accounts), accountId: form.accountId, date: form.date });
        setLines([]);
        setClientRef(newClientRef());
        setSaved(msg);
        // Refresh stock numbers shown in the picker.
        api(`/businesses/${business.id}/products`).then((p) => setProducts(p.products)).catch(() => {});
      } else {
        navigate('/', { state: { flash: msg, receiptFor: kind === 'sale' ? transaction.id : null } });
      }
    } catch (err) {
      setErrors(err.fields || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  const amountLabel = isPurchase ? '' : t(`record.amount.${kind}`);
  const vatApplies = vatRegistered && ['sale', 'expense', 'purchase'].includes(kind);
  // Shop prices usually include VAT; a cost includes VAT only with the supplier's VAT invoice.
  const vatOn = vatChoice ?? kind === 'sale';
  const recordTotal = hasLines ? itemTotal : Number(form.amount || 0);
  const vatPart = vatApplies && vatOn && recordTotal > 0 ? vatFromInclusive(recordTotal).tax : 0;

  return (
    <main className="screen">
      <header className="topbar">
        <Link to="/" className="icon-btn" aria-label={t('common.close')}><Icon name="close" /></Link>
        <span className="topbar-title">{t('record.title')}</span>
        <span className="icon-btn" aria-hidden="true" />
      </header>

      <div className="segmented record-tabs" role="tablist" aria-label={t('record.type')}>
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => switchTab(k)}>{t(`record.tab.${k}`)}</button>
        ))}
      </div>

      <form onSubmit={submit} className="stack" noValidate>
        <FormError message={message} />
        {saved && <div className="flash" role="status">{saved}</div>}
        {kind === 'owner_draw' && <p className="muted small">{t('record.help.owner_draw')}</p>}

        {usesProducts && (
          <section className="field" aria-label={isPurchase ? t('record.productsBought') : t('record.productsSold')}>
            <div className="field-label">{isPurchase ? t('record.whatBought') : t('record.whatSold')}</div>
            {lines.length > 0 && (
              <ul className="lines">
                {lines.map((l, i) => {
                  const short = !isPurchase && l.trackStock && Number(l.quantity) > l.onHand;
                  return (
                    <li key={l.productId} className="line">
                      <div className="line-top">
                        <span className="line-name">{l.name}</span>
                        <button type="button" className="icon-btn small-btn" aria-label={t('record.remove', { name: l.name })}
                          onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Icon name="close" size={16} /></button>
                      </div>
                      <div className="line-controls">
                        <div className="stepper">
                          <button type="button" aria-label={t('record.fewer', { name: l.name })} onClick={() => step(i, -1)}>−</button>
                          <input aria-label={t('record.qtyOf', { name: l.name })} type="number" inputMode="decimal" min="0" step="any"
                            value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
                          <button type="button" aria-label={t('record.more', { name: l.name })} onClick={() => step(i, 1)}>+</button>
                        </div>
                        <span className="muted small">×</span>
                        <label className="price-input">
                          <span className="sr-only">{t(isPurchase ? 'record.costOf' : 'record.priceOf', { name: l.name })}</span>
                          <input type="number" inputMode="decimal" min="0" step="0.01" value={l.unitPrice}
                            onChange={(e) => setLine(i, 'unitPrice', e.target.value)} />
                        </label>
                        <span className="line-total">{money(Number(l.quantity || 0) * Number(l.unitPrice || 0))}</span>
                      </div>
                      {short && <div className="warn-text small">{t('record.short', { qty: qty(l.onHand), unit: l.unit })}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
            {picking ? (
              <ProductPicker products={pickable} priceField={priceField} onPick={addProduct} onClose={() => setPicking(false)} />
            ) : (
              <button type="button" className="btn btn-ghost btn-block dashed" onClick={() => setPicking(true)}
                disabled={!pickable.length}>
                <Icon name="plus" size={18} /> {lines.length ? t('record.addAnother') : t('record.addProducts')}
              </button>
            )}
            {!pickable.length && (
              <p className="muted small">
                {isPurchase ? t('record.addInStockBuy') : t('record.addInStockSale')}{' '}
                <Link to="/stock/new">{t('record.goToStock')}</Link>
              </p>
            )}
            {errors.items && <div className="field-error">{errors.items}</div>}
          </section>
        )}

        {hasLines ? (
          <div className="total-row">
            <span>{isPurchase ? t('record.totalPaid') : t('record.totalReceived')}</span>
            <span className="total-val">GHS {money(itemTotal)}</span>
          </div>
        ) : (
          !isPurchase && (
            <Field label={usesProducts && pickable.length ? t('record.amount.orType') : amountLabel} error={errors.amount}>
              {(p) => <input {...p} className="amount-input" type="number" inputMode="decimal" min="0" step="0.01"
                placeholder="0.00" value={form.amount} onChange={set('amount')} autoFocus={!usesProducts} required />}
            </Field>
          )
        )}

        {vatApplies && (
          <div className="field">
            <label className="check-row">
              <input type="checkbox" checked={vatOn} onChange={(e) => setVatChoice(e.target.checked)} />
              <span>{kind === 'sale' ? t('record.vatSale') : t('record.vatCost')}</span>
            </label>
            {vatOn && vatPart > 0 && (
              <p className="muted small">{t(kind === 'sale' ? 'record.vatSaleNote' : 'record.vatCostNote', { tax: money(vatPart), rest: money(recordTotal - vatPart) })}</p>
            )}
          </div>
        )}

        {isPurchase && (
          <div className="field">
            <label className="check-row">
              <input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} />
              <span>{t('record.onCredit')}</span>
            </label>
            {credit && (
              <div className="grid-2">
                <Field label={t('record.supplier')} error={errors['onCredit.supplier'] || errors.onCredit}
                  hint={t('record.onCreditHint')}>
                  {(p) => <input {...p} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder={t('record.ph.purchase')} />}
                </Field>
                <Field label={t('record.payBy')} error={errors['onCredit.dueDate']} hint={t('record.payByHint')}>
                  {(p) => <input {...p} type="date" min={form.date} value={payBy} onChange={(e) => setPayBy(e.target.value)} />}
                </Field>
              </div>
            )}
          </div>
        )}

        {kind === 'sale' && (
          <div className="field">
            <label className="check-row">
              <input type="checkbox" checked={credit} onChange={(e) => {
                setCredit(e.target.checked);
                if (e.target.checked && !contacts) {
                  api(`/businesses/${business.id}/contacts`).then((d) => {
                    setContacts(d.contacts);
                    if (!d.contacts.length) setCustomer((c) => ({ ...c, contactId: '' }));
                  }).catch(() => setContacts([]));
                }
              }} />
              <span>{t('record.saleOnCredit')}</span>
            </label>
            {credit && (
              <div className="stack-tight">
                <p className="muted small">{t('record.saleOnCreditHint')}</p>
                {contacts && contacts.length > 0 && (
                  <Field label={t('record.customer')} error={errors.contactId}>
                    {(p) => (
                      <SearchSelect {...p} value={customer.contactId} emptyLabel={t('record.newCustomer')}
                        options={contacts.map((c) => ({ value: c.id, label: c.name, hint: c.phone ? c.phone.replace('+233', '0') : undefined }))}
                        onChange={(v) => setCustomer({ ...customer, contactId: v })} />
                    )}
                  </Field>
                )}
                {!customer.contactId && (
                  <div className="grid-2">
                    <Field label={t('record.customerName')} error={errors['newContact.name']}>
                      {(p) => <input {...p} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />}
                    </Field>
                    <Field label={t('record.customerPhone')} error={errors['newContact.phone']}>
                      {(p) => <input {...p} type="tel" inputMode="tel" placeholder="024 123 4567" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />}
                    </Field>
                  </div>
                )}
                <Field label={t('record.payBy')} error={errors.dueDate} hint={t('record.payByHint')}>
                  {(p) => <input {...p} type="date" min={form.date} value={payBy} onChange={(e) => setPayBy(e.target.value)} />}
                </Field>
              </div>
            )}
          </div>
        )}

        {kind !== 'transfer' && !credit ? (
          <fieldset className="field">
            <legend>{kind === 'sale' ? t('record.whereTo') : t('record.whereFrom')}</legend>
            <div className="chips">
              {accounts.map((a) => (
                <label key={a.id} className={'chip chip-lg' + (form.accountId === a.id ? ' chip-on' : '')}>
                  <input type="radio" name="account" value={a.id} checked={form.accountId === a.id}
                    onChange={set('accountId')} />
                  {a.name}
                </label>
              ))}
            </div>
            {errors.accountId && <div className="field-error">{errors.accountId}</div>}
          </fieldset>
        ) : kind !== 'transfer' ? null : (
          <div className="grid-2">
            <Field label={t('record.from')} error={errors.accountId}>
              {(p) => (
                <select {...p} value={form.accountId} onChange={set('accountId')}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </Field>
            <Field label={t('record.to')} error={errors.toAccountId}>
              {(p) => (
                <select {...p} value={form.toAccountId} onChange={set('toAccountId')}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </Field>
          </div>
        )}
        {kind === 'transfer' && accounts.length < 2 && (
          <p className="muted small">{t('record.needTwo')}</p>
        )}

        {(kind === 'sale' || kind === 'expense') && !hasLines && (
          <Field label={t(`record.cat.${kind}`)} error={errors.categoryId}>
            {(p) => (
              <select {...p} value={form.categoryId} onChange={set('categoryId')}>
                <option value="">{t('common.choose')}</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
        )}

        {isMomo && !credit && (
          <div className="grid-2">
            <Field label={t('record.momoId')} error={errors.paymentRef}>
              {(p) => <input {...p} value={form.paymentRef} onChange={set('paymentRef')} />}
            </Field>
            <Field label={t('record.momoFee')} error={errors.momoFee}>
              {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                value={form.momoFee} onChange={set('momoFee')} />}
            </Field>
          </div>
        )}

        <div className="grid-2">
          <Field label={t('common.date')} error={errors.date}>
            {(p) => <input {...p} type="date" max={todayGhana()} value={form.date} onChange={set('date')} />}
          </Field>
          <Field label={t('common.noteOptional')} error={errors.note}>
            {(p) => <input {...p} value={form.note} onChange={set('note')}
              placeholder={kind === 'sale' ? t('record.ph.sale') : isPurchase ? t('record.ph.purchase') : kind === 'owner_draw' ? t('record.ph.owner_draw') : ''} />}
          </Field>
        </div>

        <button className="btn btn-primary btn-block" disabled={busy || !accounts.length || (isPurchase && !lines.length)}>
          {busy ? t('common.saving') : t(`record.save.${kind}`)}
        </button>
        <button type="button" className="btn btn-ghost btn-block" disabled={busy || !accounts.length || (isPurchase && !lines.length)}
          onClick={(e) => submit(e, true)}>
          {t('record.saveAnother')}
        </button>
      </form>
    </main>
  );
}
