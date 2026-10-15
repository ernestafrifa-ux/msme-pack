import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, newClientRef } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError, Icon } from '../components.jsx';
import { money, todayGhana } from '../format';

const TABS = [
  ['sale', 'Sale'],
  ['expense', 'Expense'],
  ['transfer', 'Transfer'],
];
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
  const { business } = useSession();
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm([]));
  // One id per record being entered, so a retried save after a dropped connection isn't saved twice.
  const [clientRef, setClientRef] = useState(newClientRef);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api(`/businesses/${business.id}/accounts`),
      api(`/businesses/${business.id}/categories`),
    ])
      .then(([a, c]) => {
        setAccounts(a.accounts);
        setCategories(c.categories);
        // Only fill in the default accounts: keep anything typed while this was loading.
        const defaults = emptyForm(a.accounts);
        setForm((f) => ({
          ...f,
          accountId: f.accountId || defaults.accountId,
          toAccountId: f.toAccountId || defaults.toAccountId,
        }));
      })
      .catch((err) => setMessage(err.message));
  }, [business.id]);

  const cats = useMemo(() => categories.filter((c) => c.kind === CATEGORY_KIND[kind]), [categories, kind]);
  const account = accounts.find((a) => a.id === form.accountId);
  const isMomo = account?.kind === 'mobile_money';

  if (!TABS.some(([k]) => k === kind)) return <Navigate to="/record/sale" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e, again) {
    e?.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    setSaved('');
    try {
      const body = {
        kind,
        amount: form.amount,
        accountId: form.accountId,
        date: form.date,
        note: form.note || null,
        clientRef,
      };
      if (kind === 'transfer') body.toAccountId = form.toAccountId;
      else body.categoryId = form.categoryId || null;
      if (isMomo) {
        body.paymentRef = form.paymentRef || null;
        body.momoFee = form.momoFee || 0;
      }
      await api(`/businesses/${business.id}/transactions`, { method: 'POST', body });
      const label = TABS.find(([k]) => k === kind)[1];
      const msg = `${label} of GHS ${money(form.amount)} saved.`;
      if (again) {
        setForm({ ...emptyForm(accounts), accountId: form.accountId, date: form.date });
        setClientRef(newClientRef());
        setSaved(msg);
      } else {
        navigate('/', { state: { flash: msg } });
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
      <header className="topbar">
        <Link to="/" className="icon-btn" aria-label="Close"><Icon name="close" /></Link>
        <span className="topbar-title">New record</span>
        <span className="icon-btn" aria-hidden="true" />
      </header>

      <div className="segmented" role="tablist" aria-label="Record type">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={kind === k}
            onClick={() => { navigate(`/record/${k}`, { replace: true }); setErrors({}); setMessage(''); }}>
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="stack" noValidate>
        <FormError message={message} />
        {saved && <div className="flash" role="status">{saved}</div>}

        <Field label={kind === 'sale' ? 'How much did you receive? (GHS)' : kind === 'expense' ? 'How much did you spend? (GHS)' : 'How much did you move? (GHS)'}
          error={errors.amount}>
          {(p) => <input {...p} className="amount-input" type="number" inputMode="decimal" min="0" step="0.01"
            placeholder="0.00" value={form.amount} onChange={set('amount')} autoFocus required />}
        </Field>

        {kind !== 'transfer' ? (
          <fieldset className="field">
            <legend>{kind === 'sale' ? 'Where did the money go?' : 'Where did the money come from?'}</legend>
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
        ) : (
          <div className="grid-2">
            <Field label="From" error={errors.accountId}>
              {(p) => (
                <select {...p} value={form.accountId} onChange={set('accountId')}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </Field>
            <Field label="To" error={errors.toAccountId}>
              {(p) => (
                <select {...p} value={form.toAccountId} onChange={set('toAccountId')}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </Field>
          </div>
        )}
        {kind === 'transfer' && accounts.length < 2 && (
          <p className="muted small">You need two places for money (e.g. cash box and MoMo) to record a transfer.</p>
        )}

        {kind !== 'transfer' && (
          <Field label={kind === 'sale' ? 'What was sold?' : 'What was it for?'} error={errors.categoryId}>
            {(p) => (
              <select {...p} value={form.categoryId} onChange={set('categoryId')}>
                <option value="">Choose…</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </Field>
        )}

        {isMomo && (
          <div className="grid-2">
            <Field label="MoMo ID (optional)" error={errors.paymentRef}>
              {(p) => <input {...p} value={form.paymentRef} onChange={set('paymentRef')} />}
            </Field>
            <Field label="MoMo fee (optional)" error={errors.momoFee}>
              {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                value={form.momoFee} onChange={set('momoFee')} />}
            </Field>
          </div>
        )}

        <div className="grid-2">
          <Field label="Date" error={errors.date}>
            {(p) => <input {...p} type="date" max={todayGhana()} value={form.date} onChange={set('date')} />}
          </Field>
          <Field label="Note (optional)" error={errors.note}>
            {(p) => <input {...p} value={form.note} onChange={set('note')} placeholder={kind === 'sale' ? 'e.g. 10 jars' : ''} />}
          </Field>
        </div>

        <button className="btn btn-primary btn-block" disabled={busy || !accounts.length}>
          {busy ? 'Saving…' : `Save ${kind}`}
        </button>
        <button type="button" className="btn btn-ghost btn-block" disabled={busy || !accounts.length}
          onClick={(e) => submit(e, true)}>
          Save and add another
        </button>
      </form>
    </main>
  );
}
