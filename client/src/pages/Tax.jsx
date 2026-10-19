import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Field, FormError, TopBar } from '../components.jsx';
import { money, longDate, todayGhana, friendlyDate } from '../format';
import { monthRange, PeriodPicker } from '../statements.jsx';
import { RATES, WHT, vatOn, vatFromInclusive, whtOn } from '../tax';

// The same working as GRA's VAT & WHT computation sheet.
function Calculator() {
  const { tt } = useT();
  const [amount, setAmount] = useState('');
  const [includesTax, setIncludesTax] = useState(true);
  const [kind, setKind] = useState('services');
  const n = Number(amount) || 0;
  const v = includesTax ? vatFromInclusive(n) : vatOn(n);
  const wht = whtOn(v.exclusive, kind);
  const afterWht = Math.round((v.exclusive - wht) * 100) / 100;
  const payVatSupplier = Math.round((afterWht + v.tax) * 100) / 100;

  return (
    <section className="card stack" aria-labelledby="calc-head">
      <h2 id="calc-head">{tt('Tax calculator')}</h2>
      <Field label={tt('Amount (GHS)')}>
        {(p) => <input {...p} className="amount-input" type="number" inputMode="decimal" min="0" step="0.01"
          placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      <div className="segmented" role="group" aria-label={tt('Does the amount include tax?')}>
        <button type="button" aria-pressed={includesTax} onClick={() => setIncludesTax(true)}>{tt('Includes tax')}</button>
        <button type="button" aria-pressed={!includesTax} onClick={() => setIncludesTax(false)}>{tt('Before tax')}</button>
      </div>
      <div className="segmented" role="group" aria-label={tt('Goods or services?')}>
        <button type="button" aria-pressed={kind === 'goods'} onClick={() => setKind('goods')}>{tt('Goods')}</button>
        <button type="button" aria-pressed={kind === 'services'} onClick={() => setKind('services')}>{tt('Services')}</button>
      </div>

      <table className="statement-table" aria-label="VAT">
        <tbody>
          <tr className="head"><th colSpan="2">VAT, NHIL &amp; GETFund</th></tr>
          <tr><td className="indent">{tt('Amount before tax')}</td><td className="num">{money(v.exclusive)}</td></tr>
          <tr><td className="indent">NHIL ({RATES.nhil}%)</td><td className="num">{money(v.nhil)}</td></tr>
          <tr><td className="indent">GETFund ({RATES.getfund}%)</td><td className="num">{money(v.getfund)}</td></tr>
          <tr><td className="indent">VAT ({RATES.vat}%)</td><td className="num">{money(v.vat)}</td></tr>
          <tr className="subtotal"><td>{tt('Amount with tax')}</td><td className="num">{money(v.inclusive)}</td></tr>
          <tr className="head"><th colSpan="2">{tt(kind === 'goods' ? 'Withholding tax on goods ({pct}%)' : 'Withholding tax on services ({pct}%)', { pct: WHT[kind] })}</th></tr>
          <tr><td className="indent">{tt('Withholding tax')}</td><td className="num">{money(wht)}</td></tr>
          <tr className="subtotal"><td>{tt('Amount after WHT')}</td><td className="num">{money(afterWht)}</td></tr>
        </tbody>
      </table>

      {n > 0 && v.exclusive <= WHT.threshold && (
        <p className="muted small">{tt('No withholding tax: it applies only when the amount before tax is above GHS {amount}.', { amount: money(WHT.threshold) })}</p>
      )}
      {wht > 0 && (
        <div className="stack small">
          <p><strong>{tt('Paying a supplier?')}</strong> {tt('If the supplier is VAT-registered and gives you a valid GRA VAT invoice, pay them GHS {full} (amount after WHT + NHIL + GETFund + VAT). Otherwise pay them GHS {after} only and pay the taxes at the tax office. Either way, pay the GHS {wht} withheld to GRA and give the supplier a WHT certificate.', { full: money(payVatSupplier), after: money(afterWht), wht: money(wht) })}</p>
          <p><strong>{tt('Selling?')}</strong> {tt('A customer who withholds tax pays you GHS {paid} and gives you a WHT certificate for GHS {wht}. Record it on the invoice under “The customer kept back withholding tax”.', { paid: money(Math.round((v.inclusive - wht) * 100) / 100), wht: money(wht) })}</p>
        </div>
      )}
    </section>
  );
}

function VatPaymentForm({ owed, onSaved, onCancel }) {
  const { tt } = useT();
  const { business } = useSession();
  const [accounts, setAccounts] = useState([]);
  const [f, setF] = useState({ amount: Number(owed) > 0 ? owed : '', accountId: '', date: todayGhana(), paymentRef: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/businesses/${business.id}/accounts`).then((d) => {
      setAccounts(d.accounts);
      setF((x) => ({ ...x, accountId: x.accountId || (d.accounts.find((a) => a.kind === 'bank') || d.accounts[0])?.id || '' }));
    }).catch(() => {});
  }, [business.id]);
  async function save(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage('');
    try {
      await api(`/businesses/${business.id}/tax/vat-payments`, { method: 'POST', body: { ...f, paymentRef: f.paymentRef || null } });
      onSaved(f.amount);
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  }
  return (
    <form className="card stack" onSubmit={save} noValidate>
      <h2>{tt('Paid to GRA')}</h2>
      <FormError message={message} />
      <Field label={tt('Amount paid (GHS)')} error={errors.amount}>
        {(p) => <input {...p} className="amount-input" type="number" inputMode="decimal" min="0" step="0.01"
          value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />}
      </Field>
      <fieldset className="field">
        <legend>{tt('Paid from')}</legend>
        <div className="chips">
          {accounts.map((a) => (
            <label key={a.id} className={'chip chip-lg' + (f.accountId === a.id ? ' chip-on' : '')}>
              <input type="radio" name="vatAccount" value={a.id} checked={f.accountId === a.id}
                onChange={() => setF({ ...f, accountId: a.id })} />
              {a.name}
            </label>
          ))}
        </div>
        {errors.accountId && <div className="field-error">{errors.accountId}</div>}
      </fieldset>
      <div className="grid-2">
        <Field label={tt('Date')} error={errors.date}>
          {(p) => <input {...p} type="date" max={todayGhana()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}
        </Field>
        <Field label={tt('GRA receipt no. (optional)')} error={errors.paymentRef}>
          {(p) => <input {...p} value={f.paymentRef} onChange={(e) => setF({ ...f, paymentRef: e.target.value })} />}
        </Field>
      </div>
      <div className="grid-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{tt('Cancel')}</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? tt('Saving…') : tt('Save payment')}</button>
      </div>
    </form>
  );
}

export default function Tax() {
  const { business } = useSession();
  const { t, tt } = useT();
  const [range, setRange] = useState(() => monthRange(todayGhana()));
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);
  const [flash, setFlash] = useState('');
  const canManage = ['owner', 'manager'].includes(business.role);

  const load = useCallback(() => {
    setError('');
    api(`/businesses/${business.id}/tax/summary?from=${range.from}&to=${range.to}`)
      .then(setS).catch((err) => setError(err.message));
  }, [business.id, range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  return (
    <main className="screen">
      <TopBar title={t('st.tax.title')} back="/reports" />
      {flash && <div className="flash" role="status">{flash}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}

      <PeriodPicker range={range} onChange={setRange} />

      {s && (
        <>
          {!s.vatRegistered && (
            <p className="muted small">
              {tt('Not registered for VAT. See whether the business must register, and what to bring, in')}{' '}
              <Link to="/registrations">{tt('Registrations')}</Link>{tt('. Once GRA registers you, new invoices add NHIL, GETFund and VAT.')}</p>
          )}

          <section className="card stack" aria-labelledby="vat-head">
            <h2 id="vat-head">{tt('VAT for this period')}</h2>
            <table className="statement-table">
              <tbody>
                <tr className="head"><th colSpan="2">{tt('On invoices ({n})', { n: s.charged.invoices })}</th></tr>
                <tr><td className="indent">{tt('Value before tax')}</td><td className="num">{money(s.charged.taxable)}</td></tr>
                <tr><td className="indent">{tt('NHIL (2.5%)')}</td><td className="num">{money(s.charged.nhil)}</td></tr>
                <tr><td className="indent">{tt('GETFund (2.5%)')}</td><td className="num">{money(s.charged.getfund)}</td></tr>
                <tr><td className="indent">{tt('VAT (15%)')}</td><td className="num">{money(s.charged.vat)}</td></tr>
                {Number(s.charged.otherTax) > 0 && (
                  <tr><td className="indent">{tt('Other tax on invoices')}</td><td className="num">{money(s.charged.otherTax)}</td></tr>
                )}
                <tr className="head"><th colSpan="2">{tt('On everyday sales ({n})', { n: s.cashSales.count })}</th></tr>
                <tr><td className="indent">{tt('Sales before tax')}</td><td className="num">{money(s.cashSales.base)}</td></tr>
                <tr><td className="indent">VAT, NHIL &amp; GETFund</td><td className="num">{money(s.cashSales.tax)}</td></tr>
                <tr className="head"><th colSpan="2">{tt('On what you bought ({n})', { n: s.input.count })}</th></tr>
                <tr><td className="indent">{tt('VAT to claim back (input VAT)')}</td><td className="num">({money(s.input.tax)})</td></tr>
                <tr className="subtotal"><td>{tt('For this period')}</td><td className="num">{money(s.netForPeriod)}</td></tr>
                <tr><td className="indent">{tt('Paid to GRA in this period')}</td><td className="num">({money(s.paid.total)})</td></tr>
                <tr className="total">
                  <td>{Number(s.owed) < 0 ? tt('GRA owes you on {date}', { date: longDate(s.to, t) }) : tt('Owed to GRA on {date}', { date: longDate(s.to, t) })}</td>
                  <td className="num">{money(Math.abs(Number(s.owed)))}</td>
                </tr>
              </tbody>
            </table>
            <p className="muted small">
              {tt('VAT returns and payment are due by the last working day of the month after the sale. Input VAT counts only with the supplier’s valid GRA VAT invoice: keep them for your return.')}
            </p>
            {canManage && !paying && (
              <button type="button" className="btn btn-primary btn-block" onClick={() => setPaying(true)}>{tt('Record a payment to GRA')}</button>
            )}
          </section>

          {paying && (
            <VatPaymentForm owed={s.owed} onCancel={() => setPaying(false)}
              onSaved={(amt) => { setPaying(false); setFlash(tt('Payment of GHS {amount} to GRA saved.', { amount: money(amt) })); load(); }} />
          )}

          {s.paid.records.length > 0 && (
            <ul className="txn-list" aria-label={tt('Payments to GRA')}>
              {s.paid.records.map((r) => (
                <li key={r.id} className="txn">
                  <div className="txn-main">
                    <div className="txn-title">{t('kind.vat_payment')}</div>
                    <div className="muted small">{friendlyDate(r.date, t)} · {r.accountName}{r.paymentRef ? ` · ${r.paymentRef}` : ''}</div>
                  </div>
                  <div className="txn-amt neg">−{money(r.amount)}</div>
                </li>
              ))}
            </ul>
          )}

          <section className="card stack" aria-labelledby="wht-head">
            <h2 id="wht-head">{tt('Tax withheld by customers')}</h2>
            {s.withheld.records.length ? (
              <ul className="txn-list">
                {s.withheld.records.map((r) => (
                  <li key={r.id} className="txn">
                    <div className="txn-main">
                      <div className="txn-title">{r.contactName || '—'}</div>
                      <div className="muted small">{friendlyDate(r.date, t)}{r.invoiceNumber ? ` · ${r.invoiceNumber}` : ''}</div>
                    </div>
                    <div className="txn-amt">{money(r.amount)}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="muted small">{tt('None in this period.')}</p>}
            <table className="statement-table"><tbody>
              <tr className="subtotal"><td>{tt('In this period')}</td><td className="num">{money(s.withheld.total)}</td></tr>
              <tr><td className="indent">{tt('All, up to {date}', { date: longDate(s.to, t) })}</td><td className="num">{money(s.withheld.toDate)}</td></tr>
            </tbody></table>
            <p className="muted small">{tt('Keep each WHT certificate. Tax withheld counts against the income tax you owe GRA for the year.')}</p>
          </section>
        </>
      )}

      <Calculator />
      <p className="muted small">{tt('Rates from 1 January 2026: NHIL 2.5%, GETFund 2.5% and VAT 15%, all on the price before tax. Withholding tax above GHS 2,000: goods 3%, services 7.5%.')} <Link to="/learn/tax-basics">{tt('Read the tax guide')}</Link></p>
    </main>
  );
}
