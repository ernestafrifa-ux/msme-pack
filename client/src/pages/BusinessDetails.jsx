import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Link } from 'react-router-dom';
import { Field, FormError, Icon, TopBar } from '../components.jsx';
import { useT, UI_LANGUAGES } from '../i18n.jsx';
import AccountsSection from './AccountsSection.jsx';
import MembersSection from './MembersSection.jsx';

export default function BusinessDetails() {
  const { user, business, logout } = useSession();
  const { t, lang, setLanguage } = useT();
  const [langMessage, setLangMessage] = useState('');
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const canManage = ['owner', 'manager'].includes(business.role);

  useEffect(() => {
    api(`/businesses/${business.id}`)
      .then(({ business: b }) => setForm({
        name: b.name, phone: (b.phone || '').replace(/^\+233/, '0'), email: b.email || '', town: b.town || '',
        digitalAddress: b.digitalAddress || '', tin: b.tin || '', invoicePrefix: b.invoicePrefix || 'INV',
        vatRegistered: !!b.vatRegistered,
      }))
      .catch((err) => setMessage(err.message));
  }, [business.id]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    setSaved('');
    try {
      await api(`/businesses/${business.id}`, { method: 'PATCH', body: form });
      setSaved('Saved. New and existing invoices show these details.');
    } catch (err) {
      setErrors(err.fields || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen">
      <TopBar title="Business details" back="/invoices" />
      <Link to="/registrations" className="card report-link reg-link">
        <span className="txn-main">
          <span className="txn-title wrap">Registrations: bank account &amp; VAT</span>
          <span className="small muted">No bank account or VAT yet? See what to bring, and switch them on when they are done.</span>
        </span>
        <Icon name="chevron" size={18} />
      </Link>
      <p className="lead">These appear at the top of your invoices.</p>
      {form && (
        <form className="stack" onSubmit={submit} noValidate>
          <FormError message={message} />
          {saved && <div className="flash" role="status">{saved}</div>}
          <fieldset disabled={!canManage} className="stack plain">
            <Field label="Business name" error={errors.name}>
              {(p) => <input {...p} value={form.name} onChange={set('name')} />}
            </Field>
            <div className="grid-2">
              <Field label="Phone" error={errors.phone}>
                {(p) => <input {...p} type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} />}
              </Field>
              <Field label="Town" error={errors.town}>
                {(p) => <input {...p} value={form.town} onChange={set('town')} />}
              </Field>
            </div>
            <Field label="Email (optional)" error={errors.email}>
              {(p) => <input {...p} type="email" inputMode="email" value={form.email} onChange={set('email')} />}
            </Field>
            <div className="grid-2">
              <Field label="Digital address" error={errors.digitalAddress} hint="GhanaPostGPS, optional">
                {(p) => <input {...p} value={form.digitalAddress} onChange={set('digitalAddress')} placeholder="AK-039-5028" />}
              </Field>
              <Field label="TIN (optional)" error={errors.tin} hint="If you have one">
                {(p) => <input {...p} value={form.tin} onChange={set('tin')} />}
              </Field>
            </div>
            <label className="check-row top">
              <input type="checkbox" checked={form.vatRegistered} onChange={(e) => setForm({ ...form, vatRegistered: e.target.checked })} />
              <span>The business is registered for VAT with GRA
                <span className="small muted block">New invoices then add NHIL 2.5%, GETFund 2.5% and VAT 15% (20% in all). Businesses that provide services must register whatever their sales; those selling goods must register once sales pass GHS 750,000 a year.</span>
              </span>
            </label>
            <Field label="Invoice number starts with" error={errors.invoicePrefix} hint="e.g. INV gives INV-0001">
              {(p) => <input {...p} value={form.invoicePrefix} onChange={set('invoicePrefix')} maxLength={8} />}
            </Field>
            {canManage && <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>}
          </fieldset>
        </form>
      )}
      <AccountsSection />
      <MembersSection />

      <section className="card lang-card">
        <h2>{t('settings.language')}</h2>
        <p className="muted small">{t('settings.languageHint')}</p>
        <div className="options" role="radiogroup" aria-label={t('settings.language')}>
          {UI_LANGUAGES.map((code) => (
            <label key={code} className={'option' + (lang === code ? ' option-on' : '')}>
              <input type="radio" name="appLang" checked={lang === code}
                onChange={() => setLanguage(code).then(() => setLangMessage('saved'), (err) => setLangMessage(err.message))} />
              {t(`lang.${code}`)}
            </label>
          ))}
        </div>
        {langMessage && <p className="small" role="status">{langMessage === 'saved' ? t('settings.langSaved') : langMessage}</p>}
      </section>
      <Link to="/settings/password" className="btn btn-ghost btn-block">Change my password</Link>
      {user.isAdmin && <Link to="/admin" className="btn btn-ghost btn-block">MSME Pack admin: all businesses</Link>}
      <button className="btn btn-ghost btn-block log-out" onClick={logout}>{t('settings.logout')}</button>
    </main>
  );
}
