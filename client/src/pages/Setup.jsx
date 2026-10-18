import { useState } from 'react';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { FormError } from '../components.jsx';
import { useT } from '../i18n.jsx';
import LanguageSwitch from '../LanguageSwitch.jsx';
import { emptyMoney, moneyBody, MoneyFields, setter } from '../businessForm.jsx';

// The owner's first step on a business the admin created: where the money is kept today.
export default function Setup() {
  const { user, business, updateBusiness, logout } = useSession();
  const { t } = useT();
  const [form, setForm] = useState(emptyMoney);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = setter(form, setForm);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErrors({}); setMessage('');
    try {
      const d = await api(`/businesses/${business.id}/setup`, { method: 'POST', body: moneyBody(form) });
      updateBusiness({ ...business, setupDone: d.business.setupDone });
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
        <LanguageSwitch />
        <button type="button" className="btn-link" onClick={logout}>{t('setup.logout')}</button>
      </header>
      <h1>{business.name}</h1>
      <p className="lead">{t('setup.moneyLead', { name: user.fullName.split(' ')[0] })}</p>
      <form onSubmit={submit} className="stack" noValidate>
        <FormError message={message} />
        <h2>{t('setup.money')}</h2>
        <MoneyFields form={form} set={set} errors={errors} />
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? t('common.saving') : t('setup.submit')}
        </button>
      </form>
    </main>
  );
}
