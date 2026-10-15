import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { useT, UI_LANGUAGES } from '../i18n.jsx';
import { Field, FormError } from '../components.jsx';
import LanguageSwitch from '../LanguageSwitch.jsx';

const LANGUAGES = ['en', 'tw', 'ee', 'gaa', 'dag', 'ha'];

export default function Signup() {
  const { signIn } = useSession();
  const { t, lang, setLanguage } = useT();
  const [form, setForm] = useState({ fullName: '', phone: '', password: '' });
  const [preferredLanguage, setPreferredLanguage] = useState(lang);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    try {
      signIn(await api('/auth/signup', { method: 'POST', body: { ...form, preferredLanguage } }));
    } catch (err) {
      setErrors(err.fields || {});
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function chooseLanguage(code) {
    setPreferredLanguage(code);
    // Switch the screen straight away when we have that language.
    if (UI_LANGUAGES.includes(code)) setLanguage(code);
  }

  return (
    <main className="screen auth">
      <LanguageSwitch />
      <div className="brand-mark" aria-hidden="true" />
      <h1>{t('signup.title')}</h1>
      <p className="lead">{t('signup.lead')}</p>
      <form onSubmit={submit} className="stack" noValidate>
        <FormError message={message} />
        <Field label={t('signup.name')} error={errors.fullName}>
          {(p) => <input {...p} autoComplete="name" value={form.fullName} onChange={set('fullName')} required />}
        </Field>
        <Field label={t('login.phone')} error={errors.phone} hint={t('signup.phoneHint')}>
          {(p) => <input {...p} type="tel" inputMode="tel" autoComplete="tel" placeholder="024 123 4567"
            value={form.phone} onChange={set('phone')} required />}
        </Field>
        <Field label={t('signup.password')} error={errors.password} hint={t('signup.passwordHint')}>
          {(p) => <input {...p} type="password" autoComplete="new-password"
            value={form.password} onChange={set('password')} required minLength={8} />}
        </Field>
        <Field label={t('signup.language')} error={errors.preferredLanguage}>
          {(p) => (
            <select {...p} value={preferredLanguage} onChange={(e) => chooseLanguage(e.target.value)}>
              {LANGUAGES.map((code) => <option key={code} value={code}>{t(`lang.${code}`)}</option>)}
            </select>
          )}
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? t('signup.busy') : t('signup.submit')}</button>
      </form>
      <p className="switch">{t('signup.have')} <Link to="/login">{t('signup.login')}</Link></p>
    </main>
  );
}
