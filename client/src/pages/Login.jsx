import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT } from '../i18n.jsx';
import { Field, FormError } from '../components.jsx';
import LanguageSwitch from '../LanguageSwitch.jsx';

export default function Login() {
  const { signIn } = useSession();
  const { t } = useT();
  const [form, setForm] = useState({ phone: '', password: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    try {
      signIn(await api('/auth/login', { method: 'POST', body: form }));
    } catch (err) {
      setErrors(err.fields || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <main className="screen auth">
      <LanguageSwitch />
      <div className="brand-mark" aria-hidden="true" />
      <h1>{t('login.title')}</h1>
      <p className="lead">{t('login.lead')}</p>
      <form onSubmit={submit} className="stack" noValidate>
        <FormError message={message} />
        <Field label={t('login.phone')} error={errors.phone}>
          {(p) => <input {...p} type="tel" inputMode="tel" autoComplete="tel" placeholder="024 123 4567"
            value={form.phone} onChange={set('phone')} required />}
        </Field>
        <Field label={t('login.password')} error={errors.password}>
          {(p) => <input {...p} type="password" autoComplete="current-password"
            value={form.password} onChange={set('password')} required />}
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('login.busy') : t('login.submit')}</button>
      </form>
      <p className="switch">{t('login.new')} <Link to="/signup">{t('login.create')}</Link></p>
    </main>
  );
}
