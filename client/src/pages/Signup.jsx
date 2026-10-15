import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session.jsx';
import { Field, FormError } from '../components.jsx';

const LANGUAGES = [
  ['en', 'English'], ['tw', 'Twi'], ['ee', 'Ewe'], ['gaa', 'Ga'], ['dag', 'Dagbani'], ['ha', 'Hausa'],
];

export default function Signup() {
  const { signIn } = useSession();
  const [form, setForm] = useState({ fullName: '', phone: '', password: '', preferredLanguage: 'en' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    try {
      signIn(await api('/auth/signup', { method: 'POST', body: form }));
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
      <div className="brand-mark" aria-hidden="true" />
      <h1>Create your account</h1>
      <p className="lead">Free tools and guides to help your business grow.</p>
      <form onSubmit={submit} className="stack" noValidate>
        <FormError message={message} />
        <Field label="Your full name" error={errors.fullName}>
          {(p) => <input {...p} autoComplete="name" value={form.fullName} onChange={set('fullName')} required />}
        </Field>
        <Field label="Phone number" error={errors.phone} hint="You will use this to log in.">
          {(p) => <input {...p} type="tel" inputMode="tel" autoComplete="tel" placeholder="024 123 4567"
            value={form.phone} onChange={set('phone')} required />}
        </Field>
        <Field label="Choose a password" error={errors.password} hint="At least 8 characters.">
          {(p) => <input {...p} type="password" autoComplete="new-password"
            value={form.password} onChange={set('password')} required minLength={8} />}
        </Field>
        <Field label="Language you prefer" error={errors.preferredLanguage}>
          {(p) => (
            <select {...p} value={form.preferredLanguage} onChange={set('preferredLanguage')}>
              {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          )}
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="switch">Already have an account? <Link to="/login">Log in</Link></p>
    </main>
  );
}
