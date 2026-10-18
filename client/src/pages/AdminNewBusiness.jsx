import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Field, FormError, TopBar } from '../components.jsx';
import { useT } from '../i18n.jsx';

const LANGUAGES = ['en', 'tw', 'ee', 'gaa', 'dag', 'ha'];
import { BusinessFields, MoneyFields, businessBody, emptyBusiness, emptyMoney, moneyBody, setter } from '../businessForm.jsx';

// The admin sets up a business and its owner's account.
export default function AdminNewBusiness() {
  const navigate = useNavigate();
  const { t } = useT();
  const [lookups, setLookups] = useState({ regions: [], sectors: [] });
  const [form, setForm] = useState({ ...emptyBusiness, ...emptyMoney, ownerName: '', ownerPhone: '', ownerPassword: '', ownerLanguage: 'en', withMoney: false });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = setter(form, setForm);

  useEffect(() => { api('/businesses/lookups').then(setLookups).catch((err) => setMessage(err.message)); }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage('');
    try {
      const d = await api('/admin/businesses', {
        method: 'POST',
        body: {
          ...businessBody(form),
          ...(form.withMoney ? moneyBody(form) : {}),
          withMoney: form.withMoney,
          owner: { fullName: form.ownerName, phone: form.ownerPhone, password: form.ownerPassword || undefined, preferredLanguage: form.ownerLanguage },
        },
      });
      const who = d.owner.fullName;
      navigate('/admin', {
        state: {
          flash: d.owner.isNew
            ? `${d.business.name} is set up. Give ${who} their phone number and the temporary password; they choose their own at first login${form.withMoney ? '' : ', then enter today’s balances'}.`
            : `${d.business.name} is set up. ${who} already had an account and logs in with their own password.`,
        },
      });
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
      <TopBar title="New business" back="/admin" />
      <form className="stack" onSubmit={submit} noValidate>
        <FormError message={message} />
        <h2>The business</h2>
        <BusinessFields form={form} set={set} errors={errors} lookups={lookups} />

        <h2>The owner</h2>
        <Field label="Owner’s full name" error={errors['owner.fullName']}>
          {(p) => <input {...p} value={form.ownerName} onChange={set('ownerName')} />}
        </Field>
        <Field label="Owner’s phone number" error={errors['owner.phone']} hint="They log in with this number">
          {(p) => <input {...p} type="tel" inputMode="tel" placeholder="024 123 4567" value={form.ownerPhone} onChange={set('ownerPhone')} />}
        </Field>
        <Field label="Temporary password" error={errors['owner.password']} hint="At least 8 characters. They choose their own at first login. Not needed if they already have an account.">
          {(p) => <input {...p} value={form.ownerPassword} onChange={set('ownerPassword')} autoComplete="off" />}
        </Field>

        <Field label="Language they prefer" hint="The app and guides open in this language">
          {(p) => (
            <select {...p} value={form.ownerLanguage} onChange={set('ownerLanguage')}>
              {LANGUAGES.map((c) => <option key={c} value={c}>{t(`lang.${c}`)}</option>)}
            </select>
          )}
        </Field>

        <h2>Where the money is kept</h2>
        <label className="option toggle">
          <input type="checkbox" checked={form.withMoney} onChange={set('withMoney')} />
          Enter today&rsquo;s balances now (I am with the owner)
        </label>
        {form.withMoney
          ? <MoneyFields form={form} set={set} errors={errors} />
          : <p className="muted small">The owner counts the money and enters it the first time they log in.</p>}

        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Set up the business'}</button>
      </form>
    </main>
  );
}
