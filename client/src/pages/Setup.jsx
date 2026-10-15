import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError } from '../components.jsx';

const LEGAL_FORMS = [
  ['unregistered', 'Not yet'],
  ['sole_proprietorship', 'Yes, sole proprietorship'],
  ['partnership', 'Yes, partnership'],
  ['company_ltd_shares', 'Yes, limited company'],
];

export default function Setup() {
  const { user, addBusiness, logout } = useSession();
  const [lookups, setLookups] = useState({ regions: [], sectors: [] });
  const [form, setForm] = useState({
    name: '', sectorCode: '', regionCode: '', town: '', legalForm: 'unregistered',
    cashOpeningBalance: '', useMomo: true, momoProvider: 'MTN', momoOpeningBalance: '',
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/businesses/lookups').then(setLookups).catch((err) => setMessage(err.message));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    try {
      const { business } = await api('/businesses', {
        method: 'POST',
        body: {
          name: form.name,
          sectorCode: form.sectorCode || null,
          regionCode: form.regionCode || null,
          town: form.town || null,
          legalForm: form.legalForm,
          cashOpeningBalance: form.cashOpeningBalance || 0,
          momo: form.useMomo ? { provider: form.momoProvider, openingBalance: form.momoOpeningBalance || 0 } : null,
        },
      });
      addBusiness(business);
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
      <header className="topbar">
        <span />
        <button type="button" className="btn-link" onClick={logout}>Log out</button>
      </header>
      <h1>Tell us about your business</h1>
      <p className="lead">Hello {user.fullName.split(' ')[0]}. This sets up your records. You can change it later.</p>
      <form onSubmit={submit} className="stack" noValidate>
        <FormError message={message} />
        <Field label="Business name" error={errors.name}>
          {(p) => <input {...p} value={form.name} onChange={set('name')} required />}
        </Field>

        <fieldset className="field">
          <legend>What does your business do?</legend>
          <div className="chips">
            {lookups.sectors.map((s) => (
              <label key={s.code} className={'chip' + (form.sectorCode === s.code ? ' chip-on' : '')}>
                <input type="radio" name="sector" value={s.code} checked={form.sectorCode === s.code}
                  onChange={set('sectorCode')} />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid-2">
          <Field label="Region" error={errors.regionCode}>
            {(p) => (
              <select {...p} value={form.regionCode} onChange={set('regionCode')}>
                <option value="">Choose…</option>
                {lookups.regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Town" error={errors.town}>
            {(p) => <input {...p} value={form.town} onChange={set('town')} />}
          </Field>
        </div>

        <fieldset className="field">
          <legend>Is the business registered?</legend>
          <div className="options">
            {LEGAL_FORMS.map(([value, label]) => (
              <label key={value} className={'option' + (form.legalForm === value ? ' option-on' : '')}>
                <input type="radio" name="legalForm" value={value} checked={form.legalForm === value}
                  onChange={set('legalForm')} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <h2>Where you keep the money</h2>
        <Field label="Cash in the business box today (GHS)" error={errors.cashOpeningBalance}
          hint="Count it now. Leave empty if none.">
          {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01"
            value={form.cashOpeningBalance} onChange={set('cashOpeningBalance')} placeholder="0.00" />}
        </Field>

        <label className="option toggle">
          <input type="checkbox" checked={form.useMomo} onChange={set('useMomo')} />
          The business receives Mobile Money
        </label>
        {form.useMomo && (
          <div className="grid-2">
            <Field label="Network" error={errors['momo.provider']}>
              {(p) => (
                <select {...p} value={form.momoProvider} onChange={set('momoProvider')}>
                  <option value="MTN">MTN</option>
                  <option value="Telecel">Telecel</option>
                  <option value="AT">AT</option>
                </select>
              )}
            </Field>
            <Field label="Balance today (GHS)" error={errors['momo.openingBalance']}>
              {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="0.01"
                value={form.momoOpeningBalance} onChange={set('momoOpeningBalance')} placeholder="0.00" />}
            </Field>
          </div>
        )}

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Saving…' : 'Start keeping records'}
        </button>
      </form>
    </main>
  );
}
