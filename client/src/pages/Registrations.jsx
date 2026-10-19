import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Field, FormError, TopBar } from '../components.jsx';
import { money, longDate, todayGhana } from '../format';

// What to bring. Banks and GRA ask for slightly different things, so these are a guide.
const BANK_DOCS = [
  ['ghana_card', 'Your Ghana Card'],
  ['orc', 'Business registration certificate from the Office of the Registrar of Companies (ORC)'],
  ['tin', 'TIN (for a sole owner, your Ghana Card number)'],
  ['address', 'Proof of address: the GhanaPost digital address of the shop, or a utility bill'],
  ['photos', 'Two passport photos'],
  ['deposit', 'Money for the first deposit (ask the bank how much)'],
];
const VAT_DOCS = [
  ['tin', 'TIN (for a sole owner, your Ghana Card number)'],
  ['orc', 'Business registration certificate (ORC)'],
  ['address', 'Digital address of the business'],
  ['records', 'Sales records for the last 12 months: print Profit & loss and Receipts & payments from Reports'],
  ['bank', 'Business bank account details'],
];

const STATUS = {
  not_started: ['Not started', 'draft'],
  in_progress: ['In progress', 'sent'],
  done: ['Done', 'paid'],
};

function StatusLine({ reg, t }) {
  const { tt } = useT();
  const [label, cls] = STATUS[reg.status];
  return (
    <p className="small">
      <span className={`pill pill-${cls}`}>{tt(label)}</span>
      {reg.status === 'in_progress' && reg.startedOn && <span className="muted">{tt(' since {date}', { date: longDate(reg.startedOn, t) })}</span>}
      {reg.status === 'done' && reg.doneOn && <span className="muted">{tt(' from {date}', { date: longDate(reg.doneOn, t) })}</span>}
    </p>
  );
}

function Checklist({ items, reg, onChange, disabled, extraDone = {} }) {
  const { tt } = useT();
  const ticked = new Set(reg.checklist);
  const toggle = (id) => {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next]);
  };
  const count = items.filter(([id]) => ticked.has(id) || extraDone[id]).length;
  return (
    <fieldset className="field">
      <legend>{tt('What to bring ({count} of {total} ready)', { count, total: items.length })}</legend>
      <div className="stack-tight">
        {items.map(([id, label]) => (
          <label key={id} className="check-row top normal">
            <input type="checkbox" checked={ticked.has(id) || !!extraDone[id]} disabled={disabled || !!extraDone[id]} onChange={() => toggle(id)} />
            <span>{tt(label)}{extraDone[id] && <span className="muted"> ({tt(extraDone[id])})</span>}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function BankDoneForm({ onDone, onCancel }) {
  const { tt } = useT();
  const { business } = useSession();
  const [f, setF] = useState({ bankName: '', openingBalance: '', lastDigits: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage('');
    try {
      const d = await api(`/businesses/${business.id}/registrations/bank/done`, {
        method: 'POST', body: { ...f, openingBalance: f.openingBalance || 0, lastDigits: f.lastDigits || null },
      });
      onDone(d, tt('{name} added. Record bank deposits and payments from today.', { name: d.bank.accounts[d.bank.accounts.length - 1].name }));
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  }
  return (
    <form className="stack" onSubmit={save} noValidate>
      <FormError message={message} />
      <Field label={tt('Bank name')} error={errors.bankName}>
        {(p) => <input {...p} value={f.bankName} onChange={set('bankName')} placeholder={tt('e.g. GCB, Ecobank, Fidelity')} />}
      </Field>
      <div className="grid-2">
        <Field label={tt('Balance today (GHS)')} error={errors.openingBalance}>
          {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={f.openingBalance} onChange={set('openingBalance')} />}
        </Field>
        <Field label={tt('Last 4 digits (optional)')} error={errors.lastDigits}>
          {(p) => <input {...p} inputMode="numeric" maxLength={4} value={f.lastDigits} onChange={set('lastDigits')} />}
        </Field>
      </div>
      <p className="muted small">{tt('If the first deposit came from the cash box, record it as a transfer from the cash box to the bank, and enter 0 here.')}</p>
      <div className="grid-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{tt('Cancel')}</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? tt('Saving…') : tt('Add the account')}</button>
      </div>
    </form>
  );
}

function VatDoneForm({ onDone, onCancel }) {
  const { tt } = useT();
  const { business } = useSession();
  const [f, setF] = useState({ vatNumber: '', effectiveDate: todayGhana() });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage('');
    try {
      const d = await api(`/businesses/${business.id}/registrations/vat/done`, { method: 'POST', body: f });
      onDone(d, 'VAT switched on. New invoices add NHIL, GETFund and VAT.');
    } catch (err) { setErrors(err.fields || {}); setMessage(err.message); } finally { setBusy(false); }
  }
  return (
    <form className="stack" onSubmit={save} noValidate>
      <FormError message={message} />
      <Field label={tt('VAT number (as on the certificate)')} error={errors.vatNumber} hint={tt('Often the same as your TIN')}>
        {(p) => <input {...p} value={f.vatNumber} onChange={(e) => setF({ ...f, vatNumber: e.target.value })} autoCapitalize="characters" />}
      </Field>
      <Field label={tt('Registered from')} error={errors.effectiveDate} hint={tt('The start date on the VAT certificate')}>
        {(p) => <input {...p} type="date" value={f.effectiveDate} onChange={(e) => setF({ ...f, effectiveDate: e.target.value })} />}
      </Field>
      <div className="grid-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{tt('Cancel')}</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? tt('Saving…') : tt('Switch VAT on')}</button>
      </div>
    </form>
  );
}

function VatAdvice({ vat }) {
  const { tt } = useT();
  const pct = Math.min(100, vat.pct || 0);
  if (vat.reason === 'unknown') return <p className="muted small">{tt('Choose what the business sells to see whether it must register.')}</p>;
  if (vat.reason === 'services') {
    return (
      <div className="notice">
        <p><strong>{tt('Services must register.')}</strong> {tt('Under the VAT law from January 2026, a business that supplies services must register for VAT whatever its sales.')}
          {vat.serviceProducts.length > 0 && tt(' Your products include {join}, which {service}.', { join: vat.serviceProducts.join(', '), service: vat.serviceProducts.length > 1 ? tt('are services') : tt('is a service') })}
          {' '}{tt('Ask GRA how this applies to your business.')}</p>
      </div>
    );
  }
  return (
    <div className={vat.reason === 'under' ? 'stack-tight' : 'notice'}>
      <p className="small">
        {vat.daysOfRecords >= 360
          ? tt('Sales of GHS {amount} in the last 12 months:', { amount: money(vat.salesLast12) })
          : tt('Sales of GHS {amount} in {days} days of records (about GHS {pace} a year at this pace):', { amount: money(vat.salesLast12), days: vat.daysOfRecords, pace: money(vat.yearlyPace) })}
        {' '}<strong>{vat.pct}%</strong> {tt('of the GHS 750,000 a year at which a business selling goods must register.')}</p>
      <div className="bar" role="progressbar" aria-label={tt('Share of the VAT threshold')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={vat.reason === 'under' ? undefined : 'bar-low'} style={{ width: `${pct}%` }} />
      </div>
      <p className="small">
        {vat.reason === 'under' && 'You do not need to register yet. Check back here: this page follows your sales.'}
        {vat.reason === 'close' && <strong>{tt('You are getting close. Prepare your documents now so you can register as soon as you pass it.')}</strong>}
        {vat.reason === 'over' && <strong>{tt('Your sales are above the threshold: you must register for VAT. GRA can charge penalties for registering late.')}</strong>}
      </p>
    </div>
  );
}

export default function Registrations() {
  const { business } = useSession();
  const { t, tt } = useT();
  const canManage = ['owner', 'manager'].includes(business.role);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [finishing, setFinishing] = useState('');
  const base = `/businesses/${business.id}/registrations`;

  const load = useCallback(() => {
    api(base).then(setData).catch((err) => setError(err.message));
  }, [base]);
  useEffect(() => { load(); }, [load]);

  async function patch(kind, body) {
    setError('');
    try { setData(await api(`${base}/${kind}`, { method: 'PATCH', body })); } catch (err) { setError(err.message); }
  }
  const done = (d, msg) => { setData(d); setFinishing(''); setFlash(msg); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  if (!data) {
    return (
      <main className="screen">
        <TopBar title={tt('Registrations')} back="/settings" />
        {error ? <div className="form-error" role="alert">{error}</div> : <p className="muted">{tt('Loading…')}</p>}
      </main>
    );
  }
  const { bank, vat } = data;
  const sells = vat.details.sells || null;

  return (
    <main className="screen">
      <TopBar title={tt('Registrations')} back="/settings" />
      <p className="lead">{tt('A business can start without a bank account or VAT. When it is ready, this page shows what to bring, and switches each one on in the app when it is done.')}</p>
      {flash && <div className="flash" role="status">{flash}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}

      {/* ---- Bank account ---- */}
      <section className="card stack" aria-labelledby="bank-head">
        <h2 id="bank-head">{tt('Business bank account')}</h2>
        <StatusLine reg={bank} t={t} />
        {bank.status === 'done' ? (
          <>
            <ul className="acct-list">
              {bank.accounts.map((a) => (
                <li key={a.id}><span className="strong">{a.name}</span><span className="num">{money(a.balance)}</span></li>
              ))}
            </ul>
            <p className="muted small">{tt('It works like the cash box and MoMo: record sales paid into it, payments from it, and transfers. Add another bank account in')} <Link to="/settings">{tt('Settings')}</Link>.</p>
          </>
        ) : (
          <>
            <p className="small">{tt('Why: it keeps business money apart from home money, customers can pay by transfer, and lenders and support programmes ask for bank statements.')}</p>
            {bank.status === 'in_progress' && (
              <>
                <Checklist items={BANK_DOCS} reg={bank} disabled={!canManage} onChange={(c) => patch('bank', { checklist: c })} />
                <p className="muted small">{tt('Banks ask for slightly different things: call or visit the branch first. A limited company also needs its constitution and a board resolution. Bring your statements from')} <Link to="/reports">{tt('Reports')}</Link> {tt('to show how the business is doing.')}</p>
              </>
            )}
            {canManage && (finishing === 'bank' ? (
              <BankDoneForm onDone={done} onCancel={() => setFinishing('')} />
            ) : bank.status === 'not_started' ? (
              <button type="button" className="btn btn-primary btn-block" onClick={() => patch('bank', { status: 'in_progress' })}>{tt('Start getting ready')}</button>
            ) : (
              <>
                <button type="button" className="btn btn-primary btn-block" onClick={() => setFinishing('bank')}>{tt('The account is open')}</button>
                <button type="button" className="btn-link small align-start" onClick={() => patch('bank', { status: 'not_started' })}>{tt('Not now')}</button>
              </>
            ))}
          </>
        )}
      </section>

      {/* ---- VAT ---- */}
      <section className="card stack" aria-labelledby="vat-reg-head">
        <h2 id="vat-reg-head">{tt('VAT registration with GRA')}</h2>
        <StatusLine reg={vat} t={t} />
        {vat.status === 'done' ? (
          <>
            <p className="small">{tt('VAT number')} <strong>{vat.reference}</strong>{tt('. New invoices add NHIL 2.5%, GETFund 2.5% and VAT 15%. See what you owe GRA in')} <Link to="/tax">{tt('Reports → Tax')}</Link>.</p>
            <p className="muted small">{tt('Display the VAT certificate where customers can see it, and file a VAT return each month. Use invoices for sales that carry VAT: sales recorded without an invoice do not add VAT in this app yet.')}</p>
          </>
        ) : (
          <>
            <fieldset className="field">
              <legend>{tt('What does the business sell?')}</legend>
              <div className="segmented" role="group" aria-label={tt('What does the business sell?')}>
                {[['goods', 'Goods'], ['services', 'Services'], ['both', 'Both']].map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={sells === k} disabled={!canManage} onClick={() => patch('vat', { sells: k })}>{tt(label)}</button>
                ))}
              </div>
              {!sells && vat.suggestedSells && (
                <p className="muted small">{tt('Your products include {list}, so probably both.', { list: vat.serviceProducts.join(', ') })}</p>
              )}
            </fieldset>
            <VatAdvice vat={vat} />
            {vat.status === 'in_progress' && (
              <>
                <Checklist items={VAT_DOCS} reg={vat} disabled={!canManage} onChange={(c) => patch('vat', { checklist: c })}
                  extraDone={bank.status === 'done' ? { bank: 'done' } : {}} />
                <ol className="steps small">
                  <li>{tt('Apply on the GRA Taxpayers’ Portal (gra.gov.gh) or at a GRA Taxpayer Service Centre near you.')}</li>
                  <li>{tt('GRA checks your details and issues a')} <strong>{tt('VAT certificate')}</strong> {tt('with your VAT number and the date you start.')}</li>
                  <li>{tt('Come back here, tap')} <strong>{tt('GRA has registered us')}</strong> {tt('and enter the number and date.')}</li>
                  <li>{tt('From that date, add NHIL, GETFund and VAT to your sales and file a VAT return by the last working day of each following month.')}</li>
                </ol>
                <p className="muted small">{tt('Only a registered business may charge VAT. Until GRA registers you, do not add VAT to invoices. More in the')} <Link to="/learn/tax-basics">{tt('tax guide')}</Link>.</p>
              </>
            )}
            {canManage && (finishing === 'vat' ? (
              <VatDoneForm onDone={done} onCancel={() => setFinishing('')} />
            ) : vat.status === 'not_started' ? (
              <button type="button" className={'btn btn-block ' + (vat.mustRegister ? 'btn-primary' : 'btn-ghost')} onClick={() => patch('vat', { status: 'in_progress' })}>{tt('Start getting ready')}</button>
            ) : (
              <>
                <button type="button" className="btn btn-primary btn-block" onClick={() => setFinishing('vat')}>{tt('GRA has registered us')}</button>
                <button type="button" className="btn-link small align-start" onClick={() => patch('vat', { status: 'not_started' })}>{tt('Not now')}</button>
              </>
            ))}
          </>
        )}
      </section>
    </main>
  );
}
